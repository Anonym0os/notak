import type { ButtonHTMLAttributes, MouseEvent } from 'react'
import { animerCase } from './animerCase'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'onClick' | 'type' | 'role' | 'aria-checked'> {
  /** `'mixte'` : une partie de ce qu'elle résume est cochée (un trait au lieu de la coche) ; un clic la coche. */
  cochee: boolean | 'mixte'
  /** Une case d'option de formulaire : cochée, elle prend le fond foncé du texte au lieu du gris d'une tâche. */
  option?: boolean
  /** La zone de clic élargie d'une case de tâche (38 × 32 px autour du carré de 16). */
  large?: boolean
  /** Au geste (clic, Espace, Entrée), avec la valeur que prend la case. Rien ne se joue si la case est `aria-readonly`. */
  onChange?(cochee: boolean, e: MouseEvent<HTMLButtonElement>): void
}

/**
 * La case à cocher de Notak, celle de Milanote : un seul dessin pour les tâches de la toile, du document, de la carte
 * et pour les options de formulaire. L'animation se joue au geste seulement, jamais à l'affichage ni sur un
 * changement d'état venu d'ailleurs.
 */
export function Case({ cochee, option, large, onChange, className, ...reste }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={cochee === 'mixte' ? 'mixed' : cochee}
      className={['notak-case', large && 'notak-case-large', option && 'notak-case-option', className].filter(Boolean).join(' ')}
      onClick={(e) => {
        if (reste['aria-readonly']) return
        animerCase(e.currentTarget, cochee !== true)
        onChange?.(cochee !== true, e)
      }}
      {...reste}
    />
  )
}
