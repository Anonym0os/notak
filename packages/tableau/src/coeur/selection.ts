import { type Rect, chevauche } from './geometrie'
import type { Id } from './tableau'

export type Selection = ReadonlySet<Id>

/**
 * Ce que prend un lasso : tout élément qui touche le rectangle.
 * Avec `inverser` (Maj ou Cmd), le lasso bascule l'état de ce qu'il touche
 * par rapport à la sélection d'avant le geste.
 */
export function lasso(zone: Rect, elements: Iterable<[Id, Rect]>, avant: Selection, inverser: boolean): Set<Id> {
  const touches = new Set<Id>()
  for (const [id, r] of elements) if (chevauche(zone, r)) touches.add(id)
  if (!inverser) return touches
  const s = new Set(avant)
  for (const id of touches) if (!s.delete(id)) s.add(id)
  return s
}

/**
 * Un clic sur un élément. Cmd bascule l'élément ; sinon il devient la seule
 * sélection, sauf s'il en fait déjà partie (pour pouvoir glisser le groupe).
 */
export function cliquer(selection: Selection, id: Id, basculer: boolean): Set<Id> {
  const s = new Set(selection)
  if (basculer) {
    if (!s.delete(id)) s.add(id)
    return s
  }
  return s.has(id) ? s : new Set([id])
}
