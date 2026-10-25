import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ouvrirBase } from './base.ts'
import { type Cle, ErreurChiffrement, estChiffre } from './chiffrement.ts'
import { monde, texte } from './essai.ts'
import { demarrer } from './serveur.ts'
import { creerHocuspocus, nomDuDocument } from './synchro.ts'

// Un serveur qui a reçu une clé : ce qu'on écrit par la synchro et ce qu'on dépose n'est plus lisible sur le disque,
// et tout se relit comme avant par l'API.

const nouvelleCle = (): Cle => ({ id: 1, secret: randomBytes(32) })
const contient = (meule: Uint8Array, aiguille: string) => Buffer.from(meule).includes(Buffer.from(aiguille))

const dossiers: string[] = []
const dossierNeuf = () => {
  const d = mkdtempSync(join(tmpdir(), 'notak-chiffre-'))
  dossiers.push(d)
  return d
}
afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('le serveur chiffré au repos', () => {
  it('une note écrite par la synchro : le blob en base ne contient plus son texte, et la note se relit', async () => {
    const cle = nouvelleCle()
    const chemin = join(dossierNeuf(), 'notak.db')
    const base = ouvrirBase(chemin, cle)
    base.creerUtilisateur({ id: 'u1', email: 'a@exemple.fr', nom: 'Ana', hash: 'x', couleur: '#000000', racine: 'racine-1' })
    base.creerTableau({ id: 'tableau-chiffre-1', titre: '', proprietaire: 'u1', parent: null })
    const synchro = creerHocuspocus(base)

    const connexion = await synchro.openDirectConnection(nomDuDocument('tableau-chiffre-1'))
    await connexion.transact((doc) => {
      doc.getMap('elements').set('e1', { id: 'e1', x: 0, y: 0, largeur: 34, plan: 'a', contenu: { type: 'note', texte: texte('Pamplemousses roses') } })
    })
    await connexion.disconnect()
    synchro.flushPendingStores()

    const brut = new DatabaseSync(chemin, { readOnly: true })
    const { etat } = brut.prepare('SELECT etat FROM documents WHERE nom = ?').get(nomDuDocument('tableau-chiffre-1')) as { etat: Uint8Array }
    brut.close()
    expect(estChiffre(etat)).toBe(true)
    expect(contient(etat, 'Pamplemousses')).toBe(false)

    // La recherche, elle, continue de trouver la note : l'index reste en clair, c'est le prix de la recherche.
    expect(base.chercher('"pamplemousses"*', ['tableau-chiffre-1'], 5)).toMatchObject([{ element: 'e1' }])
    // Une seconde synchro relit le document déchiffré.
    const relu = creerHocuspocus(base)
    const lecture = await relu.openDirectConnection(nomDuDocument('tableau-chiffre-1'))
    let note: unknown
    await lecture.transact((doc) => void (note = doc.getMap('elements').get('e1')))
    expect(JSON.stringify(note)).toContain('Pamplemousses roses')
    await lecture.disconnect()
    base.fermer()
  })

  it('une image déposée est chiffrée sur le disque, se relit, se réduit et s’exporte', async () => {
    const m = monde({ cle: nouvelleCle() })
    try {
      const ana = await m.compte('Ana')
      const image = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#3366cc' } })
        .jpeg()
        .withMetadata({ exif: { IFD0: { ImageDescription: 'Pamplemousses' } } })
        .toBuffer()
      const depot = await m.appeler('/api/fichiers', { compte: ana, corps: new Uint8Array(image), type: 'image/jpeg' })
      expect(depot.status).toBe(201)
      const { id } = (await depot.json()) as { id: string }

      const surDisque = readFileSync(join(m.dossier, 'fichiers', id))
      expect(estChiffre(surDisque)).toBe(true)
      expect(contient(image, 'Pamplemousses')).toBe(true)
      expect(contient(surDisque, 'Pamplemousses')).toBe(false)

      const lu = await m.appeler(`/api/fichiers/${id}`, { compte: ana })
      expect(lu.status).toBe(200)
      expect(lu.headers.get('content-length')).toBe(String(image.length))
      expect(Buffer.from(await lu.arrayBuffer()).equals(image)).toBe(true)

      // La copie réduite est gardée chiffrée elle aussi, et se relit à la seconde demande.
      const reduite = Buffer.from(await (await m.appeler(`/api/fichiers/${id}?l=400`, { compte: ana })).arrayBuffer())
      expect((await sharp(reduite).metadata()).width).toBe(400)
      expect(estChiffre(readFileSync(join(m.dossier, 'fichiers', `${id}.400`)))).toBe(true)
      expect(Buffer.from(await (await m.appeler(`/api/fichiers/${id}?l=400`, { compte: ana })).arrayBuffer()).equals(reduite)).toBe(true)
      expect(readdirSync(join(m.dossier, 'fichiers')).filter((n) => n.endsWith('.tmp'))).toEqual([])

      // L'archive des médias emporte l'image en clair.
      m.tableau(ana, 'tableau-chiffre-2', 'Photos', (doc) => {
        doc.getMap('elements').set('i1', { id: 'i1', x: 0, y: 0, largeur: 34, plan: 'a', contenu: { type: 'image', fichier: id } })
      })
      const archive = Buffer.from(await (await m.appeler('/api/tableaux/tableau-chiffre-2/medias', { compte: ana })).arrayBuffer())
      expect(archive.includes(image.subarray(0, 64))).toBe(true)
    } finally {
      m.fermer()
    }
  })

  it('redémarré avec une clé fausse, le serveur refuse de démarrer', async () => {
    const dossier = dossierNeuf()
    const cle = nouvelleCle()
    const premier = await demarrer({ port: 0, dossier, cle })
    await premier.fermer()
    const base = ouvrirBase(join(dossier, 'notak.db'), cle)
    base.enregistrerDocument('tableau:a', Y.encodeStateAsUpdate(new Y.Doc()))
    base.fermer()

    await expect(demarrer({ port: 0, dossier, cle: nouvelleCle() })).rejects.toThrow(ErreurChiffrement)
    await expect(demarrer({ port: 0, dossier })).rejects.toThrow(ErreurChiffrement)
    const encore = await demarrer({ port: 0, dossier, cle })
    await encore.fermer()
  })
})
