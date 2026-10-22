import type { Rect } from '../../coeur/geometrie'
import { clesEntre, trierLecture } from '../../coeur/ordre'
import { type Element, type Id, type Operation, aimanter, nouvelleColonne, placeDe } from '../../coeur/tableau'

export interface Groupable {
  element: Element
  rect: Rect
}

/**
 * Grouper en colonne : une colonne neuve au coin haut-gauche du cadre englobant, qui reçoit les éléments
 * de haut en bas, puis de gauche à droite. Un seul pas : la création et tous les rangements.
 */
export function pasDeGroupement(items: readonly Groupable[]): { colonne: Id; pas: Operation[] } {
  const [x, y] = aimanter({
    x: Math.min(...items.map((i) => i.rect.min.x)),
    y: Math.min(...items.map((i) => i.rect.min.y)),
  })
  const colonne = nouvelleColonne(x, y)
  const ranges = trierLecture(items.map((i) => ({ ...i, x: i.rect.min.x, y: i.rect.min.y })))
  const cles = clesEntre(undefined, undefined, ranges.length)
  const pas: Operation[] = [
    { type: 'creer', element: colonne },
    ...ranges.map(
      ({ element: e }, i): Operation => ({
        type: 'ranger',
        id: e.id,
        de: placeDe(e),
        vers: { parent: colonne.id, ordre: cles[i], x: e.x, y: e.y },
      }),
    ),
  ]
  return { colonne: colonne.id, pas }
}
