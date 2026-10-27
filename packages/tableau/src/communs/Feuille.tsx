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
   * Le doigt sur la feuille, comme sur une feuille d'iOS : vers le haut, il fait défiler son contenu ; vers le bas, il
   * le ramène en haut, puis tire la feuille elle-même, qui suit au pixel. Lâchée assez bas, ou d'un geste vif, elle se
   * ferme ; sinon elle remonte, et le contenu lancé file sur son élan. La feuille mène tout le geste (`touch-action:
   * none`) : WebKit n'a plus à deviner qui, du défilement ou de la feuille, le prend. Le toucher qui a glissé n'agit
   * pas sur ce qu'il a touché en partant.
   */
  useEffect(() => {
    const f = feuille.current
    const c = corps.current
    if (!f || !c) return
    // Vrai pendant que la feuille annule elle-même la prise de ce que le doigt tenait : cet abandon n'est pas le sien.
    let annulant = false
    let elan = 0
    let geste: { id: number; x: number; y: number; dernier: number; t: number; mode: 'attente' | 'vertical' | 'libre'; tire: number; v: number } | null = null
    const poser = (dy: number) => {
      f.style.transition = 'none'
      f.style.transform = dy ? `translateY(${dy > 0 ? dy : dy * 0.3}px)` : ''
    }
    const bouge = (e: PointerEvent) => {
      if (!geste || e.pointerId !== geste.id) return
      const g = geste
      if (g.mode === 'attente') {
        const dx = e.clientX - g.x
        const dy = e.clientY - g.y
        if (Math.hypot(dx, dy) < SEUIL_SENS) return
        g.mode = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'libre'
        if (g.mode === 'vertical' && typeof PointerEvent === 'function') {
          // Ce que le doigt tient (un outil, une ligne) lâche prise : le geste est à la feuille.
          annulant = true
          e.target?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: e.pointerId }))
          annulant = false
        }
        g.dernier = e.clientY
        g.t = e.timeStamp
        return
      }
      if (g.mode !== 'vertical') return
      let d = e.clientY - g.dernier
      if (e.timeStamp > g.t) g.v = d / (e.timeStamp - g.t)
      g.dernier = e.clientY
      g.t = e.timeStamp
      // La feuille tirée remonte d'abord ; le contenu ne défile qu'une fois la feuille revenue en place.
      if (g.tire > 0 || (d > 0 && c.scrollTop <= 0)) {
        const avant = g.tire
        g.tire = Math.max(0, g.tire + d)
        d -= g.tire - avant
        poser(g.tire)
      }
      if (d !== 0) c.scrollTop -= d
    }
    const lancer = (v: number) => {
      // L'élan : la vitesse du doigt, freinée image après image.
      let vitesse = v * 16
      const pas = () => {
        if (Math.abs(vitesse) < 0.5) return
        c.scrollTop -= vitesse
        vitesse *= 0.95
        elan = requestAnimationFrame(pas)
      }
      elan = requestAnimationFrame(pas)
    }
    const lache = (e: PointerEvent) => {
      if (!geste || e.pointerId !== geste.id || annulant) return
      const g = geste
      geste = null
      window.removeEventListener('pointermove', bouge, true)
      window.removeEventListener('pointerup', lache, true)
      window.removeEventListener('pointercancel', lache, true)
      if (g.mode !== 'vertical') return
      // Le clic qui suit le relâchement ne touche rien.
      const avaler = (k: Event) => {
        k.stopPropagation()
        k.preventDefault()
      }
      window.addEventListener('click', avaler, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', avaler, true), 400)
      if (g.tire > 0) {
        const hauteur = f.getBoundingClientRect().height
        if (e.type !== 'pointercancel' && (g.tire > Math.max(FERMETURE_MIN, hauteur * PART_FERMETURE) || g.v > VITESSE_FERMETURE)) return descendre()
        f.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.04)'
        f.style.transform = ''
        return
      }
      if (e.type !== 'pointercancel') lancer(g.v)
    }
    const appui = (e: PointerEvent) => {
      if (geste || sortie.current || (e.pointerType === 'mouse' && e.button !== 0)) return
      cancelAnimationFrame(elan)
      geste = { id: e.pointerId, x: e.clientX, y: e.clientY, dernier: e.clientY, t: e.timeStamp, mode: 'attente', tire: 0, v: 0 }
      window.addEventListener('pointermove', bouge, true)
      window.addEventListener('pointerup', lache, true)
      window.addEventListener('pointercancel', lache, true)
    }
    // Le geste est à la feuille : la page ne défile pas sous le doigt.
    const retenir = (e: TouchEvent) => {
      if (geste?.mode === 'vertical') e.preventDefault()
    }
    f.addEventListener('pointerdown', appui, true)
    f.addEventListener('touchmove', retenir, { passive: false })
    return () => {
      cancelAnimationFrame(elan)
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
