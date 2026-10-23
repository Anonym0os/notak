import type { Commentaire } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsCommentaire, RenduCommentaire } from './Commentaire'
import './commentaire.css'
import { nouveauCommentaire } from './fil'
import { t } from '../../langue'

registre.type<Commentaire>({
  type: 'commentaire',
  get nom() {
    return t('type.commentaire')
  },
  resume: (c) => c.messages.map((m) => `${m.auteur.nom} : ${m.texte}`).join(' · ') || 'Commentaire vide',
  Rendu: RenduCommentaire,
  Outils: OutilsCommentaire,
  editable: true,
  hauteurParDefaut: 10,
  largeurMin: 20,
  suivant: () => null,
  outils: [
    {
      get libelle() {
        return t('type.commentaire')
      },
      icone: '💬',
      rang: 70,
      fantome: () => nouveauCommentaire(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauCommentaire(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
