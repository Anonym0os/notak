import { type Colonne, LARGEUR_COLONNE, nouvelleColonne } from '../../coeur/tableau'
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
  // Repliée, elle accepte encore ce qu'on y lâche : tout son corps devient la zone de dépôt.
  accepte: (enfant) => accepteDansColonne(enfant),
  largeurMin: LARGEUR_COLONNE,
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
