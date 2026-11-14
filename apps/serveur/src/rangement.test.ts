import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde } from './essai.ts'
import { AUCUN_CHANGEMENT, type Bilan, bilanDuRangement, recus } from './rangement.ts'

describe('ce que change le rangement d’une toile', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte
  let cleo: Compte
  let dan: Compte
  const lien = (id: string, tableau: string, niveau: 'lecture' | 'commentaire' = 'lecture') =>
    m.base.creerLienVisiteur({ id, tableau, jeton: `jeton-${id}`, nom: '', niveau, cree: 1, par: null, expire: null, motDePasse: null })
  const bilan = (id: string, vers: string) =>
    bilanDuRangement(m.base, id, m.base.tableau(id)!.parent, vers, `user:${ana.utilisateur.id}`, null)

  beforeAll(async () => {
    m = monde()
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    cleo = await m.compte('Cléo')
    dan = await m.compte('Dan')
    const accueil = ana.utilisateur.racine
    // « Équipe » est ouverte à Bob, et à Dan pour un temps ; « Clients » à Cléo et par un lien ; « Idée » est sous « Équipe ».
    m.tableau(ana, 'equipe', 'Équipe', undefined, accueil)
    m.tableau(ana, 'clients', 'Clients', undefined, accueil)
    m.tableau(ana, 'idee', 'Idée', undefined, 'equipe')
    m.base.definirAcces({ tableau: 'equipe', utilisateur: bob.utilisateur.id, role: 'edition' })
    m.base.definirAcces({ tableau: 'equipe', utilisateur: dan.utilisateur.id, role: 'lecture' })
    m.base.definirEcheance('equipe', `user:${dan.utilisateur.id}`, Date.now() + 86_400_000)
    m.base.definirAcces({ tableau: 'clients', utilisateur: cleo.utilisateur.id, role: 'lecture' })
    m.base.definirAcces({ tableau: 'clients', utilisateur: dan.utilisateur.id, role: 'lecture' })
    lien('l-clients', 'clients')
    lien('l-equipe', 'equipe', 'commentaire')
  })
  afterAll(() => m.fermer())

  it('qui y gagne, qui y perd, quel accès devient permanent, quels liens s’ouvrent ou s’éteignent', () => {
    // Sous « Clients » : Cléo y gagne, Bob y perd, Dan (pour un temps sous « Équipe ») l'a désormais sans échéance ;
    // le lien de « Clients » y mène, celui d'« Équipe » n'y mène plus.
    expect(bilan('idee', 'clients')).toEqual({ ...AUCUN_CHANGEMENT, nouveaux: 1, perdus: 1, permanents: 1, liensOuverts: 1, liensEteints: 1 })
  })

  it('rien ne change pour ce qu’on donne sur la toile elle-même', () => {
    m.base.definirAcces({ tableau: 'idee', utilisateur: bob.utilisateur.id, role: 'edition' })
    lien('l-idee', 'idee')
    expect(bilan('idee', 'clients')).toMatchObject({ perdus: 0, liensEteints: 1 })
    m.base.retirerAcces('idee', bob.utilisateur.id)
  })

  it('un blocage plus haut retire l’accès, sauf à qui le lève en dessous ; il n’atteint pas le propriétaire', () => {
    // « Clients » ferme ses liens et Cléo : sous elle, Idée ne s'ouvre ni à Cléo ni au lien de « Clients », et le lien
    // posé sur Idée elle-même s'éteint aussi, avec celui d'« Équipe ».
    m.base.ajouterRelation({ objet: 'tableau:clients', relation: 'bloque', sujet: 'lien:*' })
    m.base.ajouterRelation({ objet: 'tableau:clients', relation: 'bloque', sujet: `user:${cleo.utilisateur.id}` })
    expect(bilan('idee', 'clients')).toEqual({ ...AUCUN_CHANGEMENT, perdus: 1, permanents: 1, liensEteints: 2 })
    m.base.ajouterRelation({ objet: 'tableau:idee', relation: 'debloque', sujet: `user:${cleo.utilisateur.id}` })
    expect(bilan('idee', 'clients').nouveaux).toBe(1)
    expect([...recus(m.base, 'idee', ['clients']).keys()]).toContain(`user:${ana.utilisateur.id}`)
  })

  it('ranger là où l’on est déjà, ou entre deux toiles fermées, ne change rien', () => {
    m.tableau(ana, 'a', 'A', undefined, ana.utilisateur.racine)
    m.tableau(ana, 'b', 'B', undefined, ana.utilisateur.racine)
    expect(bilan('a', 'b')).toEqual(AUCUN_CHANGEMENT)
  })

  it('une équipe bloquée l’est pour chacun de ses membres', () => {
    m.tableau(ana, 'c', 'C', undefined, ana.utilisateur.racine)
    m.tableau(ana, 'd', 'D', undefined, ana.utilisateur.racine)
    m.base.definirAcces({ tableau: 'd', utilisateur: cleo.utilisateur.id, role: 'lecture' })
    expect(bilan('c', 'd').nouveaux).toBe(1)
    m.base.ajouterRelation({ objet: 'equipe:compta', relation: 'membre', sujet: `user:${cleo.utilisateur.id}` })
    m.base.ajouterRelation({ objet: 'tableau:d', relation: 'bloque', sujet: 'equipe:compta#membre' })
    expect(bilan('c', 'd').nouveaux).toBe(0)
  })
})

