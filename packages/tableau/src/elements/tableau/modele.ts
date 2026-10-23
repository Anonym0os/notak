import type { Id } from '../../coeur/tableau'

/**
 * Quelle carte choisit son modèle. Le même petit état partagé que le renommage : l'outil « Tableau modèle »
 * le demande à la création, la carte (qui n'est pas « éditable » au sens de la toile) ouvre le choix.
 */
let enCours: Id | null = null
const ecouteurs = new Set<() => void>()

export const modeleEnCours = () => enCours
export function demanderModele(id: Id | null) {
  if (enCours === id) return
  enCours = id
  for (const f of ecouteurs) f()
}
export function ecouterModele(f: () => void) {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}
