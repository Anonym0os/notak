import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ServeurDemarre, demarrer } from './serveur.ts'

const SECRET = 'un-secret-d-essai-assez-long-pour-better-auth'

let serveur: ServeurDemarre
let dossier: string
let origine: string

beforeAll(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'notak-essai-'))
  serveur = await demarrer({ port: 0, dossier, secret: SECRET })
  // L'adresse publique par défaut du serveur : Better Auth n'accepte que les appels qui en viennent.
  origine = `http://localhost:${serveur.port}`
})
afterAll(async () => {
  await serveur.fermer()
  rmSync(dossier, { recursive: true, force: true })
})

type Membre = { email: string; role: string; enAttente?: boolean }
type Tableau = { id: string; titre: string; role: string }
const lire = async <T>(r: { reponse: Response }): Promise<T> => (await r.reponse.json()) as T

async function appeler(chemin: string, options: { methode?: string; cookie?: string; json?: unknown; corps?: Uint8Array; type?: string } = {}) {
  const entetes: Record<string, string> = { origin: origine }
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
    const ana = await appeler('/api/auth/sign-up/email', { json: { email: 'ana@exemple.fr', password: 'motdepasse', name: 'Ana' } })
    expect(ana.statut).toBe(200)
    expect(ana.reponse.headers.get('set-cookie')).toMatch(/^notak\.session_token=.*HttpOnly.*SameSite=Lax/i)
    const moiAna = await lire<{ id: string; racine: string; couleur: string }>(await appeler('/api/moi', { cookie: ana.cookie }))
    expect(moiAna).toMatchObject({ email: 'ana@exemple.fr', nom: 'Ana' })
    expect(moiAna.racine).toBeTruthy()
    expect(moiAna.couleur).toMatch(/^#[0-9a-f]{6}$/)

    expect((await appeler('/api/moi')).statut).toBe(401)
    const moi = await appeler('/api/moi', { cookie: ana.cookie })
    expect(moi.statut).toBe(200)
    expect((await lire<{ id: string }>(moi)).id).toBe(moiAna.id)

    const creation = await appeler('/api/tableaux', { cookie: ana.cookie, json: { id: 'tableau-partage-1', titre: 'Voyage' } })
    expect(creation.statut).toBe(201)

    const bob = await appeler('/api/auth/sign-up/email', { json: { email: 'bob@exemple.fr', password: 'motdepasse', name: 'Bob' } })
    expect(bob.statut).toBe(200)
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
    const ana = await appeler('/api/auth/sign-in/email', { json: { email: 'ana@exemple.fr', password: 'motdepasse' } })
    expect(ana.statut).toBe(200)
    await appeler('/api/tableaux', { cookie: ana.cookie, json: { id: 'tableau-invite-1', titre: 'Invité' } })
    const p = await appeler('/api/tableaux/tableau-invite-1/partage', { cookie: ana.cookie, json: { email: 'Cleo@Exemple.fr', role: 'edition' } })
    expect((await lire<Membre>(p)).enAttente).toBe(true)
    const attente = await lire<Membre[]>(await appeler('/api/tableaux/tableau-invite-1/acces', { cookie: ana.cookie }))
    expect(attente.some((a) => a.email === 'cleo@exemple.fr' && a.enAttente)).toBe(true)

    const cleo = await appeler('/api/auth/sign-up/email', { json: { email: 'cleo@exemple.fr', password: 'motdepasse', name: 'Cléo' } })
    const liste = await lire<Tableau[]>(await appeler('/api/tableaux', { cookie: cleo.cookie }))
    expect(liste).toEqual([{ id: 'tableau-invite-1', titre: 'Invité', role: 'edition' }])
  })

  it('un tableau sous un parent éditable en hérite les accès, présents et à venir', async () => {
    const ana = await appeler('/api/auth/sign-in/email', { json: { email: 'ana@exemple.fr', password: 'motdepasse' } })
    const bob = await appeler('/api/auth/sign-in/email', { json: { email: 'bob@exemple.fr', password: 'motdepasse' } })
    await appeler('/api/tableaux/tableau-invite-1/partage', { cookie: ana.cookie, json: { email: 'bob@exemple.fr', role: 'edition' } })
    const fils = await appeler('/api/tableaux', { cookie: bob.cookie, json: { id: 'tableau-fils-0001', titre: 'Fils', parent: 'tableau-invite-1' } })
    expect(fils.statut).toBe(201)
    const membres = await lire<(Membre & { herite?: boolean })[]>(await appeler('/api/tableaux/tableau-fils-0001/acces', { cookie: ana.cookie }))
    expect(membres.find((m) => m.email === 'ana@exemple.fr')).toMatchObject({ role: 'proprietaire', herite: true })
    expect(membres.find((m) => m.email === 'bob@exemple.fr')).toMatchObject({ role: 'proprietaire', herite: false })

    // retirer l'accès au parent le retire aussi du fils
    const cleoAvant = await appeler('/api/auth/sign-in/email', { json: { email: 'cleo@exemple.fr', password: 'motdepasse' } })
    expect((await appeler('/api/tableaux/tableau-fils-0001/acces', { cookie: cleoAvant.cookie })).statut).toBe(200)
    await appeler('/api/tableaux/tableau-invite-1/partage', { methode: 'DELETE', cookie: ana.cookie, json: { email: 'cleo@exemple.fr' } })
    expect((await appeler('/api/tableaux/tableau-fils-0001/acces', { cookie: cleoAvant.cookie })).statut).toBe(404)
    // un id pris par un autre
    expect((await appeler('/api/tableaux', { cookie: ana.cookie, json: { id: 'tableau-fils-0001', titre: 'X' } })).statut).toBe(201)
    const cleo = await appeler('/api/auth/sign-in/email', { json: { email: 'cleo@exemple.fr', password: 'motdepasse' } })
    expect((await appeler('/api/tableaux', { cookie: cleo.cookie, json: { id: 'tableau-partage-1', titre: 'X' } })).statut).toBe(409)
  })

  it('la connexion ne dit pas ce qui est faux', async () => {
    const mauvaisMot = await appeler('/api/auth/sign-in/email', { json: { email: 'ana@exemple.fr', password: 'faux-faux-faux' } })
    const inconnue = await appeler('/api/auth/sign-in/email', { json: { email: 'personne@exemple.fr', password: 'faux-faux-faux' } })
    expect(mauvaisMot.statut).toBe(401)
    expect(inconnue.statut).toBe(401)
    const corps = await mauvaisMot.reponse.json()
    expect(corps).toEqual(await inconnue.reponse.json())
    expect(corps).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' })
  })

  it('chaque refus porte un code stable en plus de son message', async () => {
    const sans = await appeler('/api/moi')
    expect(sans.statut).toBe(401)
    expect(await sans.reponse.json()).toEqual({ erreur: 'non connecté', code: 'non_connecte' })
    const adresse = await appeler('/api/auth/sign-up/email', { json: { email: 'pas-une-adresse', password: 'motdepasse', name: 'Ana' } })
    expect(adresse.statut).toBe(400)
    expect(await adresse.reponse.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    const court = await appeler('/api/auth/sign-up/email', { json: { email: 'court@exemple.fr', password: 'abc', name: 'Ana' } })
    expect(await court.reponse.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    const sansNom = await appeler('/api/auth/sign-up/email', { json: { email: 'nom@exemple.fr', password: 'motdepasse', name: '   ' } })
    expect(sansNom.statut).toBe(400)
  })

  it('une adresse prise est refusée, la déconnexion efface la session', async () => {
    const encore = await appeler('/api/auth/sign-up/email', { json: { email: 'ana@exemple.fr', password: 'motdepasse', name: 'Ana' } })
    expect(encore.statut).toBe(422)
    expect(await encore.reponse.json()).toMatchObject({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })
    const ana = await appeler('/api/auth/sign-in/email', { json: { email: 'ana@exemple.fr', password: 'motdepasse' } })
    const sortie = await appeler('/api/auth/sign-out', { methode: 'POST', cookie: ana.cookie, json: {} })
    expect(sortie.statut).toBe(200)
    expect((await appeler('/api/moi', { cookie: ana.cookie })).statut).toBe(401)
  })

  it('une page d’un autre site n’agit pas avec le cookie de quelqu’un, ni sans', async () => {
    const dana = await appeler('/api/auth/sign-up/email', { json: { email: 'dana@exemple.fr', password: 'motdepasse', name: 'Dana' } })
    const ailleurs = (chemin: string, corps: unknown, cookie?: string) =>
      fetch(origine + chemin, {
        method: 'POST',
        headers: { origin: 'https://malveillant.exemple', 'content-type': 'application/json', ...(cookie && { cookie }) },
        body: JSON.stringify(corps),
      })
    expect((await ailleurs('/api/auth/update-user', { name: 'Pirate' }, dana.cookie)).status).toBe(403)
    expect((await ailleurs('/api/auth/sign-up/email', { email: 'eve@exemple.fr', password: 'motdepasse', name: 'Ève' })).status).toBe(403)
    expect((await lire<{ nom: string }>(await appeler('/api/moi', { cookie: dana.cookie }))).nom).toBe('Dana')
  })

  it('l’écran de connexion sait ce qu’il peut proposer', async () => {
    expect(await lire(await appeler('/api/connexion/moyens'))).toEqual({ fournisseurs: [], courriel: false })
  })

  it('les fichiers : dépôt, lecture, refus sans session, largeur demandée', async () => {
    const ana = await appeler('/api/auth/sign-in/email', { json: { email: 'ana@exemple.fr', password: 'motdepasse' } })
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
    // Tout fichier passe au bac à sable, sauf un PDF : le lecteur du navigateur le refuse, et l'aperçu en a besoin.
    expect(lu.reponse.headers.get('content-security-policy')).toMatch(/^sandbox;/)
    const pdf = (await lire<{ id: string }>(await appeler('/api/fichiers', { cookie: ana.cookie, corps: octets, type: 'application/pdf' }))).id
    const politique = (await appeler(`/api/fichiers/${pdf}`, { cookie: ana.cookie })).reponse.headers.get('content-security-policy')
    expect(politique).not.toMatch(/sandbox/)
    expect(politique).toMatch(/default-src 'none'/)

    // `?l=` : une image à la largeur demandée (la limite de connexions de la minute interdit une seconde ouverture de session).
    const grande = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#3366cc' } }).jpeg().toBuffer()
    const idGrande = (await lire<{ id: string }>(await appeler('/api/fichiers', { cookie: ana.cookie, corps: new Uint8Array(grande), type: 'image/jpeg' }))).id

    const largeurDe = async (chemin: string) => {
      const r = await appeler(chemin, { cookie: ana.cookie })
      const octets = Buffer.from(await r.reponse.arrayBuffer())
      const largeur = r.statut === 200 && !octets.subarray(0, 4).equals(Buffer.from('<svg')) ? (await sharp(octets).metadata()).width : undefined
      return { statut: r.statut, octets, entetes: r.reponse.headers, largeur }
    }

    expect((await appeler(`/api/fichiers/${idGrande}?l=800`)).statut).toBe(401)
    const reduite = await largeurDe(`/api/fichiers/${idGrande}?l=800`)
    expect(reduite.statut).toBe(200)
    expect(reduite.largeur).toBe(800)
    expect(reduite.entetes.get('content-type')).toBe('image/jpeg')
    expect(reduite.entetes.get('content-length')).toBe(String(reduite.octets.length))
    expect(reduite.octets.length).toBeLessThan(grande.length)
    expect(reduite.entetes.get('cache-control')).toBe('private, max-age=31536000, immutable')
    // Une seconde demande relit la copie gardée.
    expect((await largeurDe(`/api/fichiers/${idGrande}?l=800`)).octets.equals(reduite.octets)).toBe(true)
    expect((await largeurDe(`/api/fichiers/${idGrande}?l=300`)).largeur).toBe(400)
    expect((await largeurDe(`/api/fichiers/${idGrande}?l=9999`)).largeur).toBe(1600)
    // Sans `l`, l'original.
    expect((await largeurDe(`/api/fichiers/${idGrande}`)).largeur).toBe(2000)

    expect((await appeler(`/api/fichiers/${idGrande}?l=abc`, { cookie: ana.cookie })).statut).toBe(400)
    expect((await appeler(`/api/fichiers/${idGrande}?l=0`, { cookie: ana.cookie })).statut).toBe(400)

    // Une image plus étroite que la demande, et un format qu'on ne réduit pas, sont servis tels quels.
    const petite = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#000' } }).png().toBuffer()
    const idPetite = (await lire<{ id: string }>(await appeler('/api/fichiers', { cookie: ana.cookie, corps: new Uint8Array(petite), type: 'image/png' }))).id
    expect((await largeurDe(`/api/fichiers/${idPetite}?l=800`)).octets.equals(petite)).toBe(true)
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const idSvg = (await lire<{ id: string }>(await appeler('/api/fichiers', { cookie: ana.cookie, corps: svg, type: 'image/svg+xml' }))).id
    expect(new Uint8Array((await largeurDe(`/api/fichiers/${idSvg}?l=400`)).octets)).toEqual(svg)
  })

  it('l’aperçu refuse le réseau local', async () => {
    const ana = await appeler('/api/auth/sign-in/email', { json: { email: 'ana@exemple.fr', password: 'motdepasse' } })
    expect((await appeler('/api/apercu', { cookie: ana.cookie })).statut).toBe(400)
    const refus = await appeler(`/api/apercu?url=${encodeURIComponent('http://127.0.0.1:1/')}`, { cookie: ana.cookie })
    expect(refus.statut).toBe(502)
    expect(await lire<{ cause: string }>(refus)).toMatchObject({ cause: 'interdit' })

    // Le rapatriement d'une image : session exigée, adresse exigée, réseau local refusé.
    const url = 'http://192.168.1.10/photo.png'
    expect((await appeler('/api/fichiers/rapatrier', { json: { url } })).statut).toBe(401)
    expect((await appeler('/api/fichiers/rapatrier', { cookie: ana.cookie, json: {} })).statut).toBe(400)
    const image = await appeler('/api/fichiers/rapatrier', { cookie: ana.cookie, json: { url } })
    expect(image.statut).toBe(422)
    expect(await lire<{ cause: string }>(image)).toMatchObject({ cause: 'interdit' })
  })

  it('la onzième tentative de connexion de la minute est limitée', async () => {
    let dernier = 0
    for (let i = 0; i < 12; i++) dernier = (await appeler('/api/auth/sign-in/email', { json: { email: 'x@exemple.fr', password: 'faux-faux-faux' } })).statut
    expect(dernier).toBe(429)
  })
})

