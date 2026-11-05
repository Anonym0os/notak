import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ecritureEtrangere } from './app.ts'
import { type Compte, type Monde, ORIGINE_ESSAI, monde } from './essai.ts'

// Le cookie de session (`SameSite=Lax`) part aussi avec les requêtes du même site : une page d'un autre sous-domaine
// (`client.notak.essai` à côté de `notak.essai`) peut poster un formulaire ou un `text/plain`, cookie compris. Une
// écriture vers l'API n'est donc reçue que des pages de Notak ; l'arrivée par jeton, les visiteurs et les scripts sans
// navigateur restent comme avant.

/** Une autre origine du même site : un sous-domaine voisin, qui reçoit le même cookie. */
const VOISINE = 'http://client.notak.essai'
/** Le serveur de Vite, en développement (`NOTAK_AUTRES_ORIGINES`). */
const VITE = 'http://localhost:3010'

let m: Monde
let ana: Compte

beforeAll(async () => {
  m = monde({ autresOrigines: [VITE] })
  ana = await m.compte('Ana')
  m.tableau(ana, 'tableau-garde', 'Garde')
})
afterAll(() => m.fermer())

/** L'application appelée comme le ferait un navigateur, en-têtes à la main ; le cookie d'Ana sauf `cookie: null`. */
const appeler = (chemin: string, o: { methode?: string; entetes?: Record<string, string>; corps?: RequestInit['body']; cookie?: string | null } = {}) => {
  const entetes: Record<string, string> = { ...o.entetes }
  const cookie = o.cookie === undefined ? ana.cookie : o.cookie
  if (cookie) entetes.cookie = cookie
  return m.appelerBrut(chemin, { method: o.methode ?? 'POST', headers: entetes, body: o.corps })
}
const json = (origine: string | null, extra: Record<string, string> = {}) => ({ 'content-type': 'application/json', ...(origine ? { origin: origine } : {}), ...extra })
const toiles = async () => ((await (await m.appeler('/api/tableaux', { compte: ana })).json()) as { id: string }[]).map((t) => t.id)

describe('ecritureEtrangere', () => {
  const pages = new Set([ORIGINE_ESSAI, VITE])
  const entetes = (e: Record<string, string>) => new Headers(e)

  it('une écriture d’une autre origine, même du même site, ou d’une origine opaque : refusée', () => {
    for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(ecritureEtrangere(methode, '/api/tableaux', entetes({ origin: VOISINE }), pages)).toBe(true)
    }
    expect(ecritureEtrangere('POST', '/api/tableaux', entetes({ origin: 'null' }), pages)).toBe(true)
    expect(ecritureEtrangere('POST', '/api/tableaux', entetes({ origin: 'https://attaquant.exemple' }), pages)).toBe(true)
  })

  it('sans Origin, Sec-Fetch-Site doit dire la même origine', () => {
    expect(ecritureEtrangere('POST', '/api/tableaux', entetes({ 'sec-fetch-site': 'same-site' }), pages)).toBe(true)
    expect(ecritureEtrangere('POST', '/api/tableaux', entetes({ 'sec-fetch-site': 'cross-site' }), pages)).toBe(true)
    expect(ecritureEtrangere('POST', '/api/tableaux', entetes({ 'sec-fetch-site': 'same-origin' }), pages)).toBe(false)
    // Ni l'un ni l'autre : pas un navigateur.
    expect(ecritureEtrangere('POST', '/api/tableaux', entetes({}), pages)).toBe(false)
  })

  it('les pages de Notak écrivent ; lire, la connexion et l’arrivée restent hors de la garde', () => {
    expect(ecritureEtrangere('POST', '/api/tableaux', entetes({ origin: ORIGINE_ESSAI }), pages)).toBe(false)
    expect(ecritureEtrangere('POST', '/api/tableaux', entetes({ origin: VITE }), pages)).toBe(false)
    expect(ecritureEtrangere('GET', '/api/tableaux', entetes({ origin: VOISINE }), pages)).toBe(false)
    expect(ecritureEtrangere('OPTIONS', '/api/tableaux', entetes({ origin: VOISINE }), pages)).toBe(false)
    expect(ecritureEtrangere('POST', '/api/auth/sign-in/email', entetes({ origin: VOISINE }), pages)).toBe(false)
    expect(ecritureEtrangere('POST', '/api/arrivee', entetes({ origin: VOISINE }), pages)).toBe(false)
    // Seule l'arrivée elle-même : rien de ce qui lui ressemble.
    expect(ecritureEtrangere('POST', '/api/arrivee/x', entetes({ origin: VOISINE }), pages)).toBe(true)
    expect(ecritureEtrangere('POST', '/api/authx', entetes({ origin: VOISINE }), pages)).toBe(true)
  })
})

