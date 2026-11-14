import { useSyncExternalStore } from 'react'
import type { Id } from '../../coeur/tableau'

/**
 * Quel élément la toile doit montrer dès qu'elle l'affiche : « Retrouver le tableau d'origine » ouvre un autre
 * tableau, « Afficher dans sa toile » et « Voir » de la bibliothèque aussi, et c'est l'élément, une fois posé là, qui se
 * choisit et sur lequel la vue se centre (la toile, ou la carte elle-même, prend la demande). L'id d'une toile vise sa
 * carte sur celle qui la porte. Une demande que personne ne prend s'éteint au bout de quelques secondes.
 */
const DUREE = 15_000
let demande: { id: Id; jusqua: number } | null = null
/**
 * Le fil à ouvrir une fois l'élément montré (une notification de commentaire y mène) : `''` celui de l'élément (une
 * épingle, ou le fil accroché à une carte), sinon la clé d'un passage commenté de sa marge, ou le sujet d'une carte.
 */
let fil: { element: Id; cle: Id; jusqua: number } | null = null

// Une demande faite pendant qu'on regarde déjà la toile visée doit la faire réagir : elle écoute.
let version = 0
const ecouteurs = new Set<() => void>()
const prevenir = () => {
  version++
  for (const f of ecouteurs) f()
}
export const ecouterDemandes = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}
export const versionDemandes = () => version

export const montrerDemande = (maintenant = Date.now()): Id | null => (demande && demande.jusqua > maintenant ? demande.id : null)
export function demanderAMontrer(id: Id | null, maintenant = Date.now()) {
  demande = id ? { id, jusqua: maintenant + DUREE } : null
  fil = null
  prevenir()
}
/** Prend la demande si elle vise cet élément (une seule fois). */
export function prendreDemande(id: Id): boolean {
  if (montrerDemande() !== id) return false
  demande = null
  return true
}

/** Montre cet élément, puis ouvre ce fil qu'il porte (voir `fil`). */
export function demanderLeFil(element: Id, cle: Id, maintenant = Date.now()) {
  demanderAMontrer(element, maintenant)
  fil = { element, cle, jusqua: maintenant + DUREE }
  prevenir()
}
/** Le fil qu'on demande d'ouvrir dans cet élément, sans le prendre ; `null` : aucun. */
export const filDemande = (element: Id, maintenant = Date.now()): Id | null => (fil && fil.element === element && fil.jusqua > maintenant ? fil.cle : null)
/** Prend le fil demandé dans cet élément (une seule fois) ; `null` : aucun. */
export function prendreFil(element: Id): Id | null {
  const cle = filDemande(element)
  if (cle !== null) fil = null
  return cle
}
/** Le fil qu'on demande d'ouvrir dans cet élément, relu quand une demande arrive. */
export const useFilDemande = (element: Id): Id | null => useSyncExternalStore(ecouterDemandes, () => filDemande(element))
