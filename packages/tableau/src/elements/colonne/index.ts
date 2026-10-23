import { type Colonne, LARGEUR_COLONNE, nouvelleColonne } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsColonne, RenduColonne } from './Colonne'
import { OutilGrouper, entreeGrouper } from './OutilGrouper'
import { accepteDansColonne } from './regles'
import './colonne.css'
import { couleurDuContenu } from '../couleur'
import { t } from '../../langue'
import { ico } from '../../icones'

registre.type<Colonne>({
  type: 'colonne',
  get nom() {
    return t('type.colonne')
  },
  resume: (c) => c.titre,
  Rendu: RenduColonne,
  Outils: OutilsColonne,
  couleur: couleurDuContenu<Colonne>(),
  editable: true,
  sansFond: true,
  suivant: (_e, places) => nouvelleColonne(places.droite.x, places.droite.y, t('type.colonne')),
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
      fantome: () => nouvelleColonne(0, 0, t('type.colonne')),
      creer: (ou) => [{ type: 'creer', element: nouvelleColonne(Math.round(ou.x), Math.round(ou.y), t('type.colonne')) }],
    },
  ],
})

registre.outilCommun(OutilGrouper)
registre.entreeMenu(entreeGrouper)
