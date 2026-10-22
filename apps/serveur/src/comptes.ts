import { randomInt, randomUUID } from 'node:crypto'
import type { Base, Utilisateur } from './base.ts'
import { hacher } from './motsDePasse.ts'

/** Huit couleurs bien distinctes, pour les curseurs. */
export const COULEURS = ['#e03131', '#f08c00', '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#5c940d'] as const

export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase()
}

export class ErreurCompte extends Error {
  readonly code: 'existe' | 'invalide'
  constructor(code: 'existe' | 'invalide', message: string) {
    super(message)
    this.code = code
  }
}

/** Crée le compte, son tableau d'accueil, et active les invitations en attente pour cette adresse. */
export async function inscrire(
  base: Base,
  entree: { email: string; motDePasse: string; nom: string },
  choisirCouleur: () => string = () => COULEURS[randomInt(COULEURS.length)]!,
): Promise<Utilisateur> {
  const email = normaliserEmail(entree.email)
  const nom = entree.nom.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ErreurCompte('invalide', 'adresse')
  if (!nom || nom.length > 80) throw new ErreurCompte('invalide', 'nom')
  if (entree.motDePasse.length < 8 || entree.motDePasse.length > 200) throw new ErreurCompte('invalide', 'mot de passe')
  if (base.utilisateurParEmail(email)) throw new ErreurCompte('existe', 'adresse prise')

  const utilisateur: Utilisateur = {
    id: randomUUID(),
    email,
    nom,
    hash: await hacher(entree.motDePasse),
    couleur: choisirCouleur(),
    racine: randomUUID(),
  }
  try {
    base.transaction(() => {
      base.creerUtilisateur(utilisateur)
      base.creerTableau({ id: utilisateur.racine, titre: 'Accueil', proprietaire: utilisateur.id, parent: null })
      base.definirAcces({ tableau: utilisateur.racine, utilisateur: utilisateur.id, role: 'proprietaire' })
      for (const i of base.invitationsPour(email)) base.definirAcces({ tableau: i.tableau, utilisateur: utilisateur.id, role: i.role })
      base.supprimerInvitationsPour(email)
    })
  } catch (e) {
    if (base.utilisateurParEmail(email)) throw new ErreurCompte('existe', 'adresse prise')
    throw e
  }
  return utilisateur
}
