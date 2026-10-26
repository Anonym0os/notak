import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NOM_COOKIE_PUBLIC } from './app.ts'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte
let idImage: string
let idCache: string
const octets = new Uint8Array([137, 80, 78, 71, 5, 5])

interface LienVu {
  id: string
  jeton: string
  nom: string
  niveau: 'lecture' | 'commentaire'
  expire: number | null
  echu: boolean
  protege: boolean
  derniereVisite: number | null
}

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
  const depot = async () => ((await (await m.appeler('/api/fichiers', { compte: ana, corps: octets, type: 'image/png' })).json()) as { id: string }).id
  idImage = await depot()
  idCache = await depot()
  m.tableau(ana, 'tableau-budget', 'Budget')
  m.tableau(ana, 'tableau-public', 'Carnet', (doc) => {
    poser(
      doc,
      { type: 'note', texte: texte('Visible') },
      {
        id: 'note-1',
        etiquettes: ['e1'],
        echeance: '2026-11-02',
        assigne: { id: 'x', nom: 'Ana' },
        reactions: { '👍': ['x'] },
        commentaire: { type: 'commentaire', messages: [{ id: 'm2', auteur: { id: 'x', nom: 'Ana' }, date: 1, texte: 'fil-secret' }] },
      },
    )
    poser(doc, { type: 'note', texte: texte('Jetée') }, { id: 'note-2', corbeille: 5 })
    poser(doc, { type: 'note', texte: texte('À trier') }, { id: 'note-3', nonTrie: 5 })
    poser(doc, { type: 'commentaire', messages: [{ id: 'm', auteur: { id: 'x', nom: 'Ana' }, date: 1, texte: 'privé' }] }, { id: 'comm-1' })
    poser(doc, { type: 'image', fichier: idImage, largeurOrigine: 1, hauteurOrigine: 1 }, { id: 'img-1' })
    poser(doc, { type: 'image', fichier: idCache, largeurOrigine: 1, hauteurOrigine: 1 }, { id: 'img-2', corbeille: 5 })
    poser(doc, { type: 'tableau', cible: 'tableau-budget' }, { id: 'sous-1' })
    poser(doc, { type: 'ligne', depart: { element: 'note-1' }, arrivee: { element: 'sous-1' } }, { id: 'lien-ok' })
    poser(doc, { type: 'ligne', depart: { element: 'note-1' }, arrivee: { element: 'comm-1' } }, { id: 'lien-coupe' })
  })
  m.base.definirAcces({ tableau: 'tableau-public', utilisateur: bob.utilisateur.id, role: 'edition' })
})
afterAll(() => m.fermer())

const liens = '/api/tableaux/tableau-public/liens'
const creer = async (corps: Record<string, unknown> = {}): Promise<LienVu> => {
  const r = await m.appeler(liens, { compte: ana, json: corps })
  expect(r.status).toBe(201)
  return (await r.json()) as LienVu
}
const lire = (jeton: string, cookie?: string) => m.appeler(`/api/public/${jeton}`, cookie ? { cookie } : {})
const vue = async (jeton: string) => (await (await lire(jeton)).json()) as { titre: string; elements: Record<string, unknown>[]; titres: Record<string, string>; niveau: string }

