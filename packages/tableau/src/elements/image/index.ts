import type { Image } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsImage, RenduImage } from './Image'
import './image.css'
import { largeurNaturelleImage } from './geometrie'
import { recevoirImages } from './recepteur'
import { ouvrirImage } from './visionneuse'

registre.type<Image>({
  suivant: () => null,
  nom: 'Image',
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
})

registre.recepteur({ priorite: 40, recevoir: recevoirImages })
