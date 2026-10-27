import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { instanceDe } from './instance.ts'
import { openfgaEssai } from './essai.ts'
import { creerVerificateur } from './misesAJour.ts'
import { type ServeurDemarre, demarrer } from './serveur.ts'
import { VERSION_NOTAK } from '../../../packages/tableau/src/version.ts'

const habillage = (id: string, nom: string) => JSON.stringify({ notak: 'habillage', version: 1, id, nom, rayons: { panneau: 20 } })

let dossier: string
beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), 'notak-instance-'))
  mkdirSync(join(dossier, 'habillages'))
  writeFileSync(join(dossier, 'habillages', 'silak.json'), habillage('silak', 'Silak'))
  writeFileSync(join(dossier, 'habillages', 'abime.json'), '{ "notak": "habillage", "version": 1, "id": "x;}", "nom": "X" }')
  writeFileSync(join(dossier, 'habillages', 'notes.txt'), 'pas un thème')
})
afterAll(() => rmSync(dossier, { recursive: true, force: true }))

describe('l’instance que décrit l’environnement', () => {
  it('sans rien : Notak, inscriptions ouvertes, pas de thème', () => {
    expect(instanceDe({}, join(dossier, 'vide'), () => {})).toEqual({ nom: 'Notak', inscriptions: 'ouvertes', habillages: [] })
  })

  it('lit le nom, les inscriptions et les thèmes du dossier ; un fichier refusé est signalé, sans arrêter', () => {
    const signales: string[] = []
    const i = instanceDe({ NOTAK_NOM: 'Silak', NOTAK_INSCRIPTIONS: 'fermees', NOTAK_HABILLAGE: 'silak' }, dossier, (m) => signales.push(m))
    expect(i).toMatchObject({ nom: 'Silak', inscriptions: 'fermees', impose: 'silak' })
    expect(i.habillages.map((h) => h.id)).toEqual(['silak'])
    expect(signales).toEqual(['Notak : habillage abime.json refusé (valeur : id)'])
  })

  it('oublie un thème imposé qui n’existe pas, et une valeur d’inscription inconnue', () => {
    const signales: string[] = []
    const i = instanceDe({ NOTAK_HABILLAGE_DEFAUT: 'absent', NOTAK_INSCRIPTIONS: 'peut-etre' }, dossier, (m) => signales.push(m))
    expect(i.parDefaut).toBeUndefined()
    expect(i.inscriptions).toBe('ouvertes')
    expect(signales).toHaveLength(3)
  })

  it('dit l’adresse publique : NOTAK_ADRESSE_PUBLIQUE d’abord, sinon NOTAK_ORIGINE, réduite à son origine', () => {
    const vide = join(dossier, 'vide')
    expect(instanceDe({ NOTAK_ORIGINE: 'https://notak.exemple.fr/' }, vide, () => {}).adresse).toBe('https://notak.exemple.fr')
    expect(instanceDe({ NOTAK_ORIGINE: 'https://notak.exemple.fr', NOTAK_ADRESSE_PUBLIQUE: 'http://mac.local:3005/x' }, vide, () => {}).adresse).toBe('http://mac.local:3005')
  })

  it('ignore une adresse publique qui n’est pas en http ou https, et le signale', () => {
    const signales: string[] = []
    const i = instanceDe({ NOTAK_ADRESSE_PUBLIQUE: 'mac.local:3005', NOTAK_ORIGINE: 'ftp://x' }, join(dossier, 'vide'), (m) => signales.push(m))
    expect(i.adresse).toBeUndefined()
    expect(signales).toHaveLength(2)
  })
})

