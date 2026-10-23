import { type RefObject, useLayoutEffect } from 'react'

/** Ce qu'on laisse entre un menu et le bord de l'écran. */
const MARGE = 8
/** La largeur de la barre de gauche : une barre flottante ne se glisse jamais dessous. */
export const LARGEUR_BARRE_GAUCHE = 76

/** Les menus de la barre de sélection : les menus déroulants, et le tiroir « … » de la barre de gauche. */
export const MENUS_BORNES = '[role="menu"], .notak-tiroir'

/**
 * Tient un menu dans l'écran. S'il dépasse en bas, il se retourne vers le haut (`data-retourne`, dont le CSS fait le
 * reste) ; s'il dépasse encore d'un côté ou en haut, il glisse (`translate`) juste assez. À gauche, il ne passe pas
 * sous la barre de gauche quand elle est là.
 */
export function bornerMenu(menu: HTMLElement, minX: number) {
  menu.style.translate = ''
  delete menu.dataset.retourne
  let r = menu.getBoundingClientRect()
  // Rien à mesurer : fermé, ou pas de mise en page (tests).
  if (menu.hidden || (r.width === 0 && r.height === 0)) return
  const hauteur = window.innerHeight
  const largeur = window.innerWidth
  if (r.bottom > hauteur - MARGE) {
    menu.dataset.retourne = ''
    r = menu.getBoundingClientRect()
  }
  let dx = 0
  let dy = 0
  if (r.right > largeur - MARGE) dx = largeur - MARGE - r.right
  if (r.left + dx < minX) dx = minX - r.left
  if (r.bottom > hauteur - MARGE) dy = hauteur - MARGE - r.bottom
  if (r.top + dy < MARGE) dy = MARGE - r.top
  if (dx !== 0 || dy !== 0) menu.style.translate = `${dx}px ${dy}px`
}

/** Le bord gauche que les menus d'une barre ne dépassent pas, en pixels d'écran. */
export function bordGauche(barre: HTMLElement, sousBarreGauche: boolean): number {
  const toile = barre.closest('.notak-toile')
  const x = toile ? toile.getBoundingClientRect().left : 0
  return x + (sousBarreGauche ? LARGEUR_BARRE_GAUCHE + MARGE : MARGE)
}

/**
 * Borne les menus ouverts dans une barre, chaque fois qu'ils paraissent ou que la fenêtre change de taille.
 * Les menus sont des enfants que les outils montent et démontent eux-mêmes : on les suit au DOM plutôt qu'à chaque outil.
 */
export function useMenusBornes(barre: RefObject<HTMLElement | null>, sousBarreGauche: boolean) {
  useLayoutEffect(() => {
    const el = barre.current
    if (!el) return
    const tout = () => {
      const minX = bordGauche(el, sousBarreGauche)
      for (const m of el.querySelectorAll<HTMLElement>(MENUS_BORNES)) bornerMenu(m, minX)
    }
    tout()
    const suivi = new MutationObserver(tout)
    suivi.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })
    window.addEventListener('resize', tout)
    return () => {
      suivi.disconnect()
      window.removeEventListener('resize', tout)
    }
  }, [barre, sousBarreGauche])
}

/**
 * La barre flottante se centre sur la sélection, mais reste dans la toile : jamais sous la barre de gauche, jamais
 * au-delà du bord droit. `centre` est l'abscisse voulue (le CSS recentre par `translateX(-50%)`).
 */
export function useBarreBornee(barre: RefObject<HTMLElement | null>, centre: number, actif: boolean) {
  useLayoutEffect(() => {
    const el = barre.current
    if (!el || !actif) return
    const poser = () => {
      const hote = el.parentElement
      const largeurHote = hote?.clientWidth ?? 0
      const w = el.offsetWidth
      if (!hote || largeurHote === 0 || w === 0) return
      const min = LARGEUR_BARRE_GAUCHE + MARGE + w / 2
      const max = largeurHote - MARGE - w / 2
      // Plus large que la place : on garde le bord gauche à l'abri de la barre de gauche.
      const x = max < min ? min : Math.min(Math.max(centre, min), max)
      el.style.left = `${x}px`
    }
    poser()
    window.addEventListener('resize', poser)
    const suivi = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(poser)
    suivi?.observe(el)
    return () => {
      window.removeEventListener('resize', poser)
      suivi?.disconnect()
    }
  }, [barre, centre, actif])
}
