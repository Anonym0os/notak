import type { DocumentTexte } from '../../coeur/tableau'
import { registre } from '../registre'
import { documentEnNote } from '../note/conversion'
import { OutilsDocument, RenduDocument } from './Document'
import './document.css'
import { documentCree, nouveauDocument, resume } from './texte'
import { t } from '../../langue'
import { ico } from '../../icones'

registre.type<DocumentTexte>({
  type: 'document',
  get nom() {
    return t('type.document')
  },
  resume,
  Rendu: RenduDocument,
  OutilsApres: OutilsDocument,
  editable: true,
  // Comme Milanote : la carte n'est qu'une feuille et son titre ; l'outil pose le document et en édite le titre, la modale s'ouvre au double-clic.
  sansFond: true,
  aLaCreation: 'choisir',
  hauteurParDefaut: 12,
  largeurMin: 8,
  suivant: (e, places) => ({ ...nouveauDocument(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      get libelle() {
        return t('type.document')
      },
      icone: ico('document'),
      rang: 220,
      vignette: 'document',
      tiroir: true,
      fantome: () => nouveauDocument(0, 0),
      creer: (ou) => [{ type: 'creer', element: documentCree(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})

registre.entreeMenu({
  get libelle() {
    return t('menu.convertirNote')
  },
  visible: (els, contexte) => !contexte.services.lectureSeule && els.length > 0 && els.every((e) => e.contenu.type === 'document'),
  faire: (els, contexte) =>
    contexte.magasin.faire(els.flatMap((e) => (e.contenu.type === 'document' ? [{ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: documentEnNote(e.contenu) }] : []))),
})
