import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { creerApp } from './app.ts'
import { ouvrirBase } from './base.ts'
import { type ElementLu, lireEtat } from './contenu.ts'
import { creerLimiteur } from './debit.ts'
import { type Compte, type Monde, authEssai, autorisationEssai, monde, openfgaEssai } from './essai.ts'
import { elementsDeTexte, poserDansNonTries } from './arrivee.ts'
import { demarrer } from './serveur.ts'
import { nomDuDocument } from './synchro.ts'

let m: Monde
let ana: Compte
let bob: Compte

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
})
afterAll(() => m.fermer())

type Jeton = { id: string; nom: string; cree: number; dernierUsage: number | null; jeton?: string }

const creerJeton = async (compte: Compte, nom = 'iPhone'): Promise<Required<Jeton>> => {
  const r = await m.appeler('/api/jetons', { compte, json: { nom } })
  expect(r.status).toBe(201)
  return (await r.json()) as Required<Jeton>
}

/** Appelle la route avec un en-tête `Authorization`, comme le fait un raccourci. */
async function fetchApp(chemin: string, jeton: string | null, options: { json?: unknown; formulaire?: FormData; methode?: string }) {
  const entetes: Record<string, string> = {}
  if (jeton !== null) entetes.authorization = `Bearer ${jeton}`
  if (options.json !== undefined) entetes['content-type'] = 'application/json'
  const corps = options.formulaire ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined)
  return m.appelerBrut(chemin, { method: options.methode ?? 'POST', headers: entetes, body: corps })
}

/** Les éléments des non triés de l'accueil de ce compte, tels que l'enregistre la base. */
const nonTries = (compte: Compte): ElementLu[] => {
  const etat = m.base.document(nomDuDocument(compte.utilisateur.racine))
  return lireEtat(etat!).elements.filter((e) => e.nonTrie !== undefined)
}

const png = (largeur = 60, hauteur = 40) => sharp({ create: { width: largeur, height: hauteur, channels: 3, background: '#3366cc' } }).png().toBuffer()

describe('jetons : création, liste, révocation', () => {
  it('le jeton n’est montré qu’à sa création, et la liste ne le redonne pas', async () => {
    const j = await creerJeton(ana, 'Raccourci iPhone')
    expect(j.jeton).toMatch(/^nk_[A-Za-z0-9_-]{43}$/)
    const liste = (await (await m.appeler('/api/jetons', { compte: ana })).json()) as Jeton[]
    const mien = liste.find((x) => x.id === j.id)
    expect(mien).toMatchObject({ nom: 'Raccourci iPhone', dernierUsage: null })
    expect(JSON.stringify(liste)).not.toContain(j.jeton)
  })

  it('ne garde pas le jeton en clair en base : seule l’empreinte y est', async () => {
    const j = await creerJeton(ana, 'empreinte')
    expect(JSON.stringify(m.base.jetonsArrivee(ana.utilisateur.id))).not.toContain(j.jeton)
    expect(m.base.utilisateurDuJetonArrivee(j.jeton, 1)).toBeNull()
  })

  it('refuse sans compte, sans nom ou avec un nom trop long', async () => {
    expect((await m.appeler('/api/jetons')).status).toBe(401)
    expect((await m.appeler('/api/jetons', { json: { nom: 'x' } })).status).toBe(401)
    expect((await m.appeler('/api/jetons', { compte: ana, json: { nom: '  ' } })).status).toBe(400)
    expect((await m.appeler('/api/jetons', { compte: ana, json: { nom: 'x'.repeat(61) } })).status).toBe(400)
  })

  it('limite le nombre de jetons par compte', async () => {
    const cleo = await m.compte('Cléo')
    for (let i = 0; i < 20; i++) await creerJeton(cleo, `j${i}`)
    expect((await m.appeler('/api/jetons', { compte: cleo, json: { nom: 'un de trop' } })).status).toBe(409)
  })

  it('un compte ne voit ni ne révoque les jetons d’un autre', async () => {
    const j = await creerJeton(ana, 'à Ana')
    const chezBob = (await (await m.appeler('/api/jetons', { compte: bob })).json()) as Jeton[]
    expect(chezBob.map((x) => x.id)).not.toContain(j.id)
    expect((await m.appeler(`/api/jetons/${j.id}`, { compte: bob, methode: 'DELETE' })).status).toBe(404)
    expect((await fetchApp('/api/arrivee', j.jeton, { json: { texte: 'encore là' } })).status).toBe(201)
  })
})

