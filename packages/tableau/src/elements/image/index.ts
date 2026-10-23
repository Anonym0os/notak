import type { Image } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsFinImage, OutilsImage, RenduImage } from './Image'
import { amorcerLegende } from './legendeAmorce'
import './image.css'
import { RETRAIT_PX, aUneCarte, largeurNaturelleImage } from './geometrie'
import { raccourciAnnoter } from './raccourciAnnotation'
import { recevoirImages } from './recepteur'
import { ouvrirImage } from './visionneuse'
import { t } from '../../langue'
import { couleurDuContenu } from '../couleur'
import { OutilCouleurCarte } from '../couleur/OutilCouleurCarte'

registre.type<Image>({
  suivant: () => null,
  get nom() {
    return t('type.image')
  },
  resume: (c) => c.legende ?? '',
  type: 'image',
  Rendu: RenduImage,
  Outils: OutilCouleurCarte,
  couleur: couleurDuContenu<Image>(),
  teinte: true,
  OutilsApres: OutilsImage,
  OutilsFin: OutilsFinImage,
  editable: true,
  // Le double-clic, Entrée et Espace la montrent en grand ; taper dessus commence sa légende.
  ouvrir: (e) => ouvrirImage(e.id),
  entreeOuvre: true,
  surFrappe: (_e, caractere, contexte) => {
    if (contexte.services.lectureSeule) return false
    amorcerLegende(caractere)
    return true
  },
  // Une carte blanche à ombre porte l'image et sa légende ; une image transparente n'a ni l'un ni l'autre.
  sansFond: (c) => !aUneCarte(c),
  retraitPx: () => RETRAIT_PX,
  largeurMin: 4,
  largeurNaturelle: largeurNaturelleImage,
  proportion: (c) => c.largeurOrigine / c.hauteurOrigine,
})

registre.recepteur({ priorite: 40, cumulable: true, recevoir: recevoirImages })
registre.raccourci(raccourciAnnoter)
