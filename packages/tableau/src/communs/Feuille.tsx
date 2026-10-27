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

export function Feuille({ titre, fermer, children, className, role = 'dialog' }: { titre?: ReactNode; fermer(): void; children: ReactNode; className?: string; role?: string }) {
  const [prete, setPrete] = useState(false)
  const [tiree, setTiree] = useState(0)
  const prise = useRef<{ y: number; id: number } | null>(null)
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
  // La poignée se tire vers le bas : au-delà de 80 px, la feuille se ferme ; en deçà, elle remonte.
  const poignee = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      prise.current = { y: e.clientY, id: e.pointerId }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (prise.current?.id === e.pointerId) setTiree(Math.max(0, e.clientY - prise.current.y))
    },
    onPointerUp: () => {
      prise.current = null
      if (tiree > 80) fermer()
      else setTiree(0)
    },
    onPointerCancel: () => {
      prise.current = null
      setTiree(0)
    },
  }
  return createPortal(
    <div className="notak-tiroir-bas-calque" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="notak-tiroir-bas-voile" onClick={() => prete && fermer()} aria-hidden />
      <div
        className={`notak-tiroir-bas${className ? ` ${className}` : ''}`}
        role={role}
        aria-modal="true"
        data-prete={prete || undefined}
        style={tiree ? { transform: `translateY(${tiree}px)`, transition: 'none' } : undefined}
      >
        <div className="notak-tiroir-bas-poignee" {...poignee}>
          <span aria-hidden />
        </div>
        {titre !== undefined && <div className="notak-tiroir-bas-titre">{titre}</div>}
        <div className="notak-tiroir-bas-corps">{children}</div>
        <button type="button" className="notak-tiroir-bas-fermer" onClick={fermer}>
          {t('commun.fermer')}
        </button>
      </div>
    </div>,
    hote(),
  )
}
