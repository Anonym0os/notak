import { type CSSProperties, type ReactNode, type RefObject, type SyntheticEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Camera, PX_PAR_UG } from '../../coeur/camera'
import { point } from '../../coeur/geometrie'
import type { ContexteToile } from '../types'
import { variablesDe } from '../surcouche'
import { type Boite, cameraPourVoir } from './vueOutil'
import '../croquis/croquis.css'

/** Ce que la barre lit de la toile en plus des variables qu'une surcouche reprend : le filet du choix, le texte pâle. */
const EN_PLUS = ['--notak-selection', '--notak-pale']

/**
 * Le thème de la toile où vit `ancre`, pour ce qui se pose sous `document.body`, hors d'elle : ses variables, et le
 * `color-scheme` qui peint les contrôles du navigateur (un curseur). Il suit le thème qu'on change outil ouvert.
 * `null` le temps de la première mesure : rien ne paraît d'abord aux couleurs du thème clair.
 */
export function useThemeDeLaToile(ancre: RefObject<Element | null>): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const noeud = ancre.current
    const espace = noeud?.closest<HTMLElement>('.notak-espace')
    let vu = ''
    const lire = () => {
      const toile = noeud?.closest('.notak-toile')
      const v: Record<string, string> = toile ? variablesDe(toile) : {}
      if (toile) {
        const calcule = getComputedStyle(toile)
        for (const nom of EN_PLUS) {
          const x = calcule.getPropertyValue(nom).trim()
          if (x) v[nom] = x
        }
      }
      const suite = { ...v, colorScheme: espace?.dataset.theme === 'sombre' ? 'dark' : 'light' }
      const cle = JSON.stringify(suite)
      if (cle !== vu) {
        vu = cle
        setStyle(suite as CSSProperties)
      }
    }
    lire()
    const suivi = new MutationObserver(lire)
    if (espace) suivi.observe(espace, { attributes: true, attributeFilter: ['data-theme'] })
    suivi.observe(document.documentElement, { attributes: true, attributeFilter: ['data-habillage', 'data-mode'] })
    return () => suivi.disconnect()
  }, [ancre])
  return style
}

/** Ce qu'on fait dans la barre ne remonte pas à la toile : un portail renvoie ses événements à ses parents React. */
const clos = (e: SyntheticEvent) => e.stopPropagation()

/**
 * La barre d'un outil d'image (recadrer, détourer, dessiner) : la pilule du croquis, au bas de la fenêtre. Elle vit
 * sous `document.body` : ni le zoom de la toile ne la grossit ou ne la rapetisse, ni une image plus haute que l'écran
 * ne la pousse dehors, et le doigt la trouve toujours. Elle reprend le thème de la toile où est l'image, qu'elle lit
 * depuis sa propre ancre, restée dans la carte : la référence d'un parent n'est pas encore posée quand l'effet d'un
 * enfant s'exécute.
 */
export function BarreOutil({ etiquette, className, children }: { etiquette: string; className?: string; children: ReactNode }) {
  const ancre = useRef<HTMLSpanElement>(null)
  const theme = useThemeDeLaToile(ancre)
  return (
    <>
      <span ref={ancre} hidden />
      {theme &&
        createPortal(
          <div
            className={`notak-croquis-barre notak-annotation-barre${className ? ` ${className}` : ''}`}
            role="toolbar"
            aria-label={etiquette}
            data-outil-image=""
            style={theme}
            onPointerDown={clos}
            onPointerMove={clos}
            onPointerUp={clos}
            onClick={clos}
            onDoubleClick={clos}
            onContextMenu={clos}
            onKeyDown={clos}
            onWheel={clos}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}

const AIR = 16

/** La zone de la toile qu'aucune barre ne couvre : sous l'en-tête, à droite des outils, au-dessus de la barre de l'outil. */
function zoneLibre(toile: Element): Boite {
  const r = toile.getBoundingClientRect()
  const zone: Boite = { gauche: AIR, haut: AIR, droite: r.width - AIR, bas: r.height - AIR }
  const visible = (n: Element) => {
    const b = n.getBoundingClientRect()
    return b.width > 0 && b.height > 0 ? b : null
  }
  const entete = document.querySelector('.notak-entete')
  const e = entete && visible(entete)
  if (e && e.bottom > r.top) zone.haut = Math.max(zone.haut, e.bottom - r.top + AIR)
  for (const n of document.querySelectorAll('.notak-barre-outils')) {
    const b = visible(n)
    if (b && b.right < r.left + r.width / 2) zone.gauche = Math.max(zone.gauche, b.right - r.left + AIR)
  }
  // La barre de l'outil entre en glissant de 15 px : sa place est celle où elle s'arrête, pas celle de l'instant.
  const barre = document.querySelector<HTMLElement>('[data-outil-image]')
  const bas = barre ? Number.parseFloat(getComputedStyle(barre).bottom) : Number.NaN
  const haut = barre && Number.isFinite(bas) ? window.innerHeight - bas - barre.offsetHeight : r.bottom - 140
  zone.bas = Math.min(zone.bas, haut - r.top - AIR)
  return zone
}

/**
 * La caméra que la toile montre à l'instant, telle qu'elle la pose sur sa racine pour ce qui se place en pixels
 * d'écran (`--notak-cam-*`) : pendant un geste ou une animation, celle du contexte est encore l'ancienne, et la carte
 * mesurée à l'écran ne se rapporterait pas au bon endroit du tableau.
 */
function cameraAffichee(toile: HTMLElement, repli: Camera): Camera {
  const lire = (nom: string) => Number.parseFloat(toile.style.getPropertyValue(nom))
  const [x, y, k] = [lire('--notak-cam-ox'), lire('--notak-cam-oy'), lire('--notak-cam-k')]
  return Number.isFinite(x) && Number.isFinite(y) && k > 0 ? { origine: point(x, y), echelle: k / PX_PAR_UG } : repli
}

/**
 * À l'ouverture d'un outil, sa carte vient à l'écran si elle n'y est pas : l'image peut être loin (ouverte depuis la
 * visionneuse), ou plus grande que l'écran (une photo en hauteur, la toile à 300 %), et ses poignées dehors.
 * `entiere` : toute la carte doit se voir ; sinon un bout suffit.
 */
export function useAmenerALaVue(ancre: RefObject<Element | null>, contexte: ContexteToile, entiere: boolean) {
  // Une fois, à l'ouverture : ensuite la vue est à qui la mène.
  const fait = useRef(false)
  const sur = useRef({ contexte, entiere })
  sur.current = { contexte, entiere }
  useEffect(() => {
    if (fait.current) return
    // Après la mise en page : la carte a pris la taille de l'outil, et la barre est posée.
    const image = requestAnimationFrame(() => {
      fait.current = true
      const { contexte: ctx, entiere: tout } = sur.current
      const noeud = ancre.current
      const carte = noeud?.closest('.notak-carte') ?? noeud
      const toile = noeud?.closest<HTMLElement>('.notak-toile')
      if (!carte || !toile || !ctx.poserCamera) return
      const t = toile.getBoundingClientRect()
      const c = carte.getBoundingClientRect()
      const suite = cameraPourVoir(
        cameraAffichee(toile, ctx.camera),
        { gauche: c.left - t.left, haut: c.top - t.top, droite: c.right - t.left, bas: c.bottom - t.top },
        zoneLibre(toile),
        tout,
      )
      if (suite) ctx.poserCamera(suite, false)
    })
    return () => cancelAnimationFrame(image)
  }, [ancre])
}
