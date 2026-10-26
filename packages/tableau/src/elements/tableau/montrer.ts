import type { Id } from '../../coeur/tableau'

/**
 * Quel élément la toile doit montrer dès qu'elle l'affiche : « Retrouver le tableau d'origine » ouvre un autre
 * tableau, « Afficher dans sa toile » et « Voir » de la bibliothèque aussi, et c'est l'élément, une fois posé là, qui se
 * choisit et sur lequel la vue se centre (la toile, ou la carte elle-même, prend la demande). L'id d'une toile vise sa
 * carte sur celle qui la porte. Une demande que personne ne prend s'éteint au bout de quelques secondes.
 */
const DUREE = 15_000
let demande: { id: Id; jusqua: number } | null = null

export const montrerDemande = (maintenant = Date.now()): Id | null => (demande && demande.jusqua > maintenant ? demande.id : null)
export function demanderAMontrer(id: Id | null, maintenant = Date.now()) {
  demande = id ? { id, jusqua: maintenant + DUREE } : null
}
/** Prend la demande si elle vise cet élément (une seule fois). */
export function prendreDemande(id: Id): boolean {
  if (montrerDemande() !== id) return false
  demande = null
  return true
}
