import type { Croquis, CouleurNote } from '../../coeur/tableau'
import { MenuCouleur } from '../note/MenuCouleur'
import type { PropsOutils } from '../types'

/**
 * « Couleur » de la feuille d'un croquis : la palette des notes, plus « Transparent » (la feuille prend le fond du
 * tableau, et un liseré de 1 px la devine au survol). Un seul pas d'historique pour toute la sélection.
 */
export function OutilCouleurCroquis({ elements, contexte }: PropsOutils<Croquis>) {
  const actuelle = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : undefined
  const choisir = (couleur: CouleurNote | undefined) =>
    contexte.magasin.faire(
      elements.map((e) => {
        const { couleur: _, ...reste } = e.contenu
        return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: (couleur ? { ...reste, couleur } : reste) as Croquis }
      }),
    )
  return <MenuCouleur actuelle={actuelle} choisir={choisir} transparent />
}
