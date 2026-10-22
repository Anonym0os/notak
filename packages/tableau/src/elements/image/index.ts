import type { Image } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsImage, RenduImage } from './Image'
import './image.css'
import { largeurNaturelleImage } from './geometrie'
import { recevoirImages } from './recepteur'

registre.type<Image>({
  suivant: () => null,
  type: 'image',
  Rendu: RenduImage,
  Outils: OutilsImage,
  editable: true,
  sansFond: true,
  largeurMin: 4,
  largeurNaturelle: largeurNaturelleImage,
})

registre.recepteur({ priorite: 40, recevoir: recevoirImages })
