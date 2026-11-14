/**
 * La molette d'une souris (une MX Master) sur une rangée qui défile de côté, comme « Reprendre ». Le Finder (ses
 * rangées groupées) et Drive laissent la molette verticale à la page : la tourner au-dessus d'une rangée fait défiler la
 * page, et la rangée suit le geste de côté (la molette du pouce, Maj + molette, le trackpad). Quand la page n'a rien à
 * faire défiler, la molette verticale passe à la rangée, comme la bande de la présentation Galerie du Finder : elle ne
 * tourne jamais dans le vide, et ne prend jamais la page en otage.
 */

/** Ce que la rangée et la page disent de leur défilement. */
interface Rangee {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
}
interface Page {
  scrollHeight: number
  clientHeight: number
}

/** Une ligne de défilement (`deltaMode` 1, Firefox), en pixels. */
const LIGNE = 16

/** De combien la rangée défile de côté pour ce cran de molette ; 0 : on laisse le geste au navigateur. */
export function decalageDeLaMolette(
  e: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  rangee: Rangee,
  page: Page,
): number {
  // ⌃ zoome, Maj défile déjà de côté ; un geste de côté (le pouce, le trackpad) fait défiler la rangée tout seul.
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return 0
  if (e.deltaY === 0 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return 0
  // La page défile : la molette est à elle (le pixel de plus absorbe un arrondi de zoom).
  if (page.scrollHeight > page.clientHeight + 1) return 0
  const reste = rangee.scrollWidth - rangee.clientWidth
  if (reste <= 0) return 0
  const pas = e.deltaY * (e.deltaMode === 1 ? LIGNE : e.deltaMode === 2 ? rangee.clientWidth : 1)
  return Math.min(reste, Math.max(0, rangee.scrollLeft + pas)) - rangee.scrollLeft
}

/** Fait suivre la molette verticale à cette rangée, quand `page` (ce qui défile autour) n'a rien à faire défiler. */
export function suivreLaMolette(rangee: HTMLElement, page: () => HTMLElement | null): () => void {
  const tourner = (e: WheelEvent) => {
    const autour = page()
    const d = autour ? decalageDeLaMolette(e, rangee, autour) : 0
    if (d === 0) return
    e.preventDefault()
    rangee.scrollLeft += d
  }
  // Pas passif : la page ne doit pas recevoir le cran que la rangée a pris.
  rangee.addEventListener('wheel', tourner, { passive: false })
  return () => rangee.removeEventListener('wheel', tourner)
}
