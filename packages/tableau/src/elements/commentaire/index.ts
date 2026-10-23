import type { Commentaire } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsCommentaire, RenduCommentaire } from './Commentaire'
import './commentaire.css'
import { nouveauCommentaire } from './fil'
import { t } from '../../langue'
import { ico } from '../../icones'

registre.type<Commentaire>({
  type: 'commentaire',
  get nom() {
    return t('type.commentaire')
  },
  resume: (c) => c.messages.map((m) => `${m.auteur.nom} : ${m.texte}`).join(' · ') || t('commentaire.vide'),
  Rendu: RenduCommentaire,
  OutilsApres: OutilsCommentaire,
  editable: true,
  // Réduit en épingle, le fil n'est plus qu'une épingle sur la toile : ni fond ni ombre.
  sansFond: (c) => !!c.replie && c.messages.length > 0,
  // La poignée règle aussi la hauteur : au-delà, les messages défilent dans le fil.
  hauteurBornable: true,
  plafondEnEdition: true,
  hauteurParDefaut: 7,
  largeurMin: 34,
  // ⌘Entrée : un fil neuf juste dessous, à la même largeur.
  suivant: (e, places) => ({ ...nouveauCommentaire(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      get libelle() {
        return t('type.commentaire')
      },
      icone: ico('commentaire'),
      rang: 70,
      vignette: 'commentaire',
      fantome: () => nouveauCommentaire(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauCommentaire(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
