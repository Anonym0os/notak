import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { Icone } from '../icones'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  valeur: string
  onChange(valeur: string): void
  /** Posée sur un fond chargé, en pilule de 40 px et à une ombre (la barre de recherche d'une page). */
  pilule?: boolean
  /** Ce qui suit le champ, à droite dedans (un bouton d'options, un raccourci). */
  fin?: ReactNode
  className?: string
}

/**
 * Le champ de recherche de Notak (maquette « Composants communs », .nk-recherche) : le champ commun, une loupe de 16 px
 * à gauche. Il remplace les champs de recherche refaits dans les réglages, les panneaux de la carte et les listes.
 */
export const Recherche = forwardRef<HTMLInputElement, Props>(function Recherche({ valeur, onChange, pilule, fin, className, ...reste }, ref) {
  return (
    <label className={['notak-champ-recherche', className].filter(Boolean).join(' ')} data-pilule={pilule ? '' : undefined}>
      <Icone nom="recherche" taille={16} trait={1.8} />
      <input ref={ref} type="search" className="notak-champ" spellCheck={false} value={valeur} onChange={(e) => onChange(e.target.value)} {...reste} />
      {fin}
    </label>
  )
})
