import { type Point, type Rect, chevauche } from './geometrie'
import type { Id } from './tableau'

export type Selection = ReadonlySet<Id>

/**
 * Ce que prend un lasso : tout élément qui touche le rectangle.
 * Avec `inverser` (Maj ou Cmd), le lasso bascule l'état de ce qu'il touche
 * par rapport à la sélection d'avant le geste.
 */
export function lasso(zone: Rect, elements: Iterable<[Id, Rect | Point[]]>, avant: Selection, inverser: boolean): Set<Id> {
  const touches = new Set<Id>()
  // Un tracé (une ligne) n'est pris que si le lasso touche le trait, pas sa boîte.
  for (const [id, r] of elements) if (Array.isArray(r) ? traverse(zone, r) : chevauche(zone, r)) touches.add(id)
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

const dedans = (z: Rect, p: Point) => p.x >= z.min.x && p.x <= z.max.x && p.y >= z.min.y && p.y <= z.max.y

/** Vrai si la ligne brisée `points` passe dans `zone` : un point dedans, ou un segment qui en croise un bord. */
export function traverse(zone: Rect, points: readonly Point[]): boolean {
  if (points.some((p) => dedans(zone, p))) return true
  const coins = [zone.min, { x: zone.max.x, y: zone.min.y }, zone.max, { x: zone.min.x, y: zone.max.y }]
  for (let i = 1; i < points.length; i++) {
    for (let j = 0; j < 4; j++) if (secants(points[i - 1]!, points[i]!, coins[j]!, coins[(j + 1) % 4]!)) return true
  }
  return false
}

const cote = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
const secants = (a: Point, b: Point, c: Point, d: Point) => cote(a, b, c) * cote(a, b, d) < 0 && cote(c, d, a) * cote(c, d, b) < 0
