import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

/**
 * La barre des outils cachée revient d'elle-même quand le pointeur longe le bord gauche, comme le Dock de macOS
 * masqué : un court arrêt sur le bord la fait glisser, et elle repart quand le pointeur s'en éloigne. Le bouton du
 * premier îlot, lui, décide si elle reste.
 */

/** L'arrêt sur le bord avant que la barre paraisse : un pointeur qui ne fait que passer ne la sort pas. */
export const ARRET_BORD = 120
/** Le temps que le pointeur peut passer loin de la barre avant qu'elle reparte. */
export const SORTIE_APERCU = 350
/** La marge, à droite de la barre, où le pointeur la garde encore. */
const MARGE = 24

const BARRE = '.notak-barre-outils:not([data-selection])'

/** Vrai si le pointeur est sur la barre, son tiroir ou le bord, ou à moins de `MARGE` de son flanc droit. */
export function pres(cible: Element | null, x: number, barre: Element | null | undefined): boolean {
  if (cible?.closest('.notak-barre-outils, .notak-tiroir, .notak-outils-bord')) return true
  return !!barre && x <= barre.getBoundingClientRect().right + MARGE
}

export function useApercuOutils(racine: RefObject<HTMLElement | null>, caches: boolean) {
  const [apercu, setApercu] = useState(false)
  const arret = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!caches) setApercu(false)
  }, [caches])

  useEffect(() => {
    if (!apercu) return
    let sortie: ReturnType<typeof setTimeout> | undefined
    const bouge = (e: PointerEvent) => {
      // Un outil qu'on tire vers la toile, ou un bouton qu'on presse : la barre attend qu'on lâche.
      if (e.buttons) return
      if (pres(e.target as Element | null, e.clientX, racine.current?.querySelector(BARRE))) {
        clearTimeout(sortie)
        sortie = undefined
      } else sortie ??= setTimeout(() => setApercu(false), SORTIE_APERCU)
    }
    document.addEventListener('pointermove', bouge)
    return () => {
      clearTimeout(sortie)
      document.removeEventListener('pointermove', bouge)
    }
  }, [apercu, racine])

  useEffect(() => () => clearTimeout(arret.current), [])

  const entrer = useCallback((e: { pointerType: string }) => {
    if (e.pointerType === 'touch') return
    clearTimeout(arret.current)
    arret.current = setTimeout(() => setApercu(true), ARRET_BORD)
  }, [])
  const quitter = useCallback(() => clearTimeout(arret.current), [])

  return { apercu: caches && apercu, entrer, quitter }
}
