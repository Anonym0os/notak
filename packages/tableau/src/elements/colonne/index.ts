import { type Colonne, nouvelleColonne } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsColonne, RenduColonne } from './Colonne'
import { OutilGrouper, entreeGrouper } from './OutilGrouper'
import { accepteDansColonne } from './regles'
import './colonne.css'

registre.type<Colonne>({
  type: 'colonne',
  nom: 'Colonne',
  resume: (c) => c.titre,
  Rendu: RenduColonne,
  Outils: OutilsColonne,
  editable: true,
  sansFond: true,
  suivant: (_e, places) => nouvelleColonne(places.droite.x, places.droite.y),
  accepte: (enfant, colonne) => !colonne.contenu.repliee && accepteDansColonne(enfant),
  aussiSupprimer: (colonne, tableau) => tableau.elements.filter((e) => e.parent === colonne.id),
  outils: [
    {
      libelle: 'Colonne',
      icone: '▥',
      rang: 60,
      fantome: () => nouvelleColonne(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleColonne(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})

registre.outilCommun(OutilGrouper)
registre.entreeMenu(entreeGrouper)
