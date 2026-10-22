import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ServeurDemarre, demarrer } from './serveur.ts'

let serveur: ServeurDemarre
let dossier: string
let origine: string

beforeAll(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'notak-essai-'))
  serveur = await demarrer({ port: 0, dossier })
  origine = `http://127.0.0.1:${serveur.port}`
})
afterAll(async () => {
  await serveur.fermer()
  rmSync(dossier, { recursive: true, force: true })
})

type Membre = { email: string; role: string; enAttente?: boolean }
type Tableau = { id: string; titre: string; role: string }
const lire = async <T>(r: { reponse: Response }): Promise<T> => (await r.reponse.json()) as T

async function appeler(chemin: string, options: { methode?: string; cookie?: string; json?: unknown; corps?: Uint8Array; type?: string } = {}) {
  const entetes: Record<string, string> = {}
  if (options.cookie) entetes.cookie = options.cookie
  if (options.json !== undefined) entetes['content-type'] = 'application/json'
  if (options.type) entetes['content-type'] = options.type
  const reponse = await fetch(origine + chemin, {
    method: options.methode ?? (options.json !== undefined || options.corps ? 'POST' : 'GET'),
    headers: entetes,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.corps,
  })
  const cookie = reponse.headers.get('set-cookie')?.split(';')[0]
  return { statut: reponse.status, cookie, reponse }
}

