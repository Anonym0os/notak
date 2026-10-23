import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde } from './essai.ts'

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte

beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
  m.tableau(ana, 'tableau-un', 'Un')
  m.base.definirAcces({ tableau: 'tableau-un', utilisateur: bob.utilisateur.id, role: 'lecture' })
  const geste = (auteur: Compte, genre: 'cree' | 'modifie', element: string, instant: number) =>
    m.base.noterActivite({ tableau: 'tableau-un', auteur: auteur.utilisateur.id, genre, element, typeElement: 'note', libelle: element, instant }, 0)
  geste(ana, 'cree', 'a', 1000)
  geste(ana, 'cree', 'b', 2000)
  geste(bob, 'modifie', 'a', 3000)
})
afterAll(() => m.fermer())

type Activite = { evenements: { id: number; genre: string; auteur: { nom: string } }[]; groupes: { auteur: { nom: string }; resume: Record<string, number> }[]; dernier: number }

describe('GET /api/tableaux/:id/activite', () => {
  it('rend les gestes du plus récent au plus ancien, et leurs groupes', async () => {
    const r = await m.appeler('/api/tableaux/tableau-un/activite', { compte: ana })
    expect(r.status).toBe(200)
    const corps = (await r.json()) as Activite
    expect(corps.evenements.map((e) => [e.auteur.nom, e.genre])).toEqual([['Bob', 'modifie'], ['Ana', 'cree'], ['Ana', 'cree']])
    expect(corps.groupes.map((g) => [g.auteur.nom, g.resume])).toEqual([['Bob', { modifie: 1 }], ['Ana', { cree: 2 }]])
    expect(corps.dernier).toBe(corps.evenements[0]!.id)
  })

  it('`depuis` ne rend que le nouveau, `limite` borne', async () => {
    const tout = (await (await m.appeler('/api/tableaux/tableau-un/activite', { compte: ana })).json()) as Activite
    const apres = (await (await m.appeler(`/api/tableaux/tableau-un/activite?depuis=${tout.evenements[1]!.id}`, { compte: ana })).json()) as Activite
    expect(apres.evenements).toHaveLength(1)
    const rien = (await (await m.appeler(`/api/tableaux/tableau-un/activite?depuis=${tout.dernier}`, { compte: ana })).json()) as Activite
    expect(rien).toMatchObject({ evenements: [], groupes: [], dernier: tout.dernier })
    const un = (await (await m.appeler('/api/tableaux/tableau-un/activite?limite=1', { compte: ana })).json()) as Activite
    expect(un.evenements).toHaveLength(1)
  })

  it('la lecture suffit ; sans session 401, sans droit 404', async () => {
    expect((await m.appeler('/api/tableaux/tableau-un/activite', { compte: bob })).status).toBe(200)
    expect((await m.appeler('/api/tableaux/tableau-un/activite')).status).toBe(401)
    expect((await m.appeler('/api/tableaux/tableau-un/activite', { compte: cleo })).status).toBe(404)
  })
})

type Liste = { notifications: { id: number; genre: string; titreTableau: string; lu: boolean; auteur: { nom: string } }[]; nonLues: number }
const lire = async (c?: Compte) => (await (await m.appeler('/api/notifications', { compte: c })).json()) as Liste
const marquer = (json: unknown, c?: Compte) => m.appeler('/api/notifications/lues', { compte: c, json })

describe('notifications', () => {
  it('sans session : 401', async () => {
    expect((await m.appeler('/api/notifications')).status).toBe(401)
    expect((await marquer({ tout: true })).status).toBe(401)
  })

  it('partager un tableau prévient la personne invitée, avec le titre et l’auteur', async () => {
    const r = await m.appeler('/api/tableaux/tableau-un/partage', { compte: ana, json: { email: cleo.utilisateur.email, role: 'edition' } })
    expect(r.status).toBe(200)
    const l = await lire(cleo)
    expect(l.nonLues).toBe(1)
    expect(l.notifications).toMatchObject([{ genre: 'partage', titreTableau: 'Un', lu: false, auteur: { nom: 'Ana' } }])
    expect((await lire(ana)).notifications).toEqual([])
  })

  it('on ne marque que les siennes : celles d’un autre restent non lues', async () => {
    m.base.noterNotification({ destinataire: bob.utilisateur.id, genre: 'modification', tableau: 'tableau-un', element: 'a', auteur: ana.utilisateur.id, extrait: 'a', instant: 5000 })
    const idBob = (await lire(bob)).notifications[0]!.id
    expect((await (await marquer({ ids: [idBob] }, cleo)).json())).toEqual({ marquees: 0 })
    expect((await lire(bob)).nonLues).toBe(1)
    expect((await (await marquer({ ids: [idBob] }, bob)).json())).toEqual({ marquees: 1 })
    expect(await lire(bob)).toMatchObject({ nonLues: 0, notifications: [{ lu: true }] })
  })

  it('« tout marquer comme lu » vide le compteur de ce compte seulement', async () => {
    m.base.noterNotification({ destinataire: cleo.utilisateur.id, genre: 'commentaire', tableau: 'tableau-un', element: 'f', auteur: ana.utilisateur.id, extrait: 'Salut', instant: 6000 })
    m.base.noterNotification({ destinataire: bob.utilisateur.id, genre: 'commentaire', tableau: 'tableau-un', element: 'f', auteur: ana.utilisateur.id, extrait: 'Salut', instant: 6001 })
    expect((await lire(cleo)).nonLues).toBe(2)
    expect((await (await marquer({ tout: true }, cleo)).json())).toEqual({ marquees: 2 })
    expect((await lire(cleo)).nonLues).toBe(0)
    expect((await lire(bob)).nonLues).toBe(1)
  })

  it('refuse une demande mal formée', async () => {
    expect((await marquer({}, bob)).status).toBe(400)
    expect((await marquer({ ids: ['x'] }, bob)).status).toBe(400)
    expect((await marquer({ ids: 3 }, bob)).status).toBe(400)
  })

  it('un tableau qu’on ne peut plus ouvrir disparaît de la liste, sans le compteur d’avance', async () => {
    m.base.retirerAcces('tableau-un', bob.utilisateur.id)
    const l = await lire(bob)
    expect(l.notifications).toEqual([])
  })
})
