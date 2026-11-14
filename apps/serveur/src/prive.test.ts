import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'
import { indexerDocument } from './indexation.ts'
import { cartesCachees, sansElements } from './prive.ts'
import { nomDuDocument } from './synchro.ts'

// Une toile « Seulement les personnes invitées » : ce que le serveur garantit, route par route, à qui n'y est pas invité.

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

type EspaceLu = { id: string; nom: string; racine: string; personnel: boolean }
type AccesGeneral = { prive: boolean; herite: boolean; espace: { nom: string; personnel: boolean } | null; accueil: boolean; modifiable: boolean }
const json = async <T>(r: Response | Promise<Response>): Promise<T> => (await (await r).json()) as T
const auth = (chemin: string, compte: Compte, corps: unknown) => m.appeler(`/api/auth${chemin}`, { compte, json: corps })

/** L'espace d'équipe « Silak » d'Ana, où Bob et Cléo sont membres. */
async function silak(): Promise<EspaceLu> {
  const { id } = await json<{ id: string }>(auth('/organization/create', ana, { name: 'Silak', slug: 'silak' }))
  for (const c of [bob, cleo]) {
    const inv = await json<{ id: string }>(auth('/organization/invite-member', ana, { email: c.utilisateur.email, role: 'member', organizationId: id }))
    await auth('/organization/accept-invitation', c, { invitationId: inv.id })
  }
  return (await json<EspaceLu[]>(m.appeler('/api/espaces', { compte: ana }))).find((e) => e.id === id)!
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

const statut = async (c: Compte, chemin: string) => (await m.appeler(chemin, { compte: c })).status
const rendrePrive = (c: Compte, id: string, prive: boolean) => m.appeler(`/api/tableaux/${id}/prive`, { compte: c, methode: 'PUT', json: { prive } })
const partager = (c: Compte, id: string, email: string) => m.appeler(`/api/tableaux/${id}/partage`, { compte: c, json: { email, role: 'lecture' } })

/** La compta, sous l'accueil de Silak, dont la carte y est posée ; les salaires dessous, et une page dedans. */
async function compta(e: EspaceLu) {
  m.tableau(ana, 'compta', 'Compta 2026', undefined, e.racine)
  m.tableau(ana, 'salaires', 'Salaires', undefined, 'compta')
  ecrire('salaires', () => {})
  ecrire('compta', (doc) => {
    poser(doc, { type: 'document', titre: 'Bilan', texte: texte('Les comptes de l’année') }, { id: 'bilan' })
    poser(doc, { type: 'tableau', cible: 'salaires' }, { id: 'carte-salaires' })
  })
  ecrire(e.racine, (doc) => {
    poser(doc, { type: 'tableau', cible: 'compta', titre: 'Compta 2026' }, { id: 'carte-compta' })
    poser(doc, { type: 'note', texte: texte('Bienvenue') }, { id: 'accueil-note' })
  })
}

describe('une toile privée', () => {
  it('ne s’ouvre plus par l’espace, ni ce qu’elle contient ; ses invités et son propriétaire l’ouvrent', async () => {
    const e = await silak()
    await compta(e)
    expect(await statut(bob, '/api/tableaux/compta/acces')).toBe(200)

    const r = await rendrePrive(ana, 'compta', true)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ prive: true, herite: false, espace: { nom: 'Silak', personnel: false }, accueil: false, modifiable: true })
    expect(await statut(bob, '/api/tableaux/compta/acces')).toBe(404)
    expect(await statut(bob, '/api/tableaux/salaires/acces')).toBe(404)
    expect(await statut(bob, '/api/tableaux/compta/prive')).toBe(404)
    expect(await statut(ana, '/api/tableaux/salaires/acces')).toBe(200)

    // Cléo y est invitée : elle l'ouvre, et ce qu'elle contient ; Bob, toujours pas.
    expect((await partager(ana, 'compta', cleo.utilisateur.email)).status).toBe(200)
    expect(await statut(cleo, '/api/tableaux/salaires/acces')).toBe(200)
    expect(await statut(bob, '/api/tableaux/compta/acces')).toBe(404)

    // Rouverte à tout l'espace, Bob la retrouve.
    expect((await json<AccesGeneral>(rendrePrive(ana, 'compta', false))).prive).toBe(false)
    expect(await statut(bob, '/api/tableaux/salaires/acces')).toBe(200)
  })

  it('ce qu’elle contient l’est comme elle, et ne se rouvre que là-haut', async () => {
    const e = await silak()
    await compta(e)
    await rendrePrive(ana, 'compta', true)
    expect(await json<AccesGeneral>(m.appeler('/api/tableaux/salaires/prive', { compte: ana }))).toEqual({
      prive: true,
      herite: true,
      espace: { nom: 'Silak', personnel: false },
      accueil: false,
      modifiable: false,
    })
    const refus = await rendrePrive(ana, 'salaires', false)
    expect(refus.status).toBe(409)
    expect(((await refus.json()) as { code: string }).code).toBe('prive_herite')
    // Une toile créée sous une toile privée naît privée.
    expect((await m.appeler('/api/tableaux', { compte: ana, json: { id: 'paie-mars', titre: 'Mars', parent: 'compta' } })).status).toBe(201)
    expect(await statut(bob, '/api/tableaux/paie-mars/acces')).toBe(404)
  })

  it('n’a pas de second cran à l’accueil, ni dans un espace personnel ; seul son propriétaire le change', async () => {
    const e = await silak()
    await compta(e)
    expect((await json<{ code: string }>(rendrePrive(ana, e.racine, true))).code).toBe('accueil_pas_prive')
    expect(await json(m.appeler(`/api/tableaux/${e.racine}/prive`, { compte: ana }))).toMatchObject({ prive: false, accueil: true, modifiable: false })
    m.tableau(ana, 'perso', 'À moi')
    expect((await json<{ code: string }>(rendrePrive(ana, 'perso', true))).code).toBe('espace_personnel')
    expect((await json<AccesGeneral>(m.appeler('/api/tableaux/perso/prive', { compte: ana }))).modifiable).toBe(false)
    // Bob écrit dans l'espace, mais ne partage pas : il ne ferme pas non plus une toile qui n'est pas à lui.
    expect((await rendrePrive(bob, 'compta', true)).status).toBe(403)
    expect((await json<AccesGeneral>(m.appeler('/api/tableaux/compta/prive', { compte: bob }))).modifiable).toBe(false)
  })

  it('n’apparaît ni dans la bibliothèque, ni dans les récents, ni dans la recherche, ni dans les notifications des autres', async () => {
    const e = await silak()
    await compta(e)
    await m.appeler('/api/tableaux/compta/vu', { compte: bob, json: {} })
    m.base.noterNotification({ destinataire: bob.utilisateur.id, genre: 'commentaire', tableau: 'compta', element: 'bilan', auteur: ana.utilisateur.id, extrait: 'Relis le bilan', instant: 5000 })
    const biblio = (c: Compte) => json<{ tableau: string; element: string | null; prive?: boolean; resume: { boites?: unknown[] } }[]>(m.appeler('/api/bibliotheque?genres=document', { compte: c }))
    expect((await biblio(bob)).some((x) => x.tableau === 'compta')).toBe(true)
    expect((await json<{ id: string }[]>(m.appeler('/api/recents', { compte: bob }))).map((x) => x.id)).toContain('compta')
    expect((await json<{ nonLues: number }>(m.appeler('/api/notifications', { compte: bob }))).nonLues).toBe(1)

    await rendrePrive(ana, 'compta', true)
    // Ni la toile, ni sa page, ni ce qui est dessous ; la vignette de l'accueil ne montre plus sa carte.
    const deBob = await biblio(bob)
    expect(deBob.filter((x) => x.tableau === 'compta' || x.tableau === 'salaires')).toEqual([])
    expect(deBob.find((x) => x.tableau === e.racine && x.element === null)?.resume.boites).toHaveLength(1)
    expect((await json<{ id: string }[]>(m.appeler('/api/recents', { compte: bob }))).map((x) => x.id)).not.toContain('compta')
    expect(await json(m.appeler('/api/recherche?q=bilan', { compte: bob }))).toEqual([])
    expect(await json(m.appeler('/api/notifications', { compte: bob }))).toEqual({ notifications: [], nonLues: 0 })

    // Ana la voit, avec son cadenas, et sa carte dans la vignette de l'accueil.
    const dAna = await biblio(ana)
    expect(dAna.find((x) => x.tableau === 'compta' && x.element === null)?.prive).toBe(true)
    expect(dAna.find((x) => x.tableau === 'salaires' && x.element === null)?.prive).toBe(true)
    expect(dAna.find((x) => x.tableau === e.racine && x.element === null)?.resume.boites).toHaveLength(2)
    expect((await json<unknown[]>(m.appeler('/api/recherche?q=bilan', { compte: ana }))).length).toBe(1)
  })

  it('sa carte sur la toile parente se tait : la toile ne la montre pas, ni l’activité, ni le lien d’un visiteur', async () => {
    const e = await silak()
    await compta(e)
    m.base.noterActivite({ tableau: e.racine, auteur: ana.utilisateur.id, genre: 'cree', element: 'carte-compta', typeElement: 'tableau', libelle: 'Compta 2026', instant: 1000 }, 0)
    m.base.noterActivite({ tableau: e.racine, auteur: ana.utilisateur.id, genre: 'cree', element: 'accueil-note', typeElement: 'note', libelle: 'Bienvenue', instant: 1001 }, 0)
    m.base.noterNotification({ destinataire: bob.utilisateur.id, genre: 'modification', tableau: e.racine, element: 'carte-compta', auteur: ana.utilisateur.id, extrait: 'Compta 2026', instant: 2000 })
    const lien = await json<{ jeton: string }>(m.appeler(`/api/tableaux/${e.racine}/liens`, { compte: ana, json: { nom: 'Client', niveau: 'lecture', expire: null } }))
    await rendrePrive(ana, 'compta', true)

    expect(await json(m.appeler(`/api/tableaux/${e.racine}/droits`, { compte: bob }))).toMatchObject({ role: 'edition', caches: ['carte-compta'] })
    expect(await json(m.appeler(`/api/tableaux/${e.racine}/droits`, { compte: ana }))).not.toHaveProperty('caches')
    const activite = await json<{ evenements: { element: string }[] }>(m.appeler(`/api/tableaux/${e.racine}/activite`, { compte: bob }))
    expect(activite.evenements.map((x) => x.element)).toEqual(['accueil-note'])
    expect((await json<{ evenements: unknown[] }>(m.appeler(`/api/tableaux/${e.racine}/activite`, { compte: ana }))).evenements).toHaveLength(2)
    expect(await json(m.appeler('/api/notifications', { compte: bob }))).toEqual({ notifications: [], nonLues: 0 })

    const vue = await json<{ elements: { id: string }[]; titres: Record<string, string> }>(m.appeler(`/api/public/${lien.jeton}`))
    expect(vue.elements.map((x) => x.id)).toEqual(['accueil-note'])
    expect(vue.titres).toEqual({})
  })
})

