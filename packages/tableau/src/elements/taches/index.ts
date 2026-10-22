import { registre } from '../registre'
import { RenduTaches, OutilsTaches } from './Taches'
import { HAUTEUR_TACHES_MIN, nouvelleListeTaches } from './liste'
import type { Taches } from '../../coeur/tableau'
import './taches.css'

registre.type<Taches>({
  type: 'taches',
  Rendu: RenduTaches,
  Outils: OutilsTaches,
  editable: true,
  hauteurParDefaut: HAUTEUR_TACHES_MIN,
  outil: {
    libelle: 'Tâches',
    icone: '☑',
    creer: (ou) => [{ type: 'creer', element: nouvelleListeTaches(Math.round(ou.x), Math.round(ou.y)) }],
  },
})
