/** Les durées de l'animation d'une case (ms) : le cochage dure 300 (rebond, puis coche tracée), le décochage 100. */
export const DUREE_CASE = { coche: 300, decoche: 100 }

/** Le dernier geste posé sur chaque case : un geste plus récent rend caduc le nettoyage du précédent. */
const jetons = new WeakMap<Element, number>()
let compteur = 0

/**
 * Joue l'animation d'une case qu'on vient de cocher (`coche`) ou de décocher. Posée au geste seulement : une case
 * qui s'affiche déjà cochée, ou qui naît d'un collage, n'anime rien. Un clic pendant l'animation la relance de zéro
 * (et le nettoyage de l'ancien geste ne coupe pas le nouveau).
 */
export function animerCase(case_: HTMLElement | SVGElement, coche: boolean) {
  const genre = coche ? 'coche' : 'decoche'
  const jeton = ++compteur
  jetons.set(case_, jeton)
  // Retirer puis reposer l'attribut après un reflux relance l'animation même si le genre est le même.
  delete case_.dataset.anime
  case_.getBoundingClientRect()
  case_.dataset.anime = genre
  setTimeout(() => {
    if (jetons.get(case_) !== jeton) return
    delete case_.dataset.anime
    jetons.delete(case_)
  }, DUREE_CASE[genre])
}
