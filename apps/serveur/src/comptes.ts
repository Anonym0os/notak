import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import { documentAccueil } from './accueil.ts'
import { type Base, DUREE_INVITATION_MS, type Invitation, type Utilisateur } from './base.ts'
import { ROLES, role, titreAccueil } from './droits.ts'
import { indexerDocument } from './indexation.ts'
import { creerOrganisationPersonnelle } from './migrations.ts'
import { nomDuDocument } from './synchro.ts'

// La création d'un compte appartient à Better Auth (`auth.ts`) ; ce qui vient après, et qui est à Notak, est ici.

/** Huit couleurs bien distinctes, pour les curseurs. */
export const COULEURS = ['#e03131', '#f08c00', '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#5c940d'] as const

export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** L'invitation s'accepte encore : son lien n'a pas trente jours, et l'accès qu'elle donne n'est pas déjà échu. */
export const invitationValable = (i: Invitation, maintenant: number) =>
  maintenant - i.cree <= DUREE_INVITATION_MS && (i.echeance === null || i.echeance > maintenant)

/**
 * Ce compte reçoit l'accès que donne l'invitation, avec son échéance. Un rôle direct au moins aussi fort, déjà là,
 * est gardé tel quel : une invitation n'ôte rien.
 */
export function accorderInvitation(base: Base, i: Invitation, utilisateur: string): void {
  const avant = role(base.acces(i.tableau), utilisateur, i.tableau)
  base.transaction(() => {
    if (avant === null || ROLES.indexOf(avant) < ROLES.indexOf(i.role)) {
      base.definirAcces({ tableau: i.tableau, utilisateur, role: i.role })
      base.definirEcheance(i.tableau, `user:${utilisateur}`, i.echeance)
    }
    base.retirerInvitation(i.tableau, i.email)
  })
}

/**
 * Les invitations en attente pour l'adresse de ce compte deviennent des accès, s'il a prouvé que l'adresse est la
 * sienne : sinon, quelqu'un qui s'inscrirait sous l'adresse d'un autre prendrait ce qu'on lui destinait. Sans adresse
 * vérifiée, il reste le lien de l'invitation. Rend les tableaux ouverts.
 */
export function activerInvitations(base: Base, utilisateur: Utilisateur, maintenant: number): string[] {
  if (!base.emailVerifie(utilisateur.id)) return []
  const ouverts: string[] = []
  base.transaction(() => {
    for (const i of base.invitationsPour(utilisateur.email)) {
      if (!invitationValable(i, maintenant)) continue
      accorderInvitation(base, i, utilisateur.id)
      ouverts.push(i.tableau)
    }
    base.supprimerInvitationsPour(utilisateur.email)
  })
  return ouverts
}

/**
 * Donne au compte qui vient de naître son espace personnel et son tableau d'accueil, qui en est la racine, et active
 * les invitations en attente pour son adresse, si elle est vérifiée (un fournisseur qui la garantit).
 */
export function preparerCompte(base: Base, utilisateur: Utilisateur, langue?: 'fr' | 'en'): void {
  const titre = titreAccueil(utilisateur.nom, langue)
  base.transaction(() => {
    const espace = creerOrganisationPersonnelle(base.db, utilisateur, new Date().toISOString())
    base.creerTableau({ id: utilisateur.racine, titre, proprietaire: utilisateur.id, parent: null, espace })
    base.definirEspace(espace, utilisateur.racine, true)
    base.definirAcces({ tableau: utilisateur.racine, utilisateur: utilisateur.id, role: 'proprietaire' })
    // L'accueil naît rempli : il présente les gestes. Le document est enregistré comme le ferait la synchro.
    const accueil = documentAccueil(titre, langue)
    base.enregistrerDocument(nomDuDocument(utilisateur.racine), Y.encodeStateAsUpdate(accueil))
    indexerDocument(base, utilisateur.racine, accueil)
    accueil.destroy()
    activerInvitations(base, utilisateur, Date.now())
  })
}

/** L'accueil d'un espace d'équipe qui vient de naître : un tableau vide à son nom, dont le créateur est propriétaire. */
export function preparerEspace(base: Base, espace: { id: string; name: string }, createur: string): void {
  const racine = randomUUID()
  const titre = espace.name.trim().slice(0, 200)
  base.transaction(() => {
    base.creerTableau({ id: racine, titre, proprietaire: createur, parent: null, espace: espace.id })
    base.definirAcces({ tableau: racine, utilisateur: createur, role: 'proprietaire' })
    base.definirEspace(espace.id, racine, false)
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', titre)
    base.enregistrerDocument(nomDuDocument(racine), Y.encodeStateAsUpdate(doc))
    doc.destroy()
  })
}
