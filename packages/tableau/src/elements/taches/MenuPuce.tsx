import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { decaler, jourDe } from './puces'
import type { GenrePuce } from './puces'

/** Où le menu s'ouvre : sous la puce touchée, en coordonnées d'écran. */
export interface OuverturePuce {
  genre: GenrePuce
  ancre: { left: number; bottom: number }
  /** Le nœud qui porte la toile, où le menu se range pour garder ses couleurs. */
  hote: HTMLElement
}

const LARGEUR_MENU = 232

/**
 * Le petit menu d'une puce : l'échéance se choisit au calendrier ou d'un raccourci. Il se ferme d'un clic
 * ailleurs ou d'Échap ; `regler(null)` retire ce qui était posé.
 */
export function MenuPuce({ ouverture, valeur, regler, fermer }: {
  ouverture: OuverturePuce
  valeur: string | null
  regler(valeur: string | null): void
  fermer(): void
}) {
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const hors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) fermer()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      fermer()
    }
    document.addEventListener('pointerdown', hors, true)
    document.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('pointerdown', hors, true)
      document.removeEventListener('keydown', touche, true)
    }
  }, [fermer])
  const { ancre } = ouverture
  const aujourdhui = jourDe(new Date())
  const choisir = (v: string | null) => {
    regler(v)
    fermer()
  }
  return createPortal(
    <div
      ref={racine}
      className="notak-menu-puce"
      role="menu"
      style={{ left: Math.max(8, Math.min(ancre.left, window.innerWidth - LARGEUR_MENU - 8)), top: ancre.bottom + 6 }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <input
        type="date"
        aria-label="Échéance"
        value={valeur ?? ''}
        autoFocus
        onChange={(e) => e.target.value && choisir(e.target.value)}
      />
      <div className="notak-menu-puce-raccourcis">
        <button type="button" role="menuitem" onClick={() => choisir(aujourdhui)}>
          Aujourd'hui
        </button>
        <button type="button" role="menuitem" onClick={() => choisir(decaler(aujourdhui, 1))}>
          Demain
        </button>
        <button type="button" role="menuitem" onClick={() => choisir(decaler(aujourdhui, 7))}>
          Dans une semaine
        </button>
      </div>
      {valeur && (
        <button type="button" role="menuitem" className="notak-menu-puce-retirer" onClick={() => choisir(null)}>
          Retirer l’échéance
        </button>
      )}
    </div>,
    ouverture.hote,
  )
}