describe('ranger sous une toile privée, ou l’en sortir', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte
  let cleo: Compte
  let dan: Compte
  let racine: string
  const json = async <T>(r: Response | Promise<Response>): Promise<T> => (await (await r).json()) as T
  const auth = (chemin: string, compte: Compte, corps: unknown) => m.appeler(`/api/auth${chemin}`, { compte, json: corps })
  const ranger = (id: string, parent: string, options: { essai?: boolean; siPersonne?: boolean } = {}) =>
    json<Bilan & { fait: boolean }>(m.appeler(`/api/tableaux/${id}/parent`, { compte: ana, methode: 'PUT', json: { parent, ...options } }))
  const lit = async (c: Compte, id: string) => (await m.appeler(`/api/tableaux/${id}/acces`, { compte: c })).status === 200

  beforeAll(async () => {
    m = monde()
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    cleo = await m.compte('Cléo')
    dan = await m.compte('Dan')
    // L'espace d'équipe d'Ana : Bob et Cléo y sont membres, Dan invité (il ne voit que ce qu'on lui partage).
    const { id } = await json<{ id: string }>(auth('/organization/create', ana, { name: 'Silak', slug: 'silak' }))
    for (const [c, role] of [
      [bob, 'member'],
      [cleo, 'member'],
      [dan, 'guest'],
    ] as const) {
      const inv = await json<{ id: string }>(auth('/organization/invite-member', ana, { email: c.utilisateur.email, role, organizationId: id }))
      await auth('/organization/accept-invitation', c, { invitationId: inv.id })
    }
    racine = (await json<{ id: string; racine: string }[]>(m.appeler('/api/espaces', { compte: ana }))).find((e) => e.id === id)!.racine
    // « Compta » est privée, Cléo y est invitée ; « Notes » est ouverte à tout l'espace, et partagée à Dan.
    m.tableau(ana, 'compta', 'Compta', undefined, racine)
    m.tableau(ana, 'notes', 'Notes', undefined, racine)
    await m.appeler('/api/tableaux/compta/prive', { compte: ana, methode: 'PUT', json: { prive: true } })
    await m.appeler('/api/tableaux/compta/partage', { compte: ana, json: { email: cleo.utilisateur.email, role: 'lecture' } })
    await m.appeler('/api/tableaux/notes/partage', { compte: ana, json: { email: dan.utilisateur.email, role: 'lecture' } })
  })
  afterAll(() => m.fermer())

  it('compte les membres qui la perdent, sans l’invitée de là-haut ni ce qu’on a partagé sur elle', async () => {
    expect(await lit(bob, 'notes')).toBe(true)
    // Sous « Compta », Bob ne la voit plus ; Cléo, invitée là-haut, la garde, et Dan l'a reçue sur « Notes » même.
    expect(await ranger('notes', 'compta', { essai: true })).toEqual({ ...AUCUN_CHANGEMENT, membresPerdus: 1, fait: false })
    // Le glisser d'une carte sur une toile ne range que si personne n'y perd : la toile reste où elle est.
    expect(await ranger('notes', 'compta', { siPersonne: true })).toMatchObject({ membresPerdus: 1, fait: false })
    expect(await lit(bob, 'notes')).toBe(true)
  })

  it('rangée pour de bon, elle se ferme à eux ; ressortie, elle leur revient, et le bilan le dit', async () => {
    expect(await ranger('notes', 'compta')).toMatchObject({ membresPerdus: 1, fait: true })
    expect([await lit(bob, 'notes'), await lit(cleo, 'notes'), await lit(dan, 'notes')]).toEqual([false, true, true])
    expect(await ranger('notes', racine, { essai: true })).toEqual({ ...AUCUN_CHANGEMENT, membresNouveaux: 1, fait: false })
    expect(await ranger('notes', racine)).toMatchObject({ fait: true })
    expect(await lit(bob, 'notes')).toBe(true)
  })
})
