/** Les durées de l'animation d'une case (ms) : le cochage dure 300 (rebond, puis coche tracée), le décochage 100. */
const DUREE = { coche: 300, decoche: 100 }

/**
 * Joue l'animation d'une case qu'on vient de cocher (`coche`) ou de décocher. Posée au geste seulement : une case
 * qui s'affiche déjà cochée, ou qui naît d'un collage, n'anime rien.
 */
export function animerCase(case_: HTMLElement, coche: boolean) {
  const genre = coche ? 'coche' : 'decoche'
  case_.dataset.anime = genre
  setTimeout(() => {
    if (case_.dataset.anime === genre) delete case_.dataset.anime
  }, DUREE[genre])
}
