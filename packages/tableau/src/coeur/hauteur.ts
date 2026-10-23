import { PX_PAR_UG } from './camera'

/**
 * La hauteur qu'on a donnée à un élément, en UG. `max` : le contenu qui dépasse est caché sous un voile ;
 * `min` : l'élément garde de la place sous son contenu. Sans hauteur, l'élément suit son contenu.
 */
export type Hauteur = { min: number } | { max: number }

/** En dessous de cet écart (px) entre la hauteur tirée et le contenu, l'élément reprend la hauteur de son contenu. */
export const ECART_AUTO = 20
/** Hauteur la plus basse d'un élément d'une ligne, et de plusieurs lignes (px). */
export const PLANCHER_UNE_LIGNE = 58
export const PLANCHER_PLUSIEURS = 86

/**
 * Ce que devient la hauteur d'un élément tiré à `tiree` px, quand son contenu en demande `naturelle` : calée sur
 * la grille, jamais sous le plancher, et rendue au contenu quand elle en est assez proche.
 */
export function hauteurTiree(tiree: number, naturelle: number): Hauteur | undefined {
  const plancher = naturelle > PLANCHER_UNE_LIGNE + 4 ? PLANCHER_PLUSIEURS : PLANCHER_UNE_LIGNE
  const h = Math.max(Math.round(tiree / PX_PAR_UG), Math.ceil(plancher / PX_PAR_UG))
  const depasse = naturelle - h * PX_PAR_UG
  // Moins d'une UG de vide vient de l'arrondi à la grille, pas d'une intention.
  if (depasse >= -PX_PAR_UG && depasse <= ECART_AUTO) return undefined
  return depasse > 0 ? { max: h } : { min: h }
}

export const memeHauteur = (a: Hauteur | undefined, b: Hauteur | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
