import { type Colonne, LARGEUR_COLONNE, nouvelleColonne } from '../../coeur/tableau'
import { definition, registre } from '../registre'
import { OutilsColonne, RenduColonne, colonneColoree } from './Colonne'
import './convertir'
import { entreeGrouper } from './OutilGrouper'
import { accepteDansColonne } from './regles'
import './colonne.css'
import { t } from '../../langue'
import { ico } from '../../icones'
import { creerAuCentre, estCreation, touchesCreation } from '../raccourciCreation'

registre.type<Colonne>({
  type: 'colonne',
  get nom() {
    return t('type.colonne')
  },
  resume: (c) => c.titre || t('colonne.invite'),
  Rendu: RenduColonne,
  Outils: OutilsColonne,
  // Une teinte nommée chasse le fond libre, et inversement (« Aucune » les retire tous les deux).
  couleur: {
    lire: (e) => e.contenu.couleur,
    vers: (c, couleur) => colonneColoree(c, couleur ? { couleur } : null),
  },
  editable: true,
  sansFond: true,
  suivant: (_e, places) => nouvelleColonne(places.droite.x, places.droite.y),
  // Repliée, elle accepte encore ce qu'on y lâche : tout son corps devient la zone de dépôt.
  accepte: (enfant) => accepteDansColonne(enfant),
  largeurMin: LARGEUR_COLONNE,
  aussiSupprimer: (colonne, tableau) => tableau.elements.filter((e) => e.parent === colonne.id),
  outils: [
    {
      get libelle() {
        return t('type.colonne')
      },
      icone: ico('colonne'),
      rang: 60,
      get raccourci() {
        return touchesCreation('G')
      },
      vignette: 'colonne',
      fantome: () => nouvelleColonne(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleColonne(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})

registre.entreeMenu(entreeGrouper)

// ⌃⌘G (Ctrl+Alt+G ailleurs que sur Mac) : une colonne au centre de la vue, son titre à saisir.
registre.raccourci((e, contexte) => {
  if (!estCreation(e, 'G')) return false
  const outil = definition('colonne')?.outils?.[0]
  return !!outil && creerAuCentre(outil, contexte, { x: LARGEUR_COLONNE / 2, y: 7 })
})