describe('les écritures, d’une page d’un autre sous-domaine', () => {
  it('une toile ne se crée pas, ni en JSON, ni en text/plain, ni par un formulaire', async () => {
    const avant = await toiles()
    const corps = JSON.stringify({ id: 'toile-voisine', titre: 'Voisine' })
    for (const type of ['application/json', 'text/plain', 'application/x-www-form-urlencoded']) {
      const r = await appeler('/api/tableaux', { entetes: { 'content-type': type, origin: VOISINE }, corps })
      expect(r.status).toBe(403)
      expect(((await r.json()) as { code: string }).code).toBe('origine_refusee')
    }
    // Un navigateur qui n'enverrait pas Origin dit tout de même d'où vient la requête.
    expect((await appeler('/api/tableaux', { entetes: json(null, { 'sec-fetch-site': 'same-site' }), corps })).status).toBe(403)
    expect(await toiles()).toEqual(avant)
  })

  it('ni un favori, ni un rangement, ni un partage, ni un lien visiteur, ni un jeton', async () => {
    const essais: [string, string, unknown][] = [
      ['PUT', '/api/tableaux/tableau-garde/favori', undefined],
      ['PUT', '/api/tableaux/tableau-garde/parent', { parent: ana.utilisateur.racine }],
      ['POST', '/api/tableaux/tableau-garde/partage', { email: 'bob@exemple.fr', role: 'edition' }],
      ['POST', '/api/tableaux/tableau-garde/liens', { niveau: 'lecture' }],
      ['POST', '/api/jetons', { nom: 'pris' }],
    ]
    for (const [methode, chemin, b] of essais) {
      const r = await appeler(chemin, { methode, entetes: json(VOISINE), corps: b === undefined ? undefined : JSON.stringify(b) })
      expect(r.status, `${methode} ${chemin}`).toBe(403)
    }
    expect(m.base.favoris(ana.utilisateur.id)).toEqual([])
    expect((await (await m.appeler('/api/tableaux/tableau-garde/liens', { compte: ana })).json()) as unknown[]).toEqual([])
    expect((await (await m.appeler('/api/jetons', { compte: ana })).json()) as unknown[]).toEqual([])
  })

  it('un fichier ne se dépose pas, quel que soit son type', async () => {
    for (const type of ['text/plain', 'image/png', 'multipart/form-data; boundary=x']) {
      expect((await appeler('/api/fichiers', { entetes: { 'content-type': type, origin: VOISINE }, corps: 'contenu' })).status).toBe(403)
    }
  })
})

describe('les écritures, des pages de Notak', () => {
  it('de l’origine du serveur et du serveur de Vite : reçues', async () => {
    expect((await appeler('/api/tableaux', { entetes: json(ORIGINE_ESSAI), corps: JSON.stringify({ id: 'toile-serveur', titre: 'Ici' }) })).status).toBe(201)
    expect((await appeler('/api/tableaux', { entetes: json(VITE), corps: JSON.stringify({ id: 'toile-vite', titre: 'Vite' }) })).status).toBe(201)
    expect(await toiles()).toEqual(expect.arrayContaining(['toile-serveur', 'toile-vite']))
    expect((await appeler('/api/tableaux/tableau-garde/favori', { methode: 'PUT', entetes: { origin: ORIGINE_ESSAI } })).status).toBe(204)
    expect((await appeler('/api/tableaux/tableau-garde/favori', { methode: 'DELETE', entetes: { origin: ORIGINE_ESSAI } })).status).toBe(204)
  })

  it('un fichier se dépose, sous son propre type', async () => {
    const r = await appeler('/api/fichiers', { entetes: { 'content-type': 'text/plain', origin: ORIGINE_ESSAI }, corps: 'des notes' })
    expect(r.status).toBe(201)
  })

  it('Sec-Fetch-Site same-origin sans Origin, ou un script sans aucun des deux : reçus', async () => {
    const corps = (id: string) => JSON.stringify({ id, titre: id })
    expect((await appeler('/api/tableaux', { entetes: json(null, { 'sec-fetch-site': 'same-origin' }), corps: corps('toile-meme-origine') })).status).toBe(201)
    expect((await appeler('/api/tableaux', { entetes: json(null), corps: corps('toile-script') })).status).toBe(201)
  })
})

