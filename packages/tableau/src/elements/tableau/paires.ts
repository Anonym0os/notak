import type { Element } from '../../coeur/tableau'
import { couleurTexteSur } from '../note/couleurs'

/** Un fond et la couleur de son glyphe, ensemble. */
export interface Paire {
  fond: string
  glyphe: string
}

/**
 * Les couleurs libres déjà posées sur les cartes de tableau : d'abord les paires (un fond et un glyphe choisis, ou
 * un fond libre avec le glyphe que son fond impose), les plus employées en tête, au plus `max`.
 */
export function pairesDuTableau(elements: readonly Element[], max = 10): Paire[] {
  const compte = new Map<string, { paire: Paire; n: number }>()
  for (const e of elements) {
    if (e.contenu.type !== 'tableau' || e.corbeille !== undefined) continue
    const { fond, glyphe } = e.contenu
    if (!fond) continue
    const paire = { fond, glyphe: glyphe ?? couleurTexteSur(fond) }
    const cle = `${paire.fond}/${paire.glyphe}`
    const vu = compte.get(cle)
    if (vu) vu.n++
    else compte.set(cle, { paire, n: 1 })
  }
  // Tri stable : à égalité, la première rencontrée reste devant.
  return [...compte.values()].sort((a, b) => b.n - a.n).slice(0, max).map((x) => x.paire)
}

/** Les fonds libres des cartes de tableau, les plus employés en tête. */
export const fondsDeTableaux = (elements: readonly Element[]): string[] => [...new Set(pairesDuTableau(elements, 50).map((p) => p.fond))]
