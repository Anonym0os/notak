import type { Rect } from '../../coeur/geometrie'
import { clesEntre, trierLecture } from '../../coeur/ordre'
import { type Element, type Id, LARGEUR_COLONNE, type Operation, aimanter, nouvelleColonne, placeDe } from '../../coeur/tableau'
import { t } from '../../langue'

export interface Groupable {
  element: Element
  rect: Rect
}

/**
 * Grouper en colonne : une colonne neuve de 34 UG, centrée sur le cadre englobant (sa hauteur : 15 UG plus celle de
 * chaque élément), qui reçoit les éléments de haut en bas, puis de gauche à droite. Les lignes attachées aux
 * éléments rangés partent à la corbeille (`lignes`, à la date `date`). Un seul pas : la création et tous les rangements.
 */
export function pasDeGroupement(items: readonly Groupable[], lignes: readonly Element[] = [], date = Date.now()): { colonne: Id; pas: Operation[] } {
  const [x0, y0] = [Math.min(...items.map((i) => i.rect.min.x)), Math.min(...items.map((i) => i.rect.min.y))]
  const [x1, y1] = [Math.max(...items.map((i) => i.rect.max.x)), Math.max(...items.map((i) => i.rect.max.y))]
  const hauteur = 15 + items.reduce((somme, i) => somme + (i.rect.max.y - i.rect.min.y), 0)
  const [x, y] = aimanter({ x: (x0 + x1) / 2 - LARGEUR_COLONNE / 2, y: (y0 + y1) / 2 - hauteur / 2 })
  const colonne = nouvelleColonne(x, y, t('type.colonne'))
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
    ...lignes.map((l): Operation => ({ type: 'ranger', id: l.id, de: placeDe(l), vers: { x: l.x, y: l.y, corbeille: date } })),
  ]
  return { colonne: colonne.id, pas }
}
