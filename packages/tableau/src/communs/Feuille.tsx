import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { auDoigt } from '../doigt'
import { t } from '../langue'
import './feuille.css'

/**
 * Au doigt sur un téléphone, un menu ou un panneau ne se pose pas à côté du pointeur : il monte du bas de l'écran, en
 * feuille, comme les menus d'actions d'iOS (CapCut, Reddit sur Mobbin). Plus large qu'un pouce ne le couvre, au-dessus
 * de la barre d'accueil, sur un voile qui la ferme d'un toucher.
 */
export const enFeuille = (): boolean => auDoigt() && typeof innerWidth === 'number' && innerWidth <= 640

/** Le temps pendant lequel la feuille ignore les touchers : le clic que la webview tire du doigt qui l'a ouverte. */
const ATTENTE_CLIC_FANTOME = 350

/** Le thème de la toile : la feuille se range dans l'espace pour en garder les couleurs (clair, sombre, habillage). */
const hote = () => document.querySelector<HTMLElement>('.notak-espace:not(.notak-par-dessus)') ?? document.body

/** Le geste de fermeture, réglé sur la feuille d'iOS : 10 px pour choisir le sens, puis le doigt est suivi au pixel. */
const SEUIL_SENS = 10
/** Lâchée au-delà de 30 % de sa hauteur (120 px au moins), ou lancée vers le bas, la feuille se ferme. */
const PART_FERMETURE = 0.3
const FERMETURE_MIN = 120
const VITESSE_FERMETURE = 0.6
/** Le temps de la sortie, en ms : la feuille finit de descendre avant d'être retirée. */
const SORTIE = 220

export function Feuille({ titre, fermer, children, className, role = 'dialog' }: { titre?: ReactNode; fermer(): void; children: ReactNode; className?: string; role?: string }) {
  const [prete, setPrete] = useState(false)
  const feuille = useRef<HTMLDivElement>(null)
  const corps = useRef<HTMLDivElement>(null)
  const sortie = useRef(false)
  const fermerRef = useRef(fermer)
  fermerRef.current = fermer
  useEffect(() => {
    const minuteur = setTimeout(() => setPrete(true), ATTENTE_CLIC_FANTOME)
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('keydown', touche, true)
    return () => {
      clearTimeout(minuteur)
      document.removeEventListener('keydown', touche, true)
    }
  }, [fermer])

  /** Descend hors de l'écran, puis ferme : la sortie se voit, comme sur iOS. */
  const descendre = () => {
    const f = feuille.current
    if (sortie.current) return
    sortie.current = true
    if (!f || typeof f.animate !== 'function') return fermerRef.current()
    f.style.transition = `transform ${SORTIE}ms cubic-bezier(0.3, 0, 0.8, 0.6)`
    f.style.transform = 'translateY(calc(100% + 24px))'
    setTimeout(() => fermerRef.current(), SORTIE)
  }

  /*
   * La feuille se tire vers le bas depuis n'importe où, pas seulement sa poignée : le doigt qui descend la suit au pixel,
   * et la lâcher assez bas, ou d'un geste vif, la ferme. Un contenu qui défile garde le geste tant qu'il n'est pas tout
   * en haut. Le toucher qui l'a tirée n'agit pas sur ce qu'il a touché en partant.
   */
  useEffect(() => {
    const f = feuille.current
    if (!f) return
    // Vrai pendant que la feuille annule elle-même la prise de ce que le doigt tenait : cet abandon n'est pas le sien.
    let annulant = false
    let geste: { id: number; x: number; y: number; t: number; mode: 'attente' | 'tire' | 'libre'; dy: number; v: number } | null = null
    const poser = (dy: number) => {
      f.style.transition = 'none'
      f.style.transform = dy ? `translateY(${dy}px)` : ''
    }
    const bouge = (e: PointerEvent) => {
      if (!geste || e.pointerId !== geste.id) return
      const dx = e.clientX - geste.x
      const dy = e.clientY - geste.y
      if (geste.mode === 'attente') {
        if (Math.hypot(dx, dy) < SEUIL_SENS) return
        const enHaut = (corps.current?.scrollTop ?? 0) <= 0
        geste.mode = dy > 0 && Math.abs(dy) > Math.abs(dx) && enHaut ? 'tire' : 'libre'
        if (geste.mode === 'tire') {
          // Ce que le doigt tient (un outil, une ligne) lâche prise : le geste est à la feuille.
          if (typeof PointerEvent === 'function') {
            annulant = true
            e.target?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: e.pointerId }))
            annulant = false
          }
          geste.y = e.clientY
        }
      }
      if (geste.mode !== 'tire') return
      const d = e.clientY - geste.y
      const maintenant = e.timeStamp
      if (maintenant > geste.t) geste.v = (d - geste.dy) / (maintenant - geste.t)
      geste.t = maintenant
      geste.dy = d
      // Vers le haut, elle résiste.
      poser(d > 0 ? d : d * 0.3)
    }
    const lache = (e: PointerEvent) => {
      if (!geste || e.pointerId !== geste.id || annulant) return
      const g = geste
      geste = null
      window.removeEventListener('pointermove', bouge, true)
      window.removeEventListener('pointerup', lache, true)
      window.removeEventListener('pointercancel', lache, true)
      if (g.mode !== 'tire') return
      // Le clic qui suit le relâchement ne touche rien.
      const avaler = (c: Event) => {
        c.stopPropagation()
        c.preventDefault()
      }
      window.addEventListener('click', avaler, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', avaler, true), 400)
      const hauteur = f.getBoundingClientRect().height
      if (e.type !== 'pointercancel' && (g.dy > Math.max(FERMETURE_MIN, hauteur * PART_FERMETURE) || g.v > VITESSE_FERMETURE)) return descendre()
      f.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.04)'
      f.style.transform = ''
    }
    const appui = (e: PointerEvent) => {
      if (geste || sortie.current || (e.pointerType === 'mouse' && e.button !== 0)) return
      geste = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, mode: 'attente', dy: 0, v: 0 }
      window.addEventListener('pointermove', bouge, true)
      window.addEventListener('pointerup', lache, true)
      window.addEventListener('pointercancel', lache, true)
    }
    // Pendant qu'on la tire, la page ne défile pas sous le doigt (WebKit prendrait le geste et l'annulerait).
    const retenir = (e: TouchEvent) => {
      if (geste?.mode === 'tire') e.preventDefault()
    }
    f.addEventListener('pointerdown', appui, true)
    f.addEventListener('touchmove', retenir, { passive: false })
    return () => {
      f.removeEventListener('pointerdown', appui, true)
      f.removeEventListener('touchmove', retenir)
      window.removeEventListener('pointermove', bouge, true)
      window.removeEventListener('pointerup', lache, true)
      window.removeEventListener('pointercancel', lache, true)
    }
  }, [])

  return createPortal(
    <div className="notak-tiroir-bas-calque" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="notak-tiroir-bas-voile" onClick={() => prete && descendre()} aria-hidden />
      <div ref={feuille} className={`notak-tiroir-bas${className ? ` ${className}` : ''}`} role={role} aria-modal="true" data-prete={prete || undefined}>
        <div className="notak-tiroir-bas-poignee">
          <span aria-hidden />
        </div>
        {titre !== undefined && <div className="notak-tiroir-bas-titre">{titre}</div>}
        <div ref={corps} className="notak-tiroir-bas-corps">
          {children}
        </div>
        <button type="button" className="notak-tiroir-bas-fermer" onClick={descendre}>
          {t('commun.fermer')}
        </button>
      </div>
    </div>,
    hote(),
  )
}