describe('une instance aux inscriptions fermées', () => {
  let serveur: ServeurDemarre
  let origine: string
  beforeAll(async () => {
    serveur = await demarrer({ port: 0, dossier: join(dossier, 'donnees'), secret: 'un-secret-d-essai-assez-long-pour-better-auth', openfga: openfgaEssai(), instance: instanceDe({ NOTAK_NOM: 'Silak', NOTAK_INSCRIPTIONS: 'fermees', NOTAK_HABILLAGE_DEFAUT: 'silak' }, dossier, () => {}) })
    origine = `http://localhost:${serveur.port}`
  })
  afterAll(() => serveur.fermer())

  it('se décrit sans compte, thèmes compris', async () => {
    const r = await fetch(`${origine}/api/instance`)
    expect(r.status).toBe(200)
    const i = (await r.json()) as { nom: string; inscriptions: string; parDefaut: string; habillages: { id: string; rayons: object }[] }
    expect(i).toMatchObject({ nom: 'Silak', inscriptions: 'fermees', parDefaut: 'silak' })
    expect(i.habillages).toEqual([{ id: 'silak', nom: 'Silak', rayons: { panneau: 20 } }])
  })

  it('refuse une inscription avec un code stable', async () => {
    const r = await fetch(`${origine}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { origin: origine, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@exemple.fr', password: 'motdepasse', name: 'Ana' }),
    })
    expect(r.status).toBe(403)
    expect(await r.json()).toMatchObject({ code: 'INSCRIPTIONS_FERMEES' })
  })
})

describe('ce que le serveur dit de lui-même, et à ses admins', () => {
  let serveur: ServeurDemarre
  let origine: string
  // Le GitHub d'essai annonce une version plus récente que celle qui tourne.
  const plusRecente = `${Number(VERSION_NOTAK.split('.')[0]) + 1}.0.0`
  const misesAJour = creerVerificateur({
    actuelle: VERSION_NOTAK,
    active: true,
    programmer: false,
    journal: () => {},
    maintenant: () => 1_700_000_000_000,
    lire: (async () => new Response(JSON.stringify({ version: plusRecente, notes: '- Du neuf.', pub_date: '2026-10-25T10:00:00Z', platforms: {} }))) as typeof fetch,
  })
  const inscrire = async (email: string, nom: string) => {
    const r = await fetch(`${origine}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { origin: origine, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'motdepasse', name: nom }),
    })
    expect(r.status).toBe(200)
    return r.headers.get('set-cookie')!.split(';')[0]!
  }
  const lire = (chemin: string, cookie?: string) => fetch(origine + chemin, { headers: cookie ? { cookie } : {} })

  beforeAll(async () => {
    serveur = await demarrer({
      port: 0,
      dossier: join(dossier, 'donnees-admin'),
      secret: 'un-secret-d-essai-assez-long-pour-better-auth',
      openfga: openfgaEssai(),
      admins: ['admin@exemple.fr'],
      misesAJour,
    })
    origine = `http://localhost:${serveur.port}`
    await misesAJour.verifier()
  })
  afterAll(() => serveur.fermer())

  it('/api/sante : un serveur Notak, sa version et son adresse, sans compte et jamais gardé en cache', async () => {
    const r = await fetch(`${origine}/api/sante`)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await r.json()).toEqual({ produit: 'notak', version: VERSION_NOTAK, origine, ok: true })
    // Ni compte ni limite : la surveillance du conteneur l'appelle à la chaîne.
    const statuts = await Promise.all(Array.from({ length: 30 }, () => fetch(`${origine}/api/sante`).then((x) => x.status)))
    expect(statuts.every((s) => s === 200)).toBe(true)
  })

  it('/api/instance dit sa version', async () => {
    expect(await (await lire('/api/instance')).json()).toMatchObject({ nom: 'Notak', version: VERSION_NOTAK })
  })

  it('/api/moi dit qui est admin du serveur, d’après NOTAK_ADMINS', async () => {
    const admin = await inscrire('Admin@Exemple.fr', 'Admin')
    const ana = await inscrire('ana@exemple.fr', 'Ana')
    expect(await (await lire('/api/moi', admin)).json()).toMatchObject({ email: 'admin@exemple.fr', admin: true })
    expect(await (await lire('/api/moi', ana)).json()).toMatchObject({ email: 'ana@exemple.fr', admin: false })

    // La mise à jour à faire : aux admins seulement.
    expect((await lire('/api/instance/mise-a-jour')).status).toBe(401)
    expect((await lire('/api/instance/mise-a-jour', ana)).status).toBe(403)
    const r = await lire('/api/instance/mise-a-jour', admin)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.json()).toEqual({
      actuelle: VERSION_NOTAK,
      active: true,
      verifiee: 1_700_000_000_000,
      nouvelle: { version: plusRecente, notes: '- Du neuf.', date: '2026-10-25T10:00:00.000Z', adresse: `https://github.com/Anonym0os/notak/releases/tag/v${plusRecente}` },
    })
  })
})
