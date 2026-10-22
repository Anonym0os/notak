import { registre } from '../registre'
import { RenduTaches, OutilsTaches } from './Taches'
import { HAUTEUR_TACHES_MIN, nouvelleListeTaches } from './liste'
import { type Taches, texteBrut } from '../../coeur/tableau'
import './taches.css'

registre.type<Taches>({
  type: 'taches',
  nom: 'Liste de tâches',
  resume: (c) => c.titre || texteBrut(c.texte),
  Rendu: RenduTaches,
  Outils: OutilsTaches,
  editable: true,
  hauteurParDefaut: HAUTEUR_TACHES_MIN,
  suivant: (e, places) => ({ ...nouvelleListeTaches(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      libelle: 'Tâches',
      icone: '☑',
      rang: 30,
      fantome: () => nouvelleListeTaches(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleListeTaches(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
