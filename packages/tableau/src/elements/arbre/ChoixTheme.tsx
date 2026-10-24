import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../langue'
import { CadreDiapo } from './Diapo'
import { type RatioPitch, THEMES_PITCH, dimensionsDuRatio } from './themesPitch'

/**
 * Un popover posé sous (ou au-dessus de) son ancre, hors du panneau qui le lance : le panneau défile et rogne, le
 * popover non. Il se ferme au clic dehors et à Échap.
 */
export function PopoverFixe({ ancre, fermer, largeur, vers = 'bas', children, className }: { ancre: HTMLElement | null; fermer(): void; largeur: number; vers?: 'bas' | 'haut'; children: ReactNode; className?: string }) {
  const racine = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    if (!ancre) return
    const r = ancre.getBoundingClientRect()
    const left = Math.min(window.innerWidth - largeur - 8, Math.max(8, r.left + r.width / 2 - largeur / 2))
    setPlace(
      vers === 'bas'
        ? { left, top: r.bottom + 8, maxHeight: window.innerHeight - r.bottom - 28 }
        : { left, bottom: window.innerHeight - r.top + 8, maxHeight: r.top - 28 },
    )
  }, [ancre, largeur, vers])
  useLayoutEffect(() => {
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node
      // Un clic dans un autre popover du mode Pitch (le sélecteur de thèmes ouvert depuis les réglages) ne le ferme pas.
      if (!racine.current?.contains(cible) && !ancre?.contains(cible) && !(cible as Element).closest?.('.notak-pitch-popover')) fermer()
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      fermer()
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', echap, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', echap, true)
    }
  }, [ancre, fermer])
  if (!ancre || !place) return ancre ? <div ref={racine} hidden /> : null
  return createPortal(
    <div ref={racine} className={className ? `notak-pitch-popover ${className}` : 'notak-pitch-popover'} style={{ ...place, width: largeur }} role="dialog" onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    ancre.closest('.notak-arbre-fond') ?? document.body,
  )
}

/** La taille d'une vignette selon le rapport : la plus grande dimension à 112. */
const tailleVignette = (r: RatioPitch) => {
  const { l, h } = dimensionsDuRatio(r)
  const k = 112 / Math.max(l, h)
  return { l: Math.round(l * k), h: Math.round(h * k) }
}

const largeurPopover = (r: RatioPitch) => ({ '16:9': 276, '4:3': 276, '3:4': 316, '9:16': 304 })[r]

/** Le sélecteur de thèmes : une vignette par thème, deux par ligne. Le choix ne ferme pas la fenêtre. */
export function ChoixTheme({ ancre, theme, ratio, choisir, fermer, vers }: { ancre: HTMLElement | null; theme: string; ratio: RatioPitch; choisir(id: string): void; fermer(): void; vers?: 'bas' | 'haut' }) {
  const taille = tailleVignette(ratio)
  return (
    <PopoverFixe ancre={ancre} fermer={fermer} largeur={largeurPopover(ratio)} {...(vers ? { vers } : {})} className="notak-pitch-themes">
      {THEMES_PITCH.map((th) => (
        <button key={th.id} type="button" className="notak-pitch-vignette" aria-pressed={th.id === theme} onClick={() => choisir(th.id)}>
          <span className="notak-pitch-vignette-cadre">
            <CadreDiapo ratio={ratio} theme={th} taille={taille}>
              <div className="notak-diapo-sujet" data-central="">
                <h1>Aa</h1>
              </div>
            </CadreDiapo>
          </span>
          <span className="notak-pitch-legende">{t(th.nom)}</span>
        </button>
      ))}
    </PopoverFixe>
  )
}
