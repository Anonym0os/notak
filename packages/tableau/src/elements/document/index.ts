import type { DocumentTexte } from '../../coeur/tableau'
import { registre } from '../registre'
import { documentVersNote } from './versNote'
import { OutilsDocument, RenduDocument } from './Document'
import '../../blocs/blocs.css'
import '../../blocs/coloration.css'
import '../../blocs/menus.css'
import '../../blocs/poignee.css'
import './document.css'
import { demanderRenommer, deposerTampon, documentCree, nouveauDocument, resume } from './texte'
import { t } from '../../langue'
import { ico } from '../../icones'
import { couleurDuContenu } from '../couleur'
import { OutilCouleurCarte } from '../couleur/OutilCouleurCarte'

registre.type<DocumentTexte>({
  type: 'document',
  redimensionnable: false,
  get nom() {
    return t('type.document')
  },
  resume,
  Rendu: RenduDocument,
  Outils: OutilCouleurCarte,
  couleur: couleurDuContenu<DocumentTexte>(),
  teinte: true,
  OutilsApres: OutilsDocument,
  editable: true,
  // Comme Milanote : un clic sur le document choisi ne l'ouvre pas (double-clic), Entrée en édite le titre sur la carte.
  ouvreAuDoubleClic: true,
  surEntree: (element) => demanderRenommer(element.id),
  // Ouvrir en grand : le double-clic, Espace, ou le premier caractère tapé (qui arrive dans le texte).
  ouvrir: (element, contexte) => contexte.commencerEdition(element.id),
  surFrappe: (element, caractere, contexte) => {
    deposerTampon(caractere)
    contexte.commencerEdition(element.id)
  },
  // Largeur fixe (10 unités en icône, 34 en vue carte) : pas de poignée.
  sansPoignee: () => true,
  // Comme Milanote : en icône la carte n'est qu'une feuille et son titre ; en vue carte, une vraie carte.
  sansFond: (c) => !c.carte,
  aLaCreation: 'choisir',
  hauteurParDefaut: 12,
  largeurMin: 8,
  largeurNaturelle: (c) => (c.carte ? 34 : 10),
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
    contexte.magasin.faire(els.flatMap((e) => (e.contenu.type === 'document' ? [{ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: documentVersNote(e.contenu) }] : []))),
})

// « Renommer » : le titre s'édite sur la carte (un seul document).
registre.entreeMenu({
  get libelle() {
    return t('menu.renommer')
  },
  visible: (els, contexte) => !contexte.services.lectureSeule && els.length === 1 && els[0]!.contenu.type === 'document',
  faire: (els) => demanderRenommer(els[0]!.id),
})
