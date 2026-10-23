import { t } from './langue'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Icone } from '@notak/tableau'

/**
 * Les actions de l'en-tête dont on se sert moins (activité, import, export) : rangées derrière « … » pour laisser
 * la place au fil d'Ariane. Chacune garde son propre panneau ; un clic dehors ou Échap referme le menu.
 */
export function PlusEntete({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => {
      // Un panneau ouvert depuis le menu peut vivre ailleurs dans la page : on ne ferme que sur l'en-tête et la toile.
      const cible = e.target as HTMLElement
      if (!boite.current?.contains(cible) && cible.closest('.notak-entete, .notak-toile')) setOuvert(false)
    }
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', touche)
    }
  }, [ouvert])
  return (
    <div className="plus-entete" ref={boite}>
      <button type="button" className="bouton" title={t('plus.actions')} aria-expanded={ouvert} aria-label={t('plus.actions')} onClick={() => setOuvert((o) => !o)}>
        <Icone nom="plus" />
      </button>
      <div className="plus-entete-menu" hidden={!ouvert}>
        {children}
      </div>
    </div>
  )
}
