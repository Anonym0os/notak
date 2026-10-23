import { PLANCHER_UNE_LIGNE } from '../../coeur/hauteur'
import type { Hauteur } from '../../coeur/hauteur'
import { PX_PAR_UG } from '../../coeur/camera'

/** Un cran de hauteur, en UG. */
export const CRAN = 4
const PLANCHER = Math.ceil(PLANCHER_UNE_LIGNE / PX_PAR_UG)

/**
 * La hauteur d'un élément rangé après un cran de plus (`1`) ou de moins (`-1`), depuis sa hauteur d'aujourd'hui
 * `vue` (UG). `null` : rendre la hauteur au contenu. Plus haut garde de la place sous le contenu (`min`) ;
 * moins haut le coupe sous un voile (`max`), jamais sous le plancher d'une ligne.
 */
export function hauteurApresCran(actuelle: Hauteur | undefined, vue: number, sens: 1 | -1): Hauteur | null {
  const base = Math.round(vue)
  if (actuelle && 'max' in actuelle) {
    const n = actuelle.max + sens * CRAN
    return n < PLANCHER ? actuelle : { max: n }
  }
  if (actuelle && 'min' in actuelle) {
    // Le contenu dépasse déjà le plancher : le baisser n'y changerait rien, l'élément redevient libre.
    if (sens === -1 && base > actuelle.min) return null
    const n = actuelle.min + sens * CRAN
    return n <= PLANCHER ? null : { min: n }
  }
  return sens === 1 ? { min: base + CRAN } : base - CRAN < PLANCHER ? null : { max: base - CRAN }
}