describe('ce qui reste ouvert', () => {
  it('l’arrivée par jeton, d’un Raccourci sans origine comme d’un favori sur une autre page', async () => {
    const { jeton } = (await (await m.appeler('/api/jetons', { compte: ana, json: { nom: 'iPhone' } })).json()) as { jeton: string }
    const auth = { authorization: `Bearer ${jeton}` }
    expect((await appeler('/api/arrivee', { cookie: null, entetes: json(null, auth), corps: JSON.stringify({ texte: 'du Raccourci' }) })).status).toBe(201)
    const ailleurs = await appeler('/api/arrivee', { cookie: null, entetes: json('https://exemple.fr', auth), corps: JSON.stringify({ texte: 'd’un favori' }) })
    expect(ailleurs.status).toBe(201)
    expect(ailleurs.headers.get('access-control-allow-origin')).toBe('*')
    const formulaire = new FormData()
    formulaire.set('texte', 'en formulaire')
    expect((await appeler('/api/arrivee', { cookie: null, entetes: { ...auth, origin: VOISINE }, corps: formulaire })).status).toBe(201)
  })

  it('un visiteur lit de partout, et commente depuis la page du lien', async () => {
    const lien = (await (await m.appeler('/api/tableaux/tableau-garde/liens', { compte: ana, json: { niveau: 'commentaire' } })).json()) as { jeton: string }
    const cle = { 'x-notak-visiteur': 'cle-du-navigateur-de-marie-0123456789abcdef' }
    const lu = await appeler(`/api/public/${lien.jeton}`, { methode: 'GET', cookie: null, entetes: { origin: VOISINE, ...cle } })
    expect(lu.status).toBe(200)
    const { moi } = (await lu.json()) as { moi: { id: string } }
    const fil = { type: 'commentaire', messages: [{ id: 'v1', auteur: { id: moi.id, nom: 'Marie' }, date: 1, texte: 'Bonjour' }] }
    const corps = JSON.stringify({ nom: 'Marie', changements: [{ id: 'pin-visiteur', apres: { x: 0, y: 0, largeur: 34, contenu: fil } }] })
    expect((await appeler(`/api/public/${lien.jeton}/commentaires`, { cookie: null, entetes: json(ORIGINE_ESSAI, cle), corps })).status).toBe(200)
    // Le même envoi d'une page d'ailleurs ne passe pas.
    expect((await appeler(`/api/public/${lien.jeton}/commentaires`, { cookie: null, entetes: json(VOISINE, cle), corps })).status).toBe(403)
  })

  it('la connexion reste à Better Auth : la page de Notak se connecte, une voisine est refusée par lui', async () => {
    const corps = JSON.stringify({ email: ana.utilisateur.email, password: 'mauvais-mot-de-passe' })
    // Notre garde la laisse passer : Better Auth répond lui-même (mot de passe faux, puis origine refusée).
    const ici = await appeler('/api/auth/sign-in/email', { cookie: null, entetes: json(ORIGINE_ESSAI), corps })
    expect(ici.status).toBe(401)
    const ailleurs = await appeler('/api/auth/sign-in/email', { cookie: null, entetes: json(VOISINE), corps })
    expect(ailleurs.status).toBe(403)
    expect(((await ailleurs.json()) as { code?: string }).code).not.toBe('origine_refusee')
  })
})