describe("l'application web servie par le serveur", () => {
  let web: ServeurDemarre
  let racine: string
  let adresse: string
  beforeAll(async () => {
    racine = mkdtempSync(join(tmpdir(), 'notak-web-'))
    mkdirSync(join(racine, 'assets'))
    writeFileSync(join(racine, 'index.html'), '<!doctype html><title>Notak</title>')
    writeFileSync(join(racine, 'assets', 'app.js'), 'console.log(1)')
    web = await demarrer({ port: 0, dossier: join(racine, 'donnees'), dossierWeb: racine, secret: SECRET })
    adresse = `http://127.0.0.1:${web.port}`
  })
  afterAll(async () => {
    await web.fermer()
    rmSync(racine, { recursive: true, force: true })
  })

  it('sert les fichiers, la page sur toute adresse du front, et laisse l’API répondre seule', async () => {
    expect(await (await fetch(`${adresse}/assets/app.js`)).text()).toBe('console.log(1)')
    for (const chemin of ['/', '/t/abcdefgh', '/p/abcdefghijklmnopqrstuv']) {
      const r = await fetch(adresse + chemin)
      expect(r.status).toBe(200)
      expect(await r.text()).toContain('<title>Notak</title>')
    }
    const api = await fetch(`${adresse}/api/inexistant`)
    expect(api.status).toBe(404)
    expect(await api.json()).toEqual({ erreur: 'introuvable', code: 'introuvable' })
  })

  it('un partage reçu sans service worker revient à l’accueil au lieu d’une erreur', async () => {
    const r = await fetch(`${adresse}/partage`, { method: 'POST', body: new FormData(), redirect: 'manual' })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe('/')
  })
})
