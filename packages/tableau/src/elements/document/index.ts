import type { DocumentTexte } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsDocument, RenduDocument } from './Document'
import './document.css'
import { nouveauDocument, resume } from './texte'

registre.type<DocumentTexte>({
  type: 'document',
  nom: 'Document',
  resume,
  Rendu: RenduDocument,
  Outils: OutilsDocument,
  editable: true,
  hauteurParDefaut: 12,
  largeurMin: 16,
  suivant: (e, places) => ({ ...nouveauDocument(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      libelle: 'Document',
      icone: '📄',
      rang: 140,
      tiroir: true,
      fantome: () => nouveauDocument(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauDocument(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
