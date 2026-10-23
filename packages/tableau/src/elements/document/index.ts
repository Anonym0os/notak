import type { DocumentTexte } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsDocument, RenduDocument } from './Document'
import './document.css'
import { nouveauDocument, resume } from './texte'
import { t } from '../../langue'
import { ico } from '../../icones'

registre.type<DocumentTexte>({
  type: 'document',
  get nom() {
    return t('type.document')
  },
  resume,
  Rendu: RenduDocument,
  Outils: OutilsDocument,
  editable: true,
  hauteurParDefaut: 12,
  largeurMin: 16,
  suivant: (e, places) => ({ ...nouveauDocument(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      get libelle() {
        return t('type.document')
      },
      icone: ico('document'),
      rang: 140,
      vignette: 'document',
      tiroir: true,
      fantome: () => nouveauDocument(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauDocument(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
