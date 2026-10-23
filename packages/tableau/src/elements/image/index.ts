import type { Element, Image, Lien } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsFinImage, OutilsImage, RenduImage } from './Image'
import { amorcerLegende } from './legendeAmorce'
import './image.css'
import { RETRAIT_PX, aUneCarte, cadrageLibre, largeurNaturelleImage, rapportDuCadre } from './geometrie'
import { raccourciAnnoter } from './raccourciAnnotation'
import { choisirPourRemplacer, recevoirImages } from './recepteur'
import { choisirImageApercu, estVideo, imageMontree } from '../lien/imageApercu'
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
  proportion: rapportDuCadre,
  cadrageLibre,
})

registre.recepteur({ priorite: 40, cumulable: true, recevoir: recevoirImages })
registre.raccourci(raccourciAnnoter)

const toutesImages = (els: Element[]): els is Element<Image>[] => els.length > 0 && els.every((e) => e.contenu.type === 'image')

// Remplacer l'image : le sélecteur de fichiers, puis le fichier prend la place de l'image (position, largeur et légende gardées).
// Le même geste remplace l'image d'un lien (celle de son aperçu, hors vidéo : « Remplacer l'aperçu » est à elle, voir elements/lien).
registre.entreeMenu({
  get libelle() {
    return t('image.remplacer')
  },
  visible: (els, contexte) => {
    if (els.length !== 1 || contexte.services.lectureSeule || !contexte.services.fichiers) return false
    const c = els[0]!.contenu
    return c.type === 'image' || (c.type === 'lien' && !!c.url && imageMontree(c) && !estVideo(c))
  },
  faire: ([e], contexte) => {
    if (e?.contenu.type === 'image') choisirPourRemplacer(e as Element<Image>, contexte)
    else if (e?.contenu.type === 'lien') choisirImageApercu(e as Element<Lien>, contexte)
  },
})

// « Rogner l'image sur la grille de points » : cochée, l'image est rognée pour que ses bords tombent sur la grille ;
// décochée, elle garde ses proportions exactes.
registre.entreeMenu({
  get libelle() {
    return t('image.rognerGrille')
  },
  visible: (els, contexte) => toutesImages(els) && !contexte.services.lectureSeule,
  coche: (els) => toutesImages(els) && els.every((e) => !e.contenu.proportionsExactes),
  faire: (els, contexte) => {
    if (!toutesImages(els)) return
    const exactes = els.every((e) => !e.contenu.proportionsExactes)
    contexte.magasin.faire(
      els.map((e) => {
        const { proportionsExactes: _, ...reste } = e.contenu
        return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: exactes ? { ...reste, proportionsExactes: true } : reste }
      }),
    )
  },
})
