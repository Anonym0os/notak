import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde } from './essai.ts'
import { AUCUN_CHANGEMENT, bilanDuRangement, recus } from './rangement.ts'

describe('ce que change le rangement d’une toile', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte
  let cleo: Compte
  let dan: Compte
  const lien = (id: string, tableau: string, niveau: 'lecture' | 'commentaire' = 'lecture') =>
    m.base.creerLienVisiteur({ id, tableau, jeton: `jeton-${id}`, nom: '', niveau, cree: 1, par: null, expire: null, motDePasse: null })
  const bilan = (id: string, vers: string) =>
    bilanDuRangement(m.base, id, m.base.tableau(id)!.parent, vers, (s) => s === `user:${ana.utilisateur.id}`)

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
    expect(bilan('idee', 'clients')).toEqual({ nouveaux: 1, perdus: 1, permanents: 1, liensOuverts: 1, liensEteints: 1 })
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
    expect(bilan('idee', 'clients')).toEqual({ nouveaux: 0, perdus: 1, permanents: 1, liensOuverts: 0, liensEteints: 2 })
    m.base.ajouterRelation({ objet: 'tableau:idee', relation: 'debloque', sujet: `user:${cleo.utilisateur.id}` })
    expect(bilan('idee', 'clients').nouveaux).toBe(1)
    expect([...recus(m.base, 'idee', ['clients']).keys()]).toContain(`user:${ana.utilisateur.id}`)
  })

  it('ranger là où l’on est déjà, ou entre deux toiles fermées, ne change rien', () => {
    m.tableau(ana, 'a', 'A', undefined, ana.utilisateur.racine)
    m.tableau(ana, 'b', 'B', undefined, ana.utilisateur.racine)
    expect(bilan('a', 'b')).toEqual(AUCUN_CHANGEMENT)
  })
})
