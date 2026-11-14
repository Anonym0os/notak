import type { Id } from '@notak/tableau'

/**
 * Quand chaque toile (son id) ou chaque élément (`toile/e/élément`) a été ouvert pour la dernière fois ici (ms) : les
 * récents de l'appareil, avec ce qu'on y a ajouté ou changé (`bibliotheque.ts`). Ce qu'on a ouvert reste à cet
 * appareil (il ne voyage pas avec les toiles), comme l'historique d'un navigateur.
 */
const CLE_VUS = 'notak:local:vus'

export function lireVus(): Record<string, number> {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_VUS) ?? '{}') as unknown
    return brut && typeof brut === 'object' ? (brut as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function noterVu(id: string, quand = Date.now()) {
  try {
    localStorage.setItem(CLE_VUS, JSON.stringify({ ...lireVus(), [id]: quand }))
  } catch {
    // Sans stockage, la bibliothèque range par date de création.
  }
}

/** La clé d'une toile, ou d'un élément sur sa toile, parmi les récents. */
export const cleVu = (tableau: Id, element: Id | null) => (element ? `${tableau}/e/${element}` : tableau)