describe('les liens visiteurs d’un tableau', () => {
  it('seul le propriétaire les crée, les lit, les change et les ferme', async () => {
    const l = await creer()
    for (const [methode, chemin] of [
      ['GET', liens],
      ['POST', liens],
      ['PATCH', `${liens}/${l.id}`],
      ['DELETE', `${liens}/${l.id}`],
      ['PUT', `${liens}/${l.id}/mot-de-passe`],
    ] as const) {
      const json = methode === 'GET' ? undefined : { motDePasse: 'motdepasse' }
      expect((await m.appeler(chemin, { compte: bob, methode, json })).status).toBe(403)
      expect((await m.appeler(chemin, { compte: cleo, methode, json })).status).toBe(404)
      expect((await m.appeler(chemin, { methode, json })).status).toBe(401)
    }
    // Un lien d'un autre tableau ne se gère pas par celui-ci.
    m.tableau(ana, 'tableau-autre', 'Autre')
    expect((await m.appeler(`/api/tableaux/tableau-autre/liens/${l.id}`, { compte: ana, methode: 'DELETE' })).status).toBe(404)
    await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })

  it('un lien neuf voit sans limite par défaut ; on peut en avoir plusieurs, chacun son jeton', async () => {
    const a = await creer({ nom: '  Client   Dupont ' })
    const b = await creer({ niveau: 'commentaire' })
    expect(a).toMatchObject({ nom: 'Client Dupont', niveau: 'lecture', expire: null, echu: false, protege: false, derniereVisite: null })
    expect(a.jeton).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(b.niveau).toBe('commentaire')
    expect(b.jeton).not.toBe(a.jeton)
    const tous = (await (await m.appeler(liens, { compte: ana })).json()) as LienVu[]
    expect(tous.map((l) => l.id)).toEqual([a.id, b.id])
    // Le jeton ne sert pas à les gérer.
    expect((await m.appeler(`${liens}/${a.jeton}`, { compte: ana, methode: 'DELETE' })).status).toBe(404)
    for (const l of [a, b]) await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })

  it('sans compte, un lien ne modifie jamais : « edition » et les niveaux inconnus sont refusés', async () => {
    for (const niveau of ['edition', 'proprietaire', 'tout']) expect((await m.appeler(liens, { compte: ana, json: { niveau } })).status).toBe(400)
    expect((await m.appeler(liens, { compte: ana, json: { nom: 'x'.repeat(61) } })).status).toBe(400)
    expect((await m.appeler(liens, { compte: ana, json: { expire: m.maintenant() - 1 } })).status).toBe(400)
    expect((await m.appeler(liens, { compte: ana, json: { motDePasse: 'court' } })).status).toBe(400)
  })

  it('il sert le tableau en lecture, sans corbeille, non triés, fils ni personne confiée', async () => {
    const l = await creer()
    const r = await lire(l.jeton)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('x-robots-tag')).toBe('noindex')
    expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    const t = (await r.json()) as { titre: string; elements: Record<string, unknown>[]; titres: Record<string, string>; niveau: string; expire: null }
    expect(t.titre).toBe('Carnet')
    expect(t.niveau).toBe('lecture')
    expect(t.elements.map((e) => e.id)).toEqual(['note-1', 'img-1', 'sous-1', 'lien-ok'])
    expect(t.titres).toEqual({ 'tableau-budget': 'Budget' })
    const note = t.elements.find((e) => e.id === 'note-1')!
    expect(note).toMatchObject({ echeance: '2026-11-02', etiquettes: ['e1'] })
    expect(note).not.toHaveProperty('commentaire')
    expect(note).not.toHaveProperty('reactions')
    expect(note).not.toHaveProperty('assigne')
    expect(JSON.stringify(t)).not.toContain('fil-secret')
    expect(JSON.stringify(t)).not.toContain('privé')
    expect(JSON.stringify(t)).not.toContain('plan')
    expect(t).not.toHaveProperty('moi')
    // Ce qui n'a pas changé ne se recharge pas.
    const etiquette = r.headers.get('etag')!
    expect((await m.appeler(`/api/public/${l.jeton}`, { entetes: { 'if-none-match': etiquette } })).status).toBe(304)
    // La visite est notée, pour que le propriétaire sache si le lien a servi.
    const apres = (await (await m.appeler(liens, { compte: ana })).json()) as LienVu[]
    expect(apres.find((x) => x.id === l.id)!.derniereVisite).toBeGreaterThan(0)
    await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })

  it('un lien qui permet de commenter montre les fils et les réactions, toujours pas la personne confiée', async () => {
    const l = await creer({ niveau: 'commentaire' })
    const t = await vue(l.jeton)
    expect(t.niveau).toBe('commentaire')
    expect(t.elements.map((e) => e.id)).toEqual(['note-1', 'comm-1', 'img-1', 'sous-1', 'lien-ok', 'lien-coupe'])
    const note = t.elements.find((e) => e.id === 'note-1')!
    expect(note).toHaveProperty('commentaire')
    expect(note).toHaveProperty('reactions')
    expect(note).not.toHaveProperty('assigne')
    // Qui il est, d'après la clé de son navigateur : un identifiant de visiteur, propre à ce lien.
    const cle = 'k'.repeat(43)
    const avecCle = (await (await m.appeler(`/api/public/${l.jeton}`, { entetes: { 'x-notak-visiteur': cle } })).json()) as { moi: { id: string; couleur: string } }
    expect(avecCle.moi.id).toMatch(/^visiteur:[A-Za-z0-9_-]{22}$/)
    expect(avecCle.moi.couleur).toMatch(/^#[0-9a-f]{6}$/)
    await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })

  it('les fichiers du tableau se lisent par le lien, pas les autres', async () => {
    const l = await creer()
    const ok = await m.appeler(`/api/public/${l.jeton}/fichiers/${idImage}`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(octets)
    expect((await m.appeler(`/api/public/${l.jeton}/fichiers/${idCache}`)).status).toBe(404)
    expect((await m.appeler(`/api/public/${l.jeton}/fichiers/../../etc/passwd`)).status).toBe(404)
    expect((await m.appeler(`/api/fichiers/${idImage}`)).status).toBe(401)
    await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })

  it('un jeton mal formé, inconnu ou fermé ne donne rien', async () => {
    expect((await lire('court')).status).toBe(404)
    expect((await lire('tableau-public')).status).toBe(404)
    expect((await lire('abcdefghijklmnopqrstuv')).status).toBe(404)
    const l = await creer()
    expect((await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })).status).toBe(204)
    expect((await lire(l.jeton)).status).toBe(404)
    expect((await m.appeler(`/api/public/${l.jeton}/fichiers/${idImage}`)).status).toBe(404)
    expect((await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })).status).toBe(404)
  })

  it('un lien temporaire ferme à son échéance, le dit, et se prolonge', async () => {
    const l = await creer({ expire: m.maintenant() + 3600_000 })
    expect(l.expire).toBeGreaterThan(m.maintenant())
    expect((await lire(l.jeton)).status).toBe(200)
    m.avancer(3600_000 + 1)
    const ferme = await lire(l.jeton)
    expect(ferme.status).toBe(410)
    expect(await ferme.json()).toMatchObject({ code: 'lien_expire' })
    expect((await m.appeler(`/api/public/${l.jeton}/fichiers/${idImage}`)).status).toBe(410)
    // Le propriétaire le voit échu, et peut le rouvrir.
    const vu = ((await (await m.appeler(liens, { compte: ana })).json()) as LienVu[]).find((x) => x.id === l.id)!
    expect(vu.echu).toBe(true)
    const prolonge = await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'PATCH', json: { expire: null } })
    expect(((await prolonge.json()) as LienVu).expire).toBeNull()
    expect((await lire(l.jeton)).status).toBe(200)
    await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })

  it('un lien se renomme et change de niveau sans changer d’adresse', async () => {
    const l = await creer()
    const r = (await (await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'PATCH', json: { nom: 'Jury', niveau: 'commentaire' } })).json()) as LienVu
    expect(r).toMatchObject({ nom: 'Jury', niveau: 'commentaire', jeton: l.jeton })
    expect((await vue(l.jeton)).niveau).toBe('commentaire')
    await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })
})

