import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import { documentAccueil } from './accueil.ts'
import type { Base, Utilisateur } from './base.ts'
import { titreAccueil } from './droits.ts'
import { indexerDocument } from './indexation.ts'
import { creerOrganisationPersonnelle } from './migrations.ts'
import { nomDuDocument } from './synchro.ts'

// La création d'un compte appartient à Better Auth (`auth.ts`) ; ce qui vient après, et qui est à Notak, est ici.

/** Huit couleurs bien distinctes, pour les curseurs. */
export const COULEURS = ['#e03131', '#f08c00', '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#5c940d'] as const

export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Donne au compte qui vient de naître son espace personnel et son tableau d'accueil, qui en est la racine, et active
 * les invitations en attente pour son adresse.
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
    for (const i of base.invitationsPour(utilisateur.email)) base.definirAcces({ tableau: i.tableau, utilisateur: utilisateur.id, role: i.role })
    base.supprimerInvitationsPour(utilisateur.email)
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
