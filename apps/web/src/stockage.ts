import type { Tableau } from '@notak/tableau'

// Le tableau vit dans le navigateur, en attendant la synchronisation.
const CLE = 'notak:tableau'

export function lire(): Tableau {
  try {
    const json = localStorage.getItem(CLE)
    if (json) return JSON.parse(json) as Tableau
  } catch {
    // Un stockage illisible ou interdit : on repart d'un tableau vide.
  }
  return { titre: 'Mon tableau', elements: [] }
}

export function ecrire(t: Tableau) {
  try {
    localStorage.setItem(CLE, JSON.stringify(t))
  } catch {
    // Stockage plein ou interdit : le tableau reste en mémoire.
  }
}
