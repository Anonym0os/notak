import type { CSSProperties } from 'react'
import type { Contenu } from '../../coeur/tableau'
import { FOND_NOTE, texteDeNote } from '../note/couleurs'

/**
 * Ce que pose le cadre d'une carte dont la couleur teinte une partie seulement (l'en-tête d'un lien, la légende
 * d'une image, la feuille d'un croquis) : `--notak-teinte` et le texte lisible dessus. Rien sans couleur.
 */
export function teinteDeCarte(teinte: boolean | undefined, contenu: Contenu): CSSProperties | undefined {
  const couleur = teinte && 'couleur' in contenu && typeof contenu.couleur === 'string' ? contenu.couleur : undefined
  if (!couleur || !(couleur in FOND_NOTE)) return undefined
  return {
    '--notak-teinte': FOND_NOTE[couleur as keyof typeof FOND_NOTE],
    '--notak-teinte-texte': texteDeNote(couleur as keyof typeof FOND_NOTE),
  } as CSSProperties
}
