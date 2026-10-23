import { type RefObject, useLayoutEffect } from 'react'
import { RESSORT_LISTES, courbeRessort } from './coeur/ressort'

/**
 * Le rang de la liste d'outils montrée à gauche : création (0), sélection (1), écriture (2). Passer à un rang plus
 * haut fait arriver la nouvelle liste de la droite, revenir à un rang plus bas, de la gauche.
 */
export type RangListe = 0 | 1 | 2

let derniere: RangListe = 0

/** Du côté de la barre, l'écart que la liste parcourt en glissant, en pixels. */
const ECART = 72

/**
 * D'une liste à l'autre la barre glisse à ressort (raideur 300, amortissement 30, précision 0,1) : la nouvelle liste
 * arrive en fondu, et la flèche retour n'apparaît qu'à 70 % du mouvement. Sans effet pour qui réduit les animations.
 */
export function useGlissement(barre: RefObject<HTMLElement | null>, rang: RangListe) {
  useLayoutEffect(() => {
    const n = barre.current
    if (!n) return
    const sens = rang > derniere ? 1 : rang < derniere ? -1 : 0
    derniere = rang
    if (sens === 0 || typeof n.animate !== 'function') return
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const { duree, easing } = courbeRessort(RESSORT_LISTES, ECART)
    const liste = [...n.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.classList.contains('notak-barre-ressort') && !c.classList.contains('notak-barre-retour'))
    // Ce qui glisse ne déborde pas de la barre pendant le mouvement ; ses menus, eux, ne sont pas rognés ensuite.
    n.style.clipPath = 'inset(0)'
    const animations = liste.map((c) =>
      c.animate({ transform: [`translateX(${sens * ECART}px)`, 'translateX(0)'], opacity: [0, 1] }, { duration: duree, easing, fill: 'backwards' }),
    )
    // La flèche retour se montre aux trois quarts du chemin (70 % du mouvement).
    const retour = n.querySelector<HTMLElement>('.notak-barre-retour')
    const fleche = retour?.animate({ opacity: [0, 1] }, { duration: 100, delay: duree * 0.7, fill: 'backwards' })
    const fin = setTimeout(() => n.style.removeProperty('clip-path'), duree + 50)
    return () => {
      clearTimeout(fin)
      n.style.removeProperty('clip-path')
      for (const a of animations) a.cancel()
      fleche?.cancel()
    }
  }, [barre, rang])
}
