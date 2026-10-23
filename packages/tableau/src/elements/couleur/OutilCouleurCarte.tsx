import type { Contenu, CouleurNote } from '../../coeur/tableau'
import { MenuCouleur } from '../note/MenuCouleur'
import type { PropsOutils } from '../types'

type Coloree = Contenu & { couleur?: CouleurNote }

/**
 * « Couleur » d'une carte dont la couleur teinte une partie (lien, image, fichier, document, croquis) : la palette
 * de la note, un seul pas d'historique pour toute la sélection, « Aucune » retire la couleur.
 */
export function OutilCouleurCarte({ elements, contexte }: PropsOutils<Coloree>) {
  const actuelle = elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : undefined
  const choisir = (couleur: CouleurNote | undefined) =>
    contexte.magasin.faire(
      elements.map((e) => {
        const { couleur: _, ...reste } = e.contenu
        return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: (couleur ? { ...reste, couleur } : reste) as Coloree }
      }),
    )
  return <MenuCouleur actuelle={actuelle} choisir={choisir} />
}