describe('POST /api/arrivee : le jeton', () => {
  it('sans jeton, avec un jeton inconnu ou sans le mot Bearer : 401', async () => {
    expect((await fetchApp('/api/arrivee', null, { json: { texte: 'x' } })).status).toBe(401)
    expect((await fetchApp('/api/arrivee', 'nk_inconnu', { json: { texte: 'x' } })).status).toBe(401)
    const r = await m.appelerBrut('/api/arrivee', { method: 'POST', headers: { authorization: 'Basic abc', 'content-type': 'application/json' }, body: '{"texte":"x"}' })
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('le cookie de session ne remplace pas le jeton', async () => {
    const r = await m.appeler('/api/arrivee', { compte: ana, json: { texte: 'par cookie' } })
    expect(r.status).toBe(401)
  })

  it('un jeton révoqué ne sert plus', async () => {
    const j = await creerJeton(bob, 'à révoquer')
    expect((await fetchApp('/api/arrivee', j.jeton, { json: { texte: 'avant' } })).status).toBe(201)
    expect((await m.appeler(`/api/jetons/${j.id}`, { compte: bob, methode: 'DELETE' })).status).toBe(204)
    const r = await fetchApp('/api/arrivee', j.jeton, { json: { texte: 'après' } })
    expect(r.status).toBe(401)
    expect(nonTries(bob).map((e) => JSON.stringify(e.contenu))).toEqual([expect.stringContaining('avant')])
  })

  it('un jeton ne sert à rien d’autre : ni les tableaux ni les comptes', async () => {
    const j = await creerJeton(ana, 'limité')
    for (const chemin of ['/api/moi', '/api/tableaux', '/api/jetons']) {
      const r = await m.appelerBrut(chemin, { headers: { authorization: `Bearer ${j.jeton}` } })
      expect(r.status).toBe(401)
    }
  })

  it('note la date du dernier usage', async () => {
    const j = await creerJeton(ana, 'usage')
    await fetchApp('/api/arrivee', j.jeton, { json: { texte: 'coucou' } })
    const liste = (await (await m.appeler('/api/jetons', { compte: ana })).json()) as Jeton[]
    expect(liste.find((x) => x.id === j.id)?.dernierUsage).toBeGreaterThan(0)
  })
})

describe('POST /api/arrivee : ce qui arrive', () => {
  let jeton: string
  let compte: Compte
  beforeAll(async () => {
    compte = await m.compte('Dina')
    jeton = (await creerJeton(compte, 'essais')).jeton
  })

  it('un texte devient une note dans les non triés de l’accueil du compte, et chez lui seul', async () => {
    const r = await fetchApp('/api/arrivee', jeton, { json: { texte: 'Penser au pain', titre: 'Courses' } })
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ ajoutes: 1 })
    const [note] = nonTries(compte)
    expect(note).toMatchObject({ x: 0, y: 0, largeur: 34, contenu: { type: 'note' } })
    expect(JSON.stringify(note!.contenu)).toContain('Courses')
    expect(JSON.stringify(note!.contenu)).toContain('Penser au pain')
    expect(typeof note!.nonTrie).toBe('number')
    expect(nonTries(ana).some((e) => JSON.stringify(e.contenu).includes('Penser au pain'))).toBe(false)
  })

  it('une adresse devient un lien, le texte qui l’accompagne une note', async () => {
    const avant = nonTries(compte).length
    const r = await fetchApp('/api/arrivee', jeton, { json: { url: 'https://exemple.fr/article', texte: 'À lire demain', titre: 'Un article' } })
    expect(await r.json()).toEqual({ ajoutes: 2 })
    const neufs = nonTries(compte).slice(avant)
    expect(neufs.map((e) => e.contenu.type).sort()).toEqual(['lien', 'note'])
    expect(neufs.find((e) => e.contenu.type === 'lien')!.contenu).toMatchObject({ url: 'https://exemple.fr/article', statut: 'attente' })
  })

  it('une adresse seule dans le texte, comme la donne Partager de Safari, devient un lien', async () => {
    const avant = nonTries(compte).length
    const r = await fetchApp('/api/arrivee', jeton, { json: { texte: 'https://exemple.fr/seule' } })
    expect(await r.json()).toEqual({ ajoutes: 1 })
    expect(nonTries(compte).slice(avant)[0]!.contenu).toMatchObject({ type: 'lien', url: 'https://exemple.fr/seule' })
  })

  it('une image envoyée en formulaire est rangée et posée avec ses dimensions', async () => {
    const avant = nonTries(compte).length
    const formulaire = new FormData()
    formulaire.set('image', new File([new Uint8Array(await png(300, 200))], 'photo.png', { type: 'application/octet-stream' }))
    const r = await fetchApp('/api/arrivee', jeton, { formulaire })
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ ajoutes: 1 })
    const image = nonTries(compte).slice(avant)[0]!
    expect(image).toMatchObject({ largeur: 30, contenu: { type: 'image', largeurOrigine: 300, hauteurOrigine: 200, typeMime: 'image/png' } })
    const fichier = m.base.fichier(image.contenu.fichier as string)
    expect(fichier).toMatchObject({ type: 'image/png', auteur: compte.utilisateur.id })
    const servi = await m.appeler(`/api/fichiers/${fichier!.id}`, { compte })
    expect(servi.status).toBe(200)
  })

  it('une photo couchée par son EXIF (iPhone) garde les dimensions qu’on voit', async () => {
    const avant = nonTries(compte).length
    const brut = await sharp({ create: { width: 400, height: 100, channels: 3, background: '#cc3333' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const formulaire = new FormData()
    formulaire.set('image', new File([new Uint8Array(brut)], 'IMG_1.jpg', { type: 'image/jpeg' }))
    formulaire.set('texte', 'Vue du balcon')
    const r = await fetchApp('/api/arrivee', jeton, { formulaire })
    expect(await r.json()).toEqual({ ajoutes: 2 })
    const neufs = nonTries(compte).slice(avant)
    expect(neufs.find((e) => e.contenu.type === 'note')).toBeDefined()
    expect(neufs.find((e) => e.contenu.type === 'image')!.contenu).toMatchObject({ largeurOrigine: 100, hauteurOrigine: 400, typeMime: 'image/jpeg' })
  })

  it('refuse un fichier qui n’est pas une image lisible, sans rien poser', async () => {
    const avant = nonTries(compte).length
    const formulaire = new FormData()
    formulaire.set('image', new File([new Uint8Array([1, 2, 3, 4])], 'x.heic', { type: 'image/heic' }))
    const r = await fetchApp('/api/arrivee', jeton, { formulaire })
    expect(r.status).toBe(415)
    expect(((await r.json()) as { erreur: string }).erreur).toContain('JPEG')
    expect(nonTries(compte)).toHaveLength(avant)
  })

  it('refuse l’arrivée vide ou mal formée', async () => {
    expect((await fetchApp('/api/arrivee', jeton, { json: {} })).status).toBe(400)
    expect((await fetchApp('/api/arrivee', jeton, { json: { texte: '   ', url: 'pas une adresse' } })).status).toBe(400)
    expect((await fetchApp('/api/arrivee', jeton, { json: [1] })).status).toBe(400)
    const r = await m.appelerBrut('/api/arrivee', { method: 'POST', headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, body: '{pas du json' })
    expect(r.status).toBe(400)
    expect((await m.appelerBrut('/api/arrivee', { method: 'POST', headers: { authorization: `Bearer ${jeton}` } })).status).toBe(400)
  })

  it('refuse un texte trop gros', async () => {
    const r = await fetchApp('/api/arrivee', jeton, { json: { texte: 'a'.repeat(300 * 1024) } })
    expect(r.status).toBe(413)
  })

  it('répond aux demandes préalables d’un favori venu d’une autre origine', async () => {
    const pre = await m.appelerBrut('/api/arrivee', { method: 'OPTIONS', headers: { origin: 'https://exemple.fr', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } })
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-origin')).toBe('*')
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization')
    const r = await fetchApp('/api/arrivee', jeton, { json: { texte: 'depuis un favori' } })
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
    const refus = await fetchApp('/api/arrivee', 'nk_non', { json: { texte: 'x' } })
    expect(refus.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('le texte posé reste au-dessus de ce qu’il y avait déjà, dans l’ordre d’arrivée', async () => {
    const etat = m.base.document(nomDuDocument(compte.utilisateur.racine))!
    const doc = new Y.Doc()
    Y.applyUpdate(doc, etat)
    const plans = [...doc.getMap<{ plan: string; nonTrie?: number }>('elements').values()].filter((e) => e.nonTrie !== undefined).sort((a, b) => a.nonTrie! - b.nonTrie!)
    const tries = [...plans].sort((a, b) => (a.plan < b.plan ? -1 : 1))
    expect(tries.map((e) => e.plan)).toEqual(plans.map((e) => e.plan))
    expect(new Set(plans.map((e) => e.plan)).size).toBe(plans.length)
    const accueil = [...doc.getMap<{ plan: string; nonTrie?: number }>('elements').values()].filter((e) => e.nonTrie === undefined)
    for (const a of accueil) expect(a.plan < plans[0]!.plan).toBe(true)
  })
})

describe('POST /api/arrivee : le débit', () => {
  it('rend 429 avec le temps d’attente quand la limite est atteinte', async () => {
    const base = ouvrirBase(':memory:')
    const dossier = mkdtempSync(join(tmpdir(), 'notak-debit-'))
    try {
      const app = creerApp({
        base,
        auth: authEssai(base),
        autorisation: autorisationEssai(base),
        moyens: { fournisseurs: [], courriel: false },
        dossierFichiers: join(dossier, 'fichiers'),
        limiteur: creerLimiteur(1000, 60_000),
        limiteurArrivee: creerLimiteur(2, 60_000),
        maintenant: () => 1_000_000,
        synchro: () => null,
        relais: 0,
        cookieSecurise: false,
      })
      const appel = () => app.request('/api/arrivee', { method: 'POST', headers: { authorization: 'Bearer nk_x', 'content-type': 'application/json' }, body: '{}' })
      expect((await appel()).status).toBe(401)
      expect((await appel()).status).toBe(401)
      const r = await appel()
      expect(r.status).toBe(429)
      expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
      expect(r.headers.get('access-control-allow-origin')).toBe('*')
    } finally {
      base.fermer()
      rmSync(dossier, { recursive: true, force: true })
    }
  })
})

describe('poserDansNonTries', () => {
  it('poserDansNonTries n’écrase pas un élément du même identifiant', () => {
    const doc = new Y.Doc()
    const [e] = elementsDeTexte({ texte: 'a' }, 5)
    poserDansNonTries(doc, [e!])
    poserDansNonTries(doc, [{ ...e!, nonTrie: 99 }])
    expect(doc.getMap('elements').size).toBe(1)
  })
})

describe('POST /api/arrivee : sur le serveur lancé, avec la synchro', () => {
  it('passe par le document en direct, et l’accueil exporté contient l’arrivée', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'notak-arrivee-'))
    const serveur = await demarrer({ port: 0, dossier, secret: 'un-secret-d-essai-assez-long-pour-better-auth', openfga: openfgaEssai() })
    const origine = `http://localhost:${serveur.port}`
    try {
      const inscription = await fetch(`${origine}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { origin: origine, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'eli@exemple.fr', password: 'motdepasse', name: 'Eli' }),
      })
      const cookie = inscription.headers.get('set-cookie')!.split(';')[0]!
      const racine = ((await (await fetch(`${origine}/api/moi`, { headers: { cookie } })).json()) as { racine: string }).racine
      const cree = await fetch(`${origine}/api/jetons`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ nom: 'iPhone' }) })
      const { jeton } = (await cree.json()) as { jeton: string }
      const r = await fetch(`${origine}/api/arrivee`, {
        method: 'POST',
        headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
        body: JSON.stringify({ texte: 'Idée venue du téléphone' }),
      })
      expect(r.status).toBe(201)
      const exporte = await fetch(`${origine}/api/tableaux/${racine}/export?format=txt`, { headers: { cookie } })
      expect(await exporte.text()).toContain('Idée venue du téléphone')
    } finally {
      await serveur.fermer()
      rmSync(dossier, { recursive: true, force: true })
    }
  })
})
