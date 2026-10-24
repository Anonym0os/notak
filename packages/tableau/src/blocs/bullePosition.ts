import type { Boite } from './menuAncre'

/**
 * Où paraît la bulle de mise en forme et quand (docs/NOTION.md § 4, relevé « 4-rendu-mesures » § 6.4) : un panneau de
 * 192 px qui s'ouvre en bas à droite de la fin de la sélection, 16 px à droite et 16 px dessous, et dont la place est
 * prise à l'apparition : une sélection qui grandit ensuite au clavier ne la déplace pas. Des fonctions pures.
 */

export const ECART_BULLE = 16
/** L'antirebond de la bulle : elle paraît, et se cache, quand la sélection est restée stable 200 ms. */
export const ATTENTE_BULLE = 200
/** La marge gardée entre la bulle et le bord de la fenêtre. */
export const MARGE_BULLE = 12

export interface Fenetre {
  largeur: number
  hauteur: number
}

/**
 * La place de la bulle pour une sélection qui finit en `fin` : à droite (+16) et dessous (+16). Elle rentre dans la
 * fenêtre : poussée à gauche si elle déborde à droite ; passée au-dessus de la sélection s'il n'y a pas la place
 * dessous (le relevé ne l'a pas mesuré), et en dernier recours contre le bas.
 */
export function placerBulle(fin: Boite, taille: { largeur: number; hauteur: number }, fenetre: Fenetre): { left: number; top: number } {
  const maxGauche = fenetre.largeur - MARGE_BULLE - taille.largeur
  const left = Math.max(MARGE_BULLE, Math.min(fin.right + ECART_BULLE, maxGauche))
  let top = fin.bottom + ECART_BULLE
  if (top + taille.hauteur > fenetre.hauteur - MARGE_BULLE) {
    const dessus = fin.top - ECART_BULLE - taille.hauteur
    top = dessus >= MARGE_BULLE ? dessus : Math.max(MARGE_BULLE, fenetre.hauteur - MARGE_BULLE - taille.hauteur)
  }
  return { left, top }
}

export interface Plage {
  de: number
  a: number
}

/** Les deux sélections se touchent : c'est la même qui s'étend ou se resserre, la bulle reste où elle est. */
export const memeSelection = (avant: Plage | null, apres: Plage): boolean => !!avant && apres.de <= avant.a && apres.a >= avant.de

/** Ce qui fait paraître la bulle (tous vrais) ; `lien` : l'éditeur de lien tient la place, la bulle se retire. */
export interface ConditionsBulle {
  texteChoisi: boolean
  focus: boolean
  code: boolean
  blocsChoisis: boolean
  glisse: boolean
  lien: boolean
}

export const bulleVisible = (c: ConditionsBulle): boolean => c.texteChoisi && c.focus && !c.code && !c.blocsChoisis && !c.glisse && !c.lien

/** Les boutons que la sélection permet : type, lien et équation seulement dans un seul champ de texte. */
export function boutonsBulle(dansUnSeulBloc: boolean, { commenter, plus }: { commenter: boolean; plus: boolean }) {
  return { type: dansUnSeulBloc, lien: dansUnSeulBloc, commenter, plus }
}
