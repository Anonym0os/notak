/** Largeur minimale d'un élément qu'on redimensionne, en UG, quand son type n'en demande pas d'autre. */
export const LARGEUR_MIN_DEFAUT = 17
/** La largeur de référence : celle d'une note, où le redimensionnement s'aimante. */
export const LARGEUR_STANDARD = 34
/** À moins de cet écart de la largeur standard, la largeur s'y colle. */
export const ECART_AIMANT = 2

/** La largeur minimale d'un type pour ce contenu : un nombre fixe, ou ce que le contenu en dit. */
export function largeurMinDe(min: number | ((c: never) => number) | undefined, contenu: unknown): number {
  if (typeof min === 'function') return min(contenu as never)
  return min ?? LARGEUR_MIN_DEFAUT
}

/** La largeur que prend un élément quand la poignée est tirée jusqu'à `brute` (UG, fractionnaire). */
export function largeurTiree(brute: number, min: number = LARGEUR_MIN_DEFAUT): number {
  let largeur = Math.round(brute)
  if (Math.abs(largeur - LARGEUR_STANDARD) < ECART_AIMANT) largeur = LARGEUR_STANDARD
  return Math.max(min, largeur)
}

/**
 * La largeur après un double-clic sur la poignée : de la largeur standard à la largeur naturelle
 * (si le type en a une), sinon retour à la largeur standard.
 */
export function largeurDoubleClic(actuelle: number, naturelle: number | undefined, min: number = LARGEUR_MIN_DEFAUT): number {
  if (actuelle === LARGEUR_STANDARD && naturelle !== undefined) return Math.max(min, Math.round(naturelle))
  return LARGEUR_STANDARD
}
