/**
 * La ligne rapide : on prend la poignée au coin d'un élément choisi et on la tire ; la ligne naît au
 * relâchement, de cet élément jusqu'à l'endroit lâché. Ici, les règles : où se pose le bout lâché, et quand
 * le geste ne donne rien. Pures, sans DOM.
 */
import { type Point, type Rect, centre, contient, point } from '../../coeur/geometrie'
import { aimanterAngle, ancreDedans, pointAncre, poserExact } from '../../coeur/lignes'
import type { Extremite, Id } from '../../coeur/tableau'

/** En deçà de ce déplacement (px), c'est un clic sur la poignée, pas un tirage. */
export const SEUIL_TIRAGE = 4

/** Où le bout lâché se pose : son extrémité, le point visé, et le rectangle où le trait s'arrête (aucun s'il vise un point). */
export interface Arrivee {
  extremite: Extremite
  vise: Point
  rect: Rect | null
}

/**
 * Le bout lâché en `p` (en UG). Sur un autre élément (`cible`), il s'y accroche au centre ; en « mode dedans »
 * (`dedans`, le bout tenu immobile au-dessus de l'élément), au point précis. Dans le vide, il se pose exactement
 * où est le curseur, sans aimant de grille ; Maj cale l'angle sur 45°.
 * `null` quand la ligne n'aurait rien à montrer : le bout lâché dans l'élément d'où elle part.
 */
export function arriveeDe(source: Rect, p: Point, cible: { id: Id; rect: Rect } | null, maj: boolean, dedans = false): Arrivee | null {
  if (cible) {
    const ancre = dedans ? ancreDedans(cible.rect, p) : null
    return {
      extremite: { element: cible.id, ...(ancre ? { ancre } : {}) },
      vise: ancre ? pointAncre(cible.rect, ancre) : centre(cible.rect),
      rect: ancre ? null : cible.rect,
    }
  }
  const libre = maj ? aimanterAngle(centre(source), p) : p
  const { x, y } = poserExact(libre)
  const vise = point(x, y)
  return contient(source, vise) ? null : { extremite: { x, y }, vise, rect: null }
}

/** Le coin haut droit d'un élément, où se pose la poignée. */
export const coinPoignee = (r: Rect): Point => point(r.max.x, r.min.y)
