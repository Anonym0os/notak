import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

/** `g` : 40, pages de connexion et d'erreur. `m` : 36, dialogues. `p` : 30, popovers. */
export type TailleBouton = 'g' | 'm' | 'p'
export type VarianteBouton = 'principal' | 'second' | 'danger' | 'discret' | 'rouge'

interface PropsBouton extends ButtonHTMLAttributes<HTMLButtonElement> {
  taille?: TailleBouton
  /** Sans variante : un bouton sans fond, du texte (comme `discret`). */
  variante?: VarianteBouton
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

const classes = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

/**
 * Le bouton de Notak : un seul dessin pour les dialogues, les popovers et les pages. Le principal est plein et sombre,
 * le second a un contour, `danger` est la confirmation finale d'une suppression (fond rouge), `rouge` le second rang
 * destructif (texte rouge sur fond neutre).
 */
export function Bouton({ taille = 'm', variante = 'discret', type = 'button', className, ...reste }: PropsBouton) {
  return <button type={type} className={classes('notak-btn', taille !== 'm' && `notak-btn-${taille}`, `notak-btn-${variante}`, className)} {...reste} />
}

/** Un bouton à icône seule : son `aria-label` dit ce qu'il fait. 36 par défaut ; 40, 30 ou 24. */
export type TailleIcone = 40 | 36 | 30 | 24

interface PropsBoutonIcone extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  'aria-label': string
  taille?: TailleIcone
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

const SUFFIXE: Record<TailleIcone, string> = { 40: 'g', 36: '', 30: 'p', 24: 'pp' }

export function BoutonIcone({ taille = 36, type = 'button', className, ...reste }: PropsBoutonIcone) {
  return <button type={type} className={classes('notak-ic', SUFFIXE[taille] && `notak-ic-${SUFFIXE[taille]}`, className)} {...reste} />
}
