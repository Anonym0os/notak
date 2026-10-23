import { couleurDuContenu } from '../couleur'
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
  couleur: couleurDuContenu<Taches>(),
  editable: true,
  hauteurParDefaut: HAUTEUR_TACHES_MIN,
  // La liste suivante garde la largeur ; avec la mise en forme, elle garde aussi la couleur.
  suivant: (e, places, format) => {
    const neuve = nouvelleListeTaches(places.dessous.x, places.dessous.y)
    const couleur = format && e.contenu.couleur ? { couleur: e.contenu.couleur } : {}
    return { ...neuve, largeur: e.largeur, contenu: { ...neuve.contenu, ...couleur } }
  },
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
