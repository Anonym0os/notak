import { useSyncExternalStore } from 'react'
import type { Habillage } from './format'

/**
 * Les habillages disponibles, tels que l'espace les publie (`useHabillages`), pour ce qui les propose loin de lui : le
 * sélecteur de thèmes du Pitch et la liste des thèmes de couleur d'une carte, au fond de la toile. Sans espace (une
 * page publique, un essai), la liste est vide.
 */
let publies: readonly Habillage[] = []
const ecouteurs = new Set<() => void>()

export function publierHabillages(liste: readonly Habillage[]) {
  if (liste.length === publies.length && liste.every((h, i) => h === publies[i])) return
  publies = liste
  for (const f of ecouteurs) f()
}

const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}

export const useHabillagesPublies = (): readonly Habillage[] => useSyncExternalStore(ecouter, () => publies, () => publies)
