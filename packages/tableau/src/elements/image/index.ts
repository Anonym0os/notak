import type { Image } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsImage, RenduImage } from './Image'
import './image.css'
import { largeurNaturelleImage } from './geometrie'
import { raccourciAnnoter } from './raccourciAnnotation'
import { recevoirImages } from './recepteur'
import { ouvrirImage } from './visionneuse'
import { t } from '../../langue'

registre.type<Image>({
  suivant: () => null,
  get nom() {
    return t('type.image')
  },
  resume: (c) => c.legende ?? '',
  type: 'image',
  Rendu: RenduImage,
  Outils: OutilsImage,
  editable: true,
  // Le double-clic et Espace la montrent en grand ; Entrée édite sa légende.
  ouvrir: (e) => ouvrirImage(e.id),
  sansFond: true,
  largeurMin: 4,
  largeurNaturelle: largeurNaturelleImage,
  proportion: (c) => c.largeurOrigine / c.hauteurOrigine,
})

registre.recepteur({ priorite: 40, cumulable: true, recevoir: recevoirImages })
registre.raccourci(raccourciAnnoter)
