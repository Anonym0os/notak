import { type Arbre, type Element, nouvelId } from '../../coeur/tableau'
import { ico } from '../../icones'
import { t } from '../../langue'
import { registre } from '../registre'
import { RenduArbre } from './Arbre'
import { lire, nouvelArbre } from './modele/sujets'
import './arbre.css'

/** Largeur d'une carte mentale posée sur la toile, en UG. */
export const LARGEUR_ARBRE = 40

export function nouvelleCarteMentale(x: number, y: number): Element<Arbre> {
  return { id: nouvelId(), x, y, largeur: LARGEUR_ARBRE, contenu: nouvelArbre(t('arbre.central')) }
}

registre.type<Arbre>({
  type: 'arbre',
  get nom() {
    return t('type.arbre')
  },
  resume: (c) => {
    const l = lire(c)
    return l.sujets.get(l.central)?.titre ?? ''
  },
  Rendu: RenduArbre,
  editable: true,
  // Comme un document : un clic choisit la carte, le double-clic (ou Entrée) l'ouvre en grand.
  ouvreAuDoubleClic: true,
  ouvrir: (element, contexte) => contexte.commencerEdition(element.id),
  aLaCreation: 'choisir',
  hauteurParDefaut: 20,
  largeurMin: 17,
  largeurNaturelle: () => LARGEUR_ARBRE,
  suivant: () => null,
  outils: [
    {
      get libelle() {
        return t('type.arbre')
      },
      icone: ico('carteMentale'),
      rang: 290,
      vignette: 'arbre',
      tiroir: true,
      fantome: () => nouvelleCarteMentale(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleCarteMentale(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