describe('serveur de bout en bout', () => {
  it('inscription, moi, création, partage, liste du second compte', async () => {
    const ana = await appeler('/api/inscription', { json: { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' } })
    expect(ana.statut).toBe(201)
    expect(ana.reponse.headers.get('set-cookie')).toMatch(/HttpOnly.*SameSite=Lax/)
    const moiAna = await lire<{ id: string; racine: string; couleur: string }>(ana)
    expect(moiAna).toMatchObject({ email: 'ana@exemple.fr', nom: 'Ana' })
    expect(moiAna.racine).toBeTruthy()
    expect(moiAna.couleur).toMatch(/^#[0-9a-f]{6}$/)

    expect((await appeler('/api/moi')).statut).toBe(401)
    const moi = await appeler('/api/moi', { cookie: ana.cookie })
    expect(moi.statut).toBe(200)
    expect((await lire<{ id: string }>(moi)).id).toBe(moiAna.id)

    const creation = await appeler('/api/tableaux', { cookie: ana.cookie, json: { id: 'tableau-partage-1', titre: 'Voyage' } })
    expect(creation.statut).toBe(201)

    const bob = await appeler('/api/inscription', { json: { email: 'bob@exemple.fr', motDePasse: 'motdepasse', nom: 'Bob' } })
    expect(bob.statut).toBe(201)
    const avant = await lire<Tableau[]>(await appeler('/api/tableaux', { cookie: bob.cookie }))
    expect(avant).toEqual([])
    expect((await appeler('/api/tableaux/tableau-partage-1/acces', { cookie: bob.cookie })).statut).toBe(404)

    const partage = await appeler('/api/tableaux/tableau-partage-1/partage', { cookie: ana.cookie, json: { email: 'bob@exemple.fr', role: 'lecture' } })
    expect(partage.statut).toBe(200)

    const apres = await lire<Tableau[]>(await appeler('/api/tableaux', { cookie: bob.cookie }))
    expect(apres).toEqual([{ id: 'tableau-partage-1', titre: 'Voyage', role: 'lecture' }])
    // la racine personnelle n'est jamais listée
    const deAna = await lire<Tableau[]>(await appeler('/api/tableaux', { cookie: ana.cookie }))
    expect(deAna.map((t) => t.id)).toEqual(['tableau-partage-1'])

    // un lecteur ne partage pas
    const refus = await appeler('/api/tableaux/tableau-partage-1/partage', { cookie: bob.cookie, json: { email: 'x@exemple.fr', role: 'edition' } })
    expect(refus.statut).toBe(403)

    const acces = await lire<Membre[]>(await appeler('/api/tableaux/tableau-partage-1/acces', { cookie: bob.cookie }))
    expect(acces.map((a) => [a.email, a.role]).sort()).toEqual([
      ['ana@exemple.fr', 'proprietaire'],
      ['bob@exemple.fr', 'lecture'],
    ])

    // le dernier propriétaire ne se retire pas
    const retrait = await appeler('/api/tableaux/tableau-partage-1/partage', { methode: 'DELETE', cookie: ana.cookie, json: { email: 'ana@exemple.fr' } })
    expect(retrait.statut).toBe(409)
  })

  it('une invitation vers une adresse inconnue s’active à l’inscription', async () => {
    const ana = await appeler('/api/connexion', { json: { email: 'ana@exemple.fr', motDePasse: 'motdepasse' } })
    expect(ana.statut).toBe(200)
    await appeler('/api/tableaux', { cookie: ana.cookie, json: { id: 'tableau-invite-1', titre: 'Invité' } })
    const p = await appeler('/api/tableaux/tableau-invite-1/partage', { cookie: ana.cookie, json: { email: 'Cleo@Exemple.fr', role: 'edition' } })
    expect((await lire<Membre>(p)).enAttente).toBe(true)
    const attente = await lire<Membre[]>(await appeler('/api/tableaux/tableau-invite-1/acces', { cookie: ana.cookie }))
    expect(attente.some((a) => a.email === 'cleo@exemple.fr' && a.enAttente)).toBe(true)

    const cleo = await appeler('/api/inscription', { json: { email: 'cleo@exemple.fr', motDePasse: 'motdepasse', nom: 'Cléo' } })
    const liste = await lire<Tableau[]>(await appeler('/api/tableaux', { cookie: cleo.cookie }))
    expect(liste).toEqual([{ id: 'tableau-invite-1', titre: 'Invité', role: 'edition' }])
  })

  it('un tableau sous un parent éditable en hérite les accès, présents et à venir', async () => {
    const ana = await appeler('/api/connexion', { json: { email: 'ana@exemple.fr', motDePasse: 'motdepasse' } })
    const bob = await appeler('/api/connexion', { json: { email: 'bob@exemple.fr', motDePasse: 'motdepasse' } })
    await appeler('/api/tableaux/tableau-invite-1/partage', { cookie: ana.cookie, json: { email: 'bob@exemple.fr', role: 'edition' } })
    const fils = await appeler('/api/tableaux', { cookie: bob.cookie, json: { id: 'tableau-fils-0001', titre: 'Fils', parent: 'tableau-invite-1' } })
    expect(fils.statut).toBe(201)
    const membres = await lire<(Membre & { herite?: boolean })[]>(await appeler('/api/tableaux/tableau-fils-0001/acces', { cookie: ana.cookie }))
    expect(membres.find((m) => m.email === 'ana@exemple.fr')).toMatchObject({ role: 'proprietaire', herite: true })
    expect(membres.find((m) => m.email === 'bob@exemple.fr')).toMatchObject({ role: 'proprietaire', herite: false })

    // retirer l'accès au parent le retire aussi du fils
    const cleoAvant = await appeler('/api/connexion', { json: { email: 'cleo@exemple.fr', motDePasse: 'motdepasse' } })
    expect((await appeler('/api/tableaux/tableau-fils-0001/acces', { cookie: cleoAvant.cookie })).statut).toBe(200)
    await appeler('/api/tableaux/tableau-invite-1/partage', { methode: 'DELETE', cookie: ana.cookie, json: { email: 'cleo@exemple.fr' } })
    expect((await appeler('/api/tableaux/tableau-fils-0001/acces', { cookie: cleoAvant.cookie })).statut).toBe(404)
    // un id pris par un autre
    expect((await appeler('/api/tableaux', { cookie: ana.cookie, json: { id: 'tableau-fils-0001', titre: 'X' } })).statut).toBe(201)
    const cleo = await appeler('/api/connexion', { json: { email: 'cleo@exemple.fr', motDePasse: 'motdepasse' } })
    expect((await appeler('/api/tableaux', { cookie: cleo.cookie, json: { id: 'tableau-partage-1', titre: 'X' } })).statut).toBe(409)
  })

  it('la connexion ne dit pas ce qui est faux', async () => {
    const mauvaisMot = await appeler('/api/connexion', { json: { email: 'ana@exemple.fr', motDePasse: 'faux-faux-faux' } })
    const inconnue = await appeler('/api/connexion', { json: { email: 'personne@exemple.fr', motDePasse: 'faux-faux-faux' } })
    expect(mauvaisMot.statut).toBe(401)
    expect(inconnue.statut).toBe(401)
    expect(await mauvaisMot.reponse.json()).toEqual(await inconnue.reponse.json())
  })

  it('une adresse prise répond 409, la déconnexion efface la session', async () => {
    const encore = await appeler('/api/inscription', { json: { email: 'ana@exemple.fr', motDePasse: 'motdepasse', nom: 'Ana' } })
    expect(encore.statut).toBe(409)
    const ana = await appeler('/api/connexion', { json: { email: 'ana@exemple.fr', motDePasse: 'motdepasse' } })
    const sortie = await appeler('/api/deconnexion', { methode: 'POST', cookie: ana.cookie })
    expect(sortie.statut).toBe(204)
    expect((await appeler('/api/moi', { cookie: ana.cookie })).statut).toBe(401)
  })

  it('les fichiers : dépôt, lecture, refus sans session', async () => {
    const ana = await appeler('/api/connexion', { json: { email: 'ana@exemple.fr', motDePasse: 'motdepasse' } })
    const octets = new Uint8Array([1, 2, 3, 4, 5])
    expect((await appeler('/api/fichiers', { corps: octets, type: 'image/png' })).statut).toBe(401)
    const depot = await appeler('/api/fichiers', { cookie: ana.cookie, corps: octets, type: 'image/png' })
    expect(depot.statut).toBe(201)
    const { id } = await lire<{ id: string }>(depot)
    expect((await appeler(`/api/fichiers/${id}`)).statut).toBe(401)
    const lu = await appeler(`/api/fichiers/${id}`, { cookie: ana.cookie })
    expect(lu.reponse.headers.get('content-type')).toBe('image/png')
    expect(lu.reponse.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(new Uint8Array(await lu.reponse.arrayBuffer())).toEqual(octets)
    expect((await appeler('/api/fichiers/../../etc/passwd', { cookie: ana.cookie })).statut).toBe(404)
  })

  it('l’aperçu refuse le réseau local', async () => {
    const ana = await appeler('/api/connexion', { json: { email: 'ana@exemple.fr', motDePasse: 'motdepasse' } })
    expect((await appeler('/api/apercu', { cookie: ana.cookie })).statut).toBe(400)
    expect((await appeler(`/api/apercu?url=${encodeURIComponent('http://127.0.0.1:1/')}`, { cookie: ana.cookie })).statut).toBe(502)
  })

  it('la onzième tentative de connexion de la minute est limitée', async () => {
    let dernier = 0
    for (let i = 0; i < 12; i++) dernier = (await appeler('/api/connexion', { json: { email: 'x@exemple.fr', motDePasse: 'faux-faux-faux' } })).statut
    expect(dernier).toBe(429)
  })
})
