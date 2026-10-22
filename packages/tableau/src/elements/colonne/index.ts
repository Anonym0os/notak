import { type Colonne, nouvelleColonne } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsColonne, RenduColonne } from './Colonne'
import { OutilGrouper } from './OutilGrouper'
import { accepteDansColonne } from './regles'
import './colonne.css'

registre.type<Colonne>({
  type: 'colonne',
  Rendu: RenduColonne,
  Outils: OutilsColonne,
  editable: true,
  sansFond: true,
  accepte: (enfant, colonne) => !colonne.contenu.repliee && accepteDansColonne(enfant),
  aussiSupprimer: (colonne, tableau) => tableau.elements.filter((e) => e.parent === colonne.id),
  outils: [
    {
      libelle: 'Colonne',
      icone: '▥',
      creer: (ou) => [{ type: 'creer', element: nouvelleColonne(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})

registre.outilCommun(OutilGrouper)
