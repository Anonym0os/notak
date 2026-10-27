import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { auDoigt } from '../doigt'
import { rattacher } from '../PanneauFlottant'
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
/** Au-delà, un clic dans la feuille neuve est un vrai toucher, et non celui qui l'a ouverte. */
const CLIC_FANTOME_MAX = 700

/** Le thème de la toile : la feuille se range dans l'espace pour en garder les couleurs (clair, sombre, habillage). */
const hote = () => document.querySelector<HTMLElement>('.notak-espace:not(.notak-par-dessus)') ?? document.body

/** Le geste de fermeture, réglé sur la feuille d'iOS : 10 px pour choisir le sens, puis le doigt est suivi au pixel. */
const SEUIL_SENS = 10
/** Lâchée au-delà de 30 % de sa hauteur (120 px au moins), ou lancée vers le bas, la feuille se ferme. */
const PART_FERMETURE = 0.3
const FERMETURE_MIN = 120
const VITESSE_FERMETURE = 0.6
/** Le temps de la sortie, en ms : la feuille finit de descendre avant d'être retirée. */
const SORTIE = 280

/** Ce qui défile sous le doigt dans la feuille, sur l'axe voulu : le plus proche conteneur qui déborde, sinon le corps. */
function defileur(depuis: EventTarget | null, jusque: HTMLElement, axe: 'x' | 'y'): HTMLElement | null {
  for (let n = depuis instanceof Element ? depuis : null; n && n !== jusque; n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue
    const style = getComputedStyle(n)
    const debord = axe === 'y' ? style.overflowY : style.overflowX
    const plein = axe === 'y' ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1
    if (plein && (debord === 'auto' || debord === 'scroll')) return n
  }
  return axe === 'y' ? jusque : null
}

