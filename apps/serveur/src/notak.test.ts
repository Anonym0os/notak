import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'
import { lireEtat } from './contenu.ts'
import { decoderNotak } from './copie.ts'

let m: Monde
let ana: Compte
let bob: Compte
let png: Uint8Array
let idPng: string

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  png = new Uint8Array([137, 80, 78, 71, 9, 9])
  idPng = ((await (await m.appeler('/api/fichiers', { compte: ana, corps: png, type: 'image/png' })).json()) as { id: string }).id
  m.tableau(ana, 'tableau-prive', 'Privé')
  m.tableau(ana, 'tableau-fille', 'Fille', (doc) => poser(doc, { type: 'image', fichier: idPng, largeurOrigine: 1, hauteurOrigine: 1, typeMime: 'image/png' }))
  m.tableau(ana, 'tableau-tete', 'Tête', (doc) => {
    poser(doc, { type: 'note', texte: texte('Bonjour') })
    poser(doc, { type: 'tableau', cible: 'tableau-fille' }, { y: 10 })
    poser(doc, { type: 'tableau', cible: 'tableau-prive' }, { y: 20 })
    poser(doc, { type: 'note', texte: texte('jetée') }, { y: 30, corbeille: 1 })
  })
  m.base.definirAcces({ tableau: 'tableau-tete', utilisateur: bob.utilisateur.id, role: 'lecture' })
  m.base.definirAcces({ tableau: 'tableau-fille', utilisateur: bob.utilisateur.id, role: 'lecture' })
})
afterAll(() => m.fermer())

describe('GET /api/tableaux/:id/notak', () => {
  it('le tableau, ses sous-tableaux rangés sous lui, et ses fichiers', async () => {
    const r = await m.appeler('/api/tableaux/tableau-tete/notak', { compte: ana })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/x-notak')
    expect(r.headers.get('content-disposition')).toContain('.notak')
    const a = decoderNotak(new Uint8Array(await r.arrayBuffer()))
    expect(a.racine).toBe('tableau-tete')
    expect(a.tableaux.map((t) => [t.titre, t.parent])).toEqual([
      ['Tête', undefined],
      ['Fille', 'tableau-tete'],
      ['Privé', 'tableau-tete'],
    ])
    // L'état Yjs entier voyage : la corbeille avec, comme dans toute copie.
    expect(lireEtat(a.tableaux[0]!.etat).elements).toHaveLength(4)
    expect(a.fichiers).toEqual([{ id: idPng, type: 'image/png', octets: png }])
  })

  it('sans sous-tableaux ni fichiers, si on le demande', async () => {
    const r = await m.appeler('/api/tableaux/tableau-tete/notak?sousTableaux=0&fichiers=0', { compte: ana })
    const a = decoderNotak(new Uint8Array(await r.arrayBuffer()))
    expect(a.tableaux.map((t) => t.id)).toEqual(['tableau-tete'])
    expect(a.fichiers).toEqual([])
  })

  it('un sous-tableau qu’on ne peut pas ouvrir reste dehors', async () => {
    const r = await m.appeler('/api/tableaux/tableau-tete/notak', { compte: bob })
    const a = decoderNotak(new Uint8Array(await r.arrayBuffer()))
    expect(a.tableaux.map((t) => t.titre)).toEqual(['Tête', 'Fille'])
  })

  it('sans session 401, sans droit 404', async () => {
    expect((await m.appeler('/api/tableaux/tableau-tete/notak')).status).toBe(401)
    expect((await m.appeler('/api/tableaux/tableau-prive/notak', { compte: bob })).status).toBe(404)
  })
})

describe('GET /api/image-distante', () => {
  it('refuse sans session, sans adresse, et une adresse privée', async () => {
    expect((await m.appeler('/api/image-distante?url=https%3A%2F%2Fexemple.fr%2Fa.png')).status).toBe(401)
    expect((await m.appeler('/api/image-distante', { compte: ana })).status).toBe(400)
    expect((await m.appeler('/api/image-distante?url=http%3A%2F%2F127.0.0.1%2Fa.png', { compte: ana })).status).toBe(422)
  })
})
