import type { Point } from '../../coeur/geometrie'
import { type Element, type Extremite, type Ligne, nouvelId } from '../../coeur/tableau'

/** Largeur et hauteur de la ligne libre que pose l'outil, en UG. */
export const TAILLE_LIGNE_NEUVE = 17

/** Les défauts : flèche à l'arrivée, rien au départ, plein, épaisseur 2. */
export const nouvelleLigne = (depart: Extremite, arrivee: Extremite, sur: Partial<Ligne> = {}): Element<Ligne> => ({
  id: nouvelId(),
  x: 0,
  y: 0,
  largeur: 1,
  contenu: { type: 'ligne', depart, arrivee, pointeDepart: 'rien', pointeArrivee: 'fleche', trait: 'plein', epaisseur: 2, ...sur },
})

/** Du bas-gauche au haut-droit, à partir du point donné. */
export function ligneLibre(ou: Point): Element<Ligne> {
  const [x, y] = [Math.round(ou.x), Math.round(ou.y)]
  return nouvelleLigne({ x, y: y + TAILLE_LIGNE_NEUVE }, { x: x + TAILLE_LIGNE_NEUVE, y })
}
