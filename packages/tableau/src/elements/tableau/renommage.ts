import type { Id } from '../../coeur/tableau'

/**
 * Quelle carte est en train d'être renommée. Un petit état partagé : la barre de sélection et
 * l'outil de création le demandent, la carte (qui n'est pas « éditable » au sens de la toile) l'exécute.
 */
let enCours: Id | null = null
const ecouteurs = new Set<() => void>()

export const renommageEnCours = () => enCours
export function demanderRenommage(id: Id | null) {
  if (enCours === id) return
  enCours = id
  for (const f of ecouteurs) f()
}
export function ecouterRenommage(f: () => void) {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}