describe('le mot de passe d’un lien visiteur', () => {
  /** Le cookie d'accès que la réponse remet, tel que le navigateur le renverrait. */
  const acces = (r: Response) => r.headers.get('set-cookie')!.split(';')[0]!
  const ouvrir = (jeton: string, motDePasse: string) => m.appeler(`/api/public/${jeton}/deverrouiller`, { methode: 'POST', json: { motDePasse } })
  const mdp = (l: LienVu, methode: 'PUT' | 'DELETE', motDePasse?: string) =>
    m.appeler(`${liens}/${l.id}/mot-de-passe`, { compte: ana, methode, ...(motDePasse ? { json: { motDePasse } } : {}) })

  it('posé à la création, il est haché et ferme ce lien seulement', async () => {
    const ferme = await creer({ motDePasse: 'lecture seule' })
    const libre = await creer()
    expect(ferme.protege).toBe(true)
    expect(m.base.lienVisiteur(ferme.id)!.motDePasse!.startsWith('$argon2id$')).toBe(true)
    // Il n'est pas celui qui ferme le tableau aux comptes.
    expect(m.base.motDePasse('tableau-public', 'tableau')).toBeNull()
    const r = await lire(ferme.jeton)
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ erreur: 'mot de passe requis', code: 'mot_de_passe_requis', protege: true })
    expect((await m.appeler(`/api/public/${ferme.jeton}/fichiers/${idImage}`)).status).toBe(401)
    expect((await lire(libre.jeton)).status).toBe(200)
    // Les comptes du tableau, eux, y accèdent toujours.
    expect((await m.appeler('/api/tableaux/tableau-public/export', { compte: bob })).status).toBe(200)

    expect((await ouvrir(ferme.jeton, 'mauvais mot de passe')).status).toBe(401)
    const bon = await ouvrir(ferme.jeton, 'lecture seule')
    expect(bon.status).toBe(204)
    const cookie = bon.headers.get('set-cookie')!
    expect(cookie).toContain(`${NOM_COOKIE_PUBLIC}=`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain(`Path=/api/public/${ferme.jeton}`)
    expect((await lire(ferme.jeton, acces(bon))).status).toBe(200)
    expect((await m.appeler(`/api/public/${ferme.jeton}/fichiers/${idImage}`, { cookie: acces(bon) })).status).toBe(200)
    expect((await lire(ferme.jeton, `${NOM_COOKIE_PUBLIC}=n-importe-quoi`)).status).toBe(401)

    // Changer le mot de passe révoque les accès donnés ; le retirer rouvre le lien.
    expect((await mdp(ferme, 'PUT', 'court')).status).toBe(400)
    expect((await mdp(ferme, 'PUT', 'un autre mot de passe')).status).toBe(200)
    expect((await lire(ferme.jeton, acces(bon))).status).toBe(401)
    expect((await ouvrir(ferme.jeton, 'lecture seule')).status).toBe(401)
    const neuf = acces(await ouvrir(ferme.jeton, 'un autre mot de passe'))
    expect((await mdp(ferme, 'DELETE')).status).toBe(200)
    expect((await lire(ferme.jeton)).status).toBe(200)
    // Un ancien accès ne ressuscite pas si un mot de passe revient.
    await mdp(ferme, 'PUT', 'et de nouveau un')
    expect((await lire(ferme.jeton, neuf)).status).toBe(401)
    for (const l of [ferme, libre]) await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })

  it('l’accès remis ne dure pas plus longtemps que le lien', async () => {
    const l = await creer({ motDePasse: 'motdepasse', expire: m.maintenant() + 60_000 })
    const bon = await ouvrir(l.jeton, 'motdepasse')
    expect(bon.headers.get('set-cookie')).toMatch(/Max-Age=(5\d|60)(;|$)/)
    m.avancer(60_001)
    expect((await lire(l.jeton, acces(bon))).status).toBe(410)
    await m.appeler(`${liens}/${l.id}`, { compte: ana, methode: 'DELETE' })
  })
})