export function Feuille({
  titre,
  fermer,
  children,
  className,
  role = 'dialog',
  rattache,
  sansClavier,
  pied,
  surVoile,
}: {
  titre?: ReactNode
  fermer(): void
  children: ReactNode
  className?: string
  role?: string
  /** Le bouton qui l'ouvre : un appui dans la feuille compte comme un appui sur lui (le menu reste ouvert). */
  rattache?: Element | null | undefined
  /** Le champ de recherche que le contenu prend d'office ne sort pas le clavier : on le touche pour écrire. */
  sansClavier?: boolean
  /** Ce qui tient le bas de la feuille à la place de « Fermer » : le bouton qui conclut (le choix d'un modèle). */
  pied?: ReactNode
  /** Un toucher hors de la feuille fait ceci au lieu de la fermer. */
  surVoile?(): void
}) {
  const [prete, setPrete] = useState(false)
  const calque = useRef<HTMLDivElement>(null)
  const feuille = useRef<HTMLDivElement>(null)
  const corps = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (rattache && calque.current) rattacher(calque.current, () => rattache)
  }, [rattache])
  // Le clic que la webview tire du toucher qui a ouvert la feuille arrive parfois après `ATTENTE_CLIC_FANTOME`, sur
  // ce qui vient d'apparaître sous le doigt (le voile, une tuile) : il refermait la feuille aussitôt ouverte. Le
  // premier clic qui tombe dedans, tant que la feuille est neuve, est avalé.
  useEffect(() => {
    const ouverte = performance.now()
    const avaler = (e: MouseEvent) => {
      if (performance.now() - ouverte > CLIC_FANTOME_MAX) return window.removeEventListener('click', avaler, true)
      // Un clic tiré par le code (un test, un raccourci) n'est jamais celui d'un doigt.
      if (!e.isTrusted || !calque.current?.contains(e.target as Node)) return
      e.stopPropagation()
      e.preventDefault()
      window.removeEventListener('click', avaler, true)
    }
    window.addEventListener('click', avaler, true)
    return () => window.removeEventListener('click', avaler, true)
  }, [])
  useEffect(() => {
    if (!sansClavier) return
    const lacher = () => {
      const actif = document.activeElement
      if (actif instanceof HTMLElement && feuille.current?.contains(actif)) actif.blur()
    }
    lacher()
    const image = requestAnimationFrame(lacher)
    return () => cancelAnimationFrame(image)
  }, [sansClavier])
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
    // La courbe des feuilles d'iOS, à l'aller comme au retour ; le voile s'éteint pendant ce temps.
    calque.current?.setAttribute('data-sortie', '')
    f.style.transition = `transform ${SORTIE}ms cubic-bezier(0.32, 0.72, 0, 1)`
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
    let geste: {
      id: number
      x: number
      y: number
      dernier: number
      dernierX: number
      t: number
      mode: 'attente' | 'vertical' | 'libre'
      tire: number
      v: number
      /** Ce que le doigt fait défiler : une liste dans la feuille (les émojis), sinon son corps. */
      cible: HTMLElement
      enLargeur: HTMLElement | null
    } | null = null
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
        if ((g.mode === 'vertical' || g.enLargeur) && typeof PointerEvent === 'function') {
          // Ce que le doigt tient (un outil, une ligne) lâche prise : le geste est à la feuille.
          annulant = true
          e.target?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: e.pointerId }))
          annulant = false
        }
        g.dernier = e.clientY
        g.dernierX = e.clientX
        g.t = e.timeStamp
        return
      }
      if (g.mode === 'libre') {
        // En largeur, une rangée qui déborde (les catégories d'émojis) suit le doigt.
        if (g.enLargeur) g.enLargeur.scrollLeft -= e.clientX - g.dernierX
        g.dernierX = e.clientX
        return
      }
      let d = e.clientY - g.dernier
      if (e.timeStamp > g.t) g.v = d / (e.timeStamp - g.t)
      g.dernier = e.clientY
      g.t = e.timeStamp
      // La feuille tirée remonte d'abord ; le contenu ne défile qu'une fois la feuille revenue en place.
      if (g.tire > 0 || (d > 0 && g.cible.scrollTop <= 0 && c.scrollTop <= 0)) {
        const avant = g.tire
        g.tire = Math.max(0, g.tire + d)
        d -= g.tire - avant
        poser(g.tire)
      }
      if (d !== 0) g.cible.scrollTop -= d
    }
    const lancer = (cible: HTMLElement, v: number) => {
      // L'élan : la vitesse du doigt, freinée image après image.
      let vitesse = v * 16
      const pas = () => {
        if (Math.abs(vitesse) < 0.5) return
        cible.scrollTop -= vitesse
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
      if (g.mode === 'attente') return
      // Le clic qui suit le relâchement ne touche rien.
      const avaler = (k: Event) => {
        k.stopPropagation()
        k.preventDefault()
      }
      window.addEventListener('click', avaler, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', avaler, true), 400)
      if (g.mode === 'libre') return
      if (g.tire > 0) {
        const hauteur = f.getBoundingClientRect().height
        if (e.type !== 'pointercancel' && (g.tire > Math.max(FERMETURE_MIN, hauteur * PART_FERMETURE) || g.v > VITESSE_FERMETURE)) return descendre()
        f.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.04)'
        f.style.transform = ''
        return
      }
      if (e.type !== 'pointercancel') lancer(g.cible, g.v)
    }
    const appui = (e: PointerEvent) => {
      if (geste || sortie.current || (e.pointerType === 'mouse' && e.button !== 0)) return
      cancelAnimationFrame(elan)
      geste = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dernier: e.clientY,
        dernierX: e.clientX,
        t: e.timeStamp,
        mode: 'attente',
        tire: 0,
        v: 0,
        cible: defileur(e.target, c, 'y') ?? c,
        enLargeur: defileur(e.target, c, 'x'),
      }
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
    <div ref={calque} className="notak-tiroir-bas-calque" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="notak-tiroir-bas-voile" onClick={() => prete && (surVoile ? surVoile() : descendre())} aria-hidden />
      <div ref={feuille} className={`notak-tiroir-bas${className ? ` ${className}` : ''}`} role={role} aria-modal="true" data-prete={prete || undefined}>
        <div className="notak-tiroir-bas-poignee">
          <span aria-hidden />
        </div>
        {titre !== undefined && <div className="notak-tiroir-bas-titre">{titre}</div>}
        <div ref={corps} className="notak-tiroir-bas-corps">
          {children}
        </div>
        {/* Comme le voile : le toucher qui a ouvert la feuille ne la referme pas en retombant sur « Fermer ». */}
        {pied ?? (
          <button type="button" className="notak-tiroir-bas-fermer" onClick={() => prete && descendre()}>
            {t('commun.fermer')}
          </button>
        )}
      </div>
    </div>,
    hote(),
  )
}