describe('les personnes à qui proposer un tableau', () => {
  it('les membres de son espace, par leur nom sans accents ou leur adresse, avec leur photo et l’accès qu’ils ont déjà', async () => {
    const e = await silak()
    await compta(e)
    await rendrePrive(ana, 'compta', true)
    m.base.reglerCompte(cleo.utilisateur.id, { couleur: '#3366ff' })
    type Personne = { id: string; nom: string; email: string; couleur: string; photo: string | null; espace: string; invite: boolean; acces: string | null }
    const personnes = (q: string) => json<Personne[]>(m.appeler(`/api/tableaux/compta/personnes?q=${encodeURIComponent(q)}`, { compte: ana }))
    expect(await personnes('cle')).toEqual([
      { id: cleo.utilisateur.id, nom: 'Cléo', email: cleo.utilisateur.email, couleur: '#3366ff', photo: null, espace: 'Silak', invite: false, acces: null },
    ])
    expect((await personnes('BOB@')).map((p) => p.nom)).toEqual(['Bob'])
    // Sans rien de tapé : tout l'espace, par ordre alphabétique, sans soi.
    expect((await personnes('')).map((p) => p.nom)).toEqual(['Bob', 'Cléo'])
    await partager(ana, 'compta', cleo.utilisateur.email)
    expect((await personnes('cléo'))[0]?.acces).toBe('lecture')
    // La liste de qui a accès la montre de même, par sa couleur ou sa photo.
    expect(await json(m.appeler('/api/tableaux/compta/acces', { compte: ana }))).toContainEqual(expect.objectContaining({ nom: 'Cléo', couleur: '#3366ff', photo: null, role: 'lecture' }))
    // L'annuaire n'est qu'à qui peut partager.
    expect(await statut(bob, `/api/tableaux/${e.racine}/personnes?q=`)).toBe(403)
  })

  it('pour un tableau d’un espace personnel, les membres des espaces d’équipe du compte', async () => {
    await silak()
    m.tableau(ana, 'perso', 'À moi')
    const r = await json<{ nom: string; espace: string }[]>(m.appeler('/api/tableaux/perso/personnes?q=', { compte: ana }))
    expect(r).toEqual([expect.objectContaining({ nom: 'Bob', espace: 'Silak' }), expect.objectContaining({ nom: 'Cléo', espace: 'Silak' })])
    // Bob, membre de Silak, y trouve Ana et Cléo pour le sien.
    m.tableau(bob, 'a-bob', 'À Bob')
    expect(await json(m.appeler('/api/tableaux/a-bob/personnes?q=', { compte: bob }))).toEqual([
      expect.objectContaining({ nom: 'Ana' }),
      expect.objectContaining({ nom: 'Cléo' }),
    ])
  })
})

describe('les cartes à taire', () => {
  it('celles qui mènent à une toile illisible, et les lignes qui y tiennent', () => {
    const t = {
      elements: [
        { id: 'c1', x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible: 'privee' } },
        { id: 'c2', x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible: 'ouverte', raccourci: true } },
        { id: 'n', x: 0, y: 0, largeur: 10, contenu: { type: 'note' } },
        { id: 'l', x: 0, y: 0, largeur: 10, contenu: { type: 'ligne', depart: { element: 'n' }, arrivee: { element: 'c1' } } },
      ],
    }
    const caches = cartesCachees(t, (id) => id === 'ouverte')
    expect([...caches]).toEqual(['c1'])
    expect(sansElements(t, caches).elements.map((e) => e.id)).toEqual(['c2', 'n'])
  })
})
