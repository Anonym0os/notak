import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Compte, type Monde, monde, poser } from './essai.ts'
import { indexerDocument } from './indexation.ts'
import { nomDuDocument } from './synchro.ts'

// Le chemin d'une toile, pour son fil d'Ariane : où elle est rangée, sans un niveau que le compte ne lit pas.

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte

beforeEach(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
})
afterEach(() => m.fermer())

type Niveau = { id: string; titre: string; dossier?: true }
type EspaceLu = { id: string; racine: string; personnel: boolean }
const json = async <T>(r: Response | Promise<Response>): Promise<T> => (await (await r).json()) as T
const chemin = async (c: Compte | undefined, id: string) => {
  const r = await m.appeler(`/api/tableaux/${id}/chemin`, { compte: c })
  return r.status === 200 ? json<Niveau[]>(r) : r.status
}

/** Récrit le document d'un tableau et l'indexe, comme le fait la synchro. */
function ecrire(id: string, f: (doc: Y.Doc) => void) {
  const doc = new Y.Doc()
  const etat = m.base.document(nomDuDocument(id))
  if (etat) Y.applyUpdate(doc, etat)
  f(doc)
  m.base.enregistrerDocument(nomDuDocument(id), Y.encodeStateAsUpdate(doc))
  indexerDocument(m.base, id, doc)
}
/** Pose sur `dans` la carte de chaque toile de `toiles`. */
const cartes = (dans: string, ...toiles: string[]) => ecrire(dans, (doc) => toiles.forEach((t) => poser(doc, { type: 'tableau', cible: t }, { id: `carte-${t}` })))

/** Chez Ana : Mon espace › Projets (un dossier) › Voyage › Étape, et Archives à côté de Projets. */
function rangerChezAna() {
  const accueil = ana.utilisateur.racine
  m.tableau(ana, 'projets', 'Projets', (doc) => doc.getMap('meta').set('dossier', true), accueil)
  m.tableau(ana, 'archives', 'Archives', undefined, accueil)
  m.tableau(ana, 'voyage', 'Voyage', undefined, 'projets')
  m.tableau(ana, 'etape', 'Étape', undefined, 'voyage')
  cartes(accueil, 'projets', 'archives')
  cartes('projets', 'voyage')
  cartes('voyage', 'etape')
  ecrire('archives', () => {})
  ecrire('etape', () => {})
}

describe('GET /api/tableaux/:id/chemin', () => {
  it('rend les dossiers d’une toile, de « Mon espace » à son parent, avec leur titre, ceux qui se montrent en dossier dits', async () => {
    rangerChezAna()
    const accueil = ana.utilisateur.racine
    expect(await chemin(ana, 'etape')).toEqual([
      { id: accueil, titre: 'Accueil d’Ana' },
      { id: 'projets', titre: 'Projets', dossier: true },
      { id: 'voyage', titre: 'Voyage' },
    ])
    expect(await chemin(ana, 'projets')).toEqual([{ id: accueil, titre: 'Accueil d’Ana' }])
    // L'accueil n'est rangé nulle part.
    expect(await chemin(ana, accueil)).toEqual([])
    expect(await chemin(undefined, 'etape')).toBe(401)
  })

  it('suit la carte, comme la bibliothèque : une toile glissée sur une autre y est rangée', async () => {
    rangerChezAna()
    ecrire('projets', (doc) => doc.getMap('elements').delete('carte-voyage'))
    cartes('archives', 'voyage')
    expect(((await chemin(ana, 'etape')) as Niveau[]).map((n) => n.id)).toEqual([ana.utilisateur.racine, 'archives', 'voyage'])
  })

  it('ne nomme pas ce que le compte ne lit pas : un partage commence là où il lit, et ce qu’il ne lit pas n’a pas de chemin', async () => {
    rangerChezAna()
    m.base.definirAcces({ tableau: 'voyage', utilisateur: bob.utilisateur.id, role: 'lecture' })
    // Bob lit Voyage et ce qu'elle range, pas Projets ni l'accueil d'Ana.
    expect(await chemin(bob, 'etape')).toEqual([{ id: 'voyage', titre: 'Voyage' }])
    expect(await chemin(bob, 'voyage')).toEqual([])
    expect(await chemin(bob, 'projets')).toBe(404)
  })

  it('une toile d’un espace d’équipe part de son accueil ; une toile privée où l’on n’est pas invité n’y paraît pas', async () => {
    const auth = (route: string, compte: Compte, corps: unknown) => m.appeler(`/api/auth${route}`, { compte, json: corps })
    const { id } = await json<{ id: string }>(auth('/organization/create', ana, { name: 'Silak', slug: 'silak' }))
    for (const c of [bob, cleo]) {
      const inv = await json<{ id: string }>(auth('/organization/invite-member', ana, { email: c.utilisateur.email, role: 'member', organizationId: id }))
      await auth('/organization/accept-invitation', c, { invitationId: inv.id })
    }
    const silak = (await json<EspaceLu[]>(m.appeler('/api/espaces', { compte: ana }))).find((e) => e.id === id)!
    m.tableau(ana, 'compta', 'Compta 2026', undefined, silak.racine)
    m.tableau(ana, 'salaires', 'Salaires', undefined, 'compta')
    cartes(silak.racine, 'compta')
    cartes('compta', 'salaires')
    ecrire('salaires', () => {})
    expect(await chemin(bob, 'salaires')).toEqual([
      { id: silak.racine, titre: expect.any(String) },
      { id: 'compta', titre: 'Compta 2026' },
    ])
    // Rendue privée, la compta ne s'ouvre qu'à ses invités : Cléo, invitée aux salaires seuls, ne la voit pas nommée.
    expect((await m.appeler('/api/tableaux/compta/prive', { compte: ana, methode: 'PUT', json: { prive: true } })).status).toBe(200)
    expect((await m.appeler('/api/tableaux/salaires/partage', { compte: ana, json: { email: cleo.utilisateur.email, role: 'lecture' } })).status).toBe(200)
    expect(await chemin(cleo, 'salaires')).toEqual([])
    expect(await chemin(bob, 'salaires')).toBe(404)
    expect(((await chemin(ana, 'salaires')) as Niveau[]).map((n) => n.id)).toEqual([silak.racine, 'compta'])
  })
})
