import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { instanceDe } from './instance.ts'
import { openfgaEssai } from './essai.ts'
import { type ServeurDemarre, demarrer } from './serveur.ts'

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
