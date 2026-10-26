import { type RefCallback, useCallback } from 'react'

/**
 * Les bandeaux du bas (l'accueil, une mise à jour, une copie reçue, l'administration…) s'empilent sans se couvrir.
 * Un écart fixe ne suffisait pas : un bandeau qui passe sur deux lignes cachait celui du dessus. Chacun reste là où
 * il est rendu (il garde le thème de la toile) ; on ne fait que le poser au-dessus des précédents, à leur hauteur
 * réelle, dans l'ordre où ils sont apparus.
 */
const BAS = 16
const ECART = 8

const pile: HTMLElement[] = []
let observateur: ResizeObserver | null = null

function ranger() {
  let bas = BAS
  for (const el of pile) {
    el.style.bottom = `${bas}px`
    bas += el.offsetHeight + ECART
  }
}

/** À poser sur l'élément d'un bandeau du bas : `<aside ref={useBandeau()} className="bandeau">`. */
export function useBandeau<T extends HTMLElement>(): RefCallback<T> {
  return useCallback((el: T | null) => {
    if (!el) return
    pile.push(el)
    if (!observateur && typeof ResizeObserver !== 'undefined') observateur = new ResizeObserver(ranger)
    observateur?.observe(el)
    ranger()
    return () => {
      const i = pile.indexOf(el)
      if (i >= 0) pile.splice(i, 1)
      observateur?.unobserve(el)
      el.style.bottom = ''
      ranger()
    }
  }, [])
}

/** Pour les essais : la pile, dans l'ordre. */
export const bandeauxEmpiles = (): readonly HTMLElement[] => pile
