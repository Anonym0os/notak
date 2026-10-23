import type { CouleurNote, Note } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { MenuCouleur } from './MenuCouleur'

/** « Couleur » : la palette des notes choisies. Un seul pas d'historique, quel que soit le nombre de notes. */
export function OutilsNote({ elements, contexte }: PropsOutils<Note>) {
  const choisir = (couleur: CouleurNote | undefined) => {
    contexte.magasin.faire(
      elements.map((e) => {
        const { couleur: _, ...reste } = e.contenu
        return { type: 'contenu', id: e.id, avant: e.contenu, apres: couleur ? { ...reste, couleur } : reste }
      }),
    )
  }
  const actuelle = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : undefined
  return <MenuCouleur actuelle={actuelle} choisir={choisir} transparent />
}
