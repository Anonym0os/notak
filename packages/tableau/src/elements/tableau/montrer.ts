import type { Id } from '../../coeur/tableau'

/**
 * Quelle carte la toile doit montrer dès qu'elle l'affiche : « Retrouver le tableau d'origine » ouvre un autre
 * tableau, et c'est la carte, une fois posée là, qui se choisit et s'y centre (elle prend la demande).
 */
let demande: Id | null = null

export const montrerDemande = () => demande
export function demanderAMontrer(id: Id | null) {
  demande = id
}
/** Prend la demande si elle vise cette carte (une seule fois). */
export function prendreDemande(id: Id): boolean {
  if (demande !== id) return false
  demande = null
  return true
}
