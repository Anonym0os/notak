import { type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, forwardRef } from 'react'

type Taille = 'p' | 'g'

interface PropsChamp {
  /** `p` : 30 px (dans un popover) ; `g` : 40 px (sur une page de connexion) ; sinon 36 px (dialogues). */
  taille?: Taille
  /** Le contenu est refusé : un anneau rouge à la place du filet. */
  faux?: boolean
}

const classes = (taille: Taille | undefined, extra: string | undefined) => ['notak-champ', taille && `notak-champ-${taille}`, extra].filter(Boolean).join(' ')

/**
 * Le champ de saisie de Notak (maquette « Composants communs », .nk-champ) : 36 px, rayon 10, un filet intérieur d'un
 * pixel ; au focus, le filet passe à 1,5 px dans la couleur du texte. Tous les champs de texte en dérivent.
 */
export const Champ = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & PropsChamp>(function Champ({ taille, faux, className, ...reste }, ref) {
  return <input ref={ref} className={classes(taille, className)} data-faux={faux ? '' : undefined} aria-invalid={faux || undefined} {...reste} />
})

/** Le même champ sur plusieurs lignes. */
export const ChampLong = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & PropsChamp>(function ChampLong({ taille, faux, className, ...reste }, ref) {
  return <textarea ref={ref} className={classes(taille, className)} data-faux={faux ? '' : undefined} aria-invalid={faux || undefined} {...reste} />
})

/** Un libellé au-dessus de son champ (13 px, 500), à 6 px. */
export function Libelle({ texte, children, className }: { texte: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={['notak-libelle', className].filter(Boolean).join(' ')}>
      <span>{texte}</span>
      {children}
    </label>
  )
}

/** La phrase d'aide sous un champ, ou son erreur (`faux`). */
export function Aide({ children, faux, className }: { children: ReactNode; faux?: boolean; className?: string }) {
  return (
    <p className={['notak-aide', className].filter(Boolean).join(' ')} data-faux={faux ? '' : undefined} role={faux ? 'alert' : undefined}>
      {children}
    </p>
  )
}
