import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * La barre de la visionneuse PDF, de la plus large à la plus serrée. Elle prend le premier palier où le nom du fichier a
 * sa place et où rien ne déborde, mesuré dans la page même : la place que laissent les boutons dépend de la langue des
 * libellés, du doigt (cibles de 44 px), des boutons du moment (la liste des commentaires, le téléchargement annoté) et,
 * dans l'app de Mac, des boutons de la fenêtre. Une largeur d'écran fixée d'avance se trompait toujours quelque part.
 *
 * - `libelles` : tout sur une rangée, les boutons avec leur libellé (le bureau, sur un grand écran) ;
 * - `icones` : la même rangée, les icônes seules (le nom et le libellé restent dans l'info-bulle) ;
 * - `menu` : une rangée ; la liste des commentaires, les téléchargements et « ouvrir » passent dans « ••• » ;
 * - `deux-rangs` : le nom, la recherche, « ••• » et fermer, puis dessous le zoom et la page ; dessiner et commenter
 *   rejoignent « ••• » (le téléphone).
 */
export const PALIERS = ['libelles', 'icones', 'menu', 'deux-rangs'] as const
export type Palier = (typeof PALIERS)[number]

/** Le nom garde au moins cette largeur (une vingtaine de lettres), ou toute la sienne s'il est plus court. */
export const TITRE_MIN = 160

/** Ce qu'on mesure de la barre rendue à un palier, en pixels CSS. */
export interface MesureBarre {
  /** La largeur que le nom occupe, et celle qu'il voudrait sans ellipse. */
  titre: number
  titreEntier: number
  /** La largeur de la barre, et celle de son contenu (plus grande quand il déborde). */
  barre: number
  barreEntiere: number
}

/** Le palier tient : le nom a sa place, et rien ne sort de la barre (au pixel près, pour les arrondis). */
export const palierTient = (m: MesureBarre): boolean => m.barreEntiere <= m.barre + 1 && m.titre + 1 >= Math.min(m.titreEntier, TITRE_MIN)

/**
 * La largeur que la barre offre à son contenu : sa marge change sans elle (les boutons de la fenêtre de l'app de Mac,
 * qui partent en plein écran), et c'est elle que `ResizeObserver` suit.
 */
const largeurUtile = (b: HTMLElement): number => {
  const s = getComputedStyle(b)
  return b.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0)
}

/**
 * Le palier de la barre `barre`, dont le nom est `titre`. Au premier rendu, puis quand la largeur de la barre change ou
 * que `cle` change (ce qui change la place des boutons), il repart du plus large et descend tant que ça ne tient pas,
 * avant que l'écran ne se peigne : on ne voit jamais un palier qui déborde. Sans `ResizeObserver` (jsdom), il garde le
 * premier palier qui tient à l'ouverture.
 */
export function usePalierBarre(barre: RefObject<HTMLElement | null>, titre: RefObject<HTMLElement | null>, cle: string): Palier {
  // Un objet neuf à chaque essai : repartir du plus large refait un rendu, et donc une mesure, même déjà au plus large.
  const [{ rang }, setEssai] = useState({ rang: 0 })
  const largeur = useRef(-1)

  // À chaque rendu, un cran plus bas si celui-ci déborde. Les rendus s'enchaînent avant la peinture.
  useLayoutEffect(() => {
    const b = barre.current
    const s = titre.current
    if (!b || !s) return
    largeur.current = largeurUtile(b)
    if (rang >= PALIERS.length - 1) return
    if (!palierTient({ titre: s.clientWidth, titreEntier: s.scrollWidth, barre: b.clientWidth, barreEntiere: b.scrollWidth })) setEssai({ rang: rang + 1 })
  })

  // Le contenu change : on retente le plus large. Après la mesure, pour que ce soit lui qui l'emporte.
  useLayoutEffect(() => setEssai({ rang: 0 }), [cle])

  // La fenêtre change de largeur (tourner l'iPad, Split View, redimensionner la fenêtre, le plein écran du Mac) : on
  // retente le plus large.
  useEffect(() => {
    const b = barre.current
    if (!b || typeof ResizeObserver === 'undefined') return
    const suivi = new ResizeObserver(() => {
      if (largeurUtile(b) === largeur.current) return
      largeur.current = largeurUtile(b)
      flushSync(() => setEssai({ rang: 0 }))
    })
    suivi.observe(b)
    return () => suivi.disconnect()
  }, [barre])

  return PALIERS[rang]!
}
