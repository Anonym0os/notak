import type { Commentaire } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsCommentaire, RenduCommentaire } from './Commentaire'
import './commentaire.css'
import { nouveauCommentaire } from './fil'

registre.type<Commentaire>({
  type: 'commentaire',
  nom: 'Commentaire',
  resume: (c) => c.messages.map((m) => `${m.auteur.nom} : ${m.texte}`).join(' · ') || 'Commentaire vide',
  Rendu: RenduCommentaire,
  Outils: OutilsCommentaire,
  editable: true,
  hauteurParDefaut: 10,
  largeurMin: 20,
  suivant: () => null,
  outils: [
    {
      libelle: 'Commentaire',
      icone: '💬',
      rang: 70,
      fantome: () => nouveauCommentaire(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauCommentaire(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
