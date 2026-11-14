import type { Image as ContenuImage } from '../../coeur/tableau'
import { lireEnteteDe } from './entete'
import { REDUCTIBLES } from './tailles'

/**
 * Les dimensions d'une image en pixels, telle qu'on la voit (une photo tournée par son EXIF l'est aussi ici), ou
 * `null` si elle ne se lit pas. L'en-tête suffit le plus souvent ; sinon le navigateur décode l'image.
 */
export async function lireDimensions(fichier: Blob): Promise<{ largeur: number; hauteur: number } | null> {
  const entete = fichier.type === 'image/svg+xml' ? null : await lireEnteteDe(fichier)
  if (entete) return { largeur: entete.largeur, hauteur: entete.hauteur }
  try {
    if (fichier.type !== 'image/svg+xml') {
      const bitmap = await createImageBitmap(fichier)
      const d = { largeur: bitmap.width, hauteur: bitmap.height }
      bitmap.close()
      return d.largeur > 0 && d.hauteur > 0 ? d : null
    }
  } catch {
    return null
  }
  // Un SVG passe par une balise `img` ; sans dimensions déclarées, le navigateur en invente une par défaut.
  const adresse = URL.createObjectURL(fichier)
  try {
    const img = new Image()
    img.src = adresse
    await img.decode()
    return { largeur: img.naturalWidth || 300, hauteur: img.naturalHeight || 150 }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(adresse)
  }
}

/** Côté le plus long de la copie sur laquelle on cherche la transparence : assez pour la voir, pas pour peser. */
const COTE_LECTURE = 64
/** Un pixel est transparent s'il laisse passer plus d'un vingtième de la lumière. */
const ALPHA_OPAQUE = 242
/** Une image est transparente quand au moins un pixel sur cent l'est (un bord adouci ne compte pas). */
const PART_TRANSPARENTE = 0.01

/** Dit si ces pixels (RGBA, quatre octets chacun) laissent voir ce qu'il y a derrière. */
export function aDesTransparences(pixels: ArrayLike<number>): boolean {
  const total = Math.floor(pixels.length / 4)
  if (total === 0) return false
  let clairs = 0
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! < ALPHA_OPAQUE) clairs++
  return clairs / total >= PART_TRANSPARENTE
}

/**
 * Lit dans l'image si elle est transparente, sur une copie réduite. `undefined` si elle ne se lit pas : l'ombre
 * se devine alors au type du fichier.
 */
export async function lireTransparence(fichier: Blob): Promise<boolean | undefined> {
  if (fichier.type === 'image/jpeg') return false
  const adresse = URL.createObjectURL(fichier)
  try {
    const img = new Image()
    img.src = adresse
    await img.decode()
    const [l, h] = [img.naturalWidth || 300, img.naturalHeight || 150]
    const k = Math.min(1, COTE_LECTURE / Math.max(l, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(l * k))
    canvas.height = Math.max(1, Math.round(h * k))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return undefined
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return aDesTransparences(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(adresse)
  }
}

/**
 * Le plus grand côté de l'aperçu d'une photo qu'on envoie : net sur sa carte (340 px de large à 100 %, le double de
 * pixels sur un écran Retina), et 3 Mo une fois décodé, au lieu de 190 pour une photo de 48 Mpx.
 */
export const COTE_APERCU = 1024

/** Cette image se montre réduite le temps de son envoi : plus grande que l'aperçu, dans un format qui se réduit. */
export const aUnApercu = (c: Pick<ContenuImage, 'typeMime' | 'largeurOrigine' | 'hauteurOrigine'>) =>
  REDUCTIBLES.has(c.typeMime ?? '') && Math.max(c.largeurOrigine, c.hauteurOrigine) > COTE_APERCU

/** Safari garde la mémoire d'une toile tant qu'elle a une taille : vidée, elle la rend aussitôt. */
export function viderToile(toile: HTMLCanvasElement) {
  toile.width = toile.height = 0
}

/**
 * Une copie de l'image, son plus grand côté à `cote` pixels au plus, dans une toile (à vider après usage, voir
 * `viderToile`). Le navigateur décode la photo une fois, hors du fil principal, puis la relâche tout de suite : vingt
 * photos de 48 Mpx lues de suite n'attendent pas le ramasse-miettes pour rendre leurs 190 Mo. `null` si elle ne se lit
 * pas.
 */
export async function lireReduite(fichier: Blob, cote: number): Promise<HTMLCanvasElement | null> {
  let adresse: string | null = null
  let img: HTMLImageElement | null = null
  let toile: HTMLCanvasElement | null = null
  try {
    adresse = URL.createObjectURL(fichier)
    img = new Image()
    img.src = adresse
    await img.decode()
    const [l, h] = [img.naturalWidth, img.naturalHeight]
    if (!l || !h) return null
    const k = Math.min(1, cote / Math.max(l, h))
    toile = document.createElement('canvas')
    toile.width = Math.max(1, Math.round(l * k))
    toile.height = Math.max(1, Math.round(h * k))
    const ctx = toile.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, toile.width, toile.height)
    const reduite = toile
    toile = null
    return reduite
  } catch {
    return null
  } finally {
    if (adresse) URL.revokeObjectURL(adresse)
    img?.removeAttribute('src')
    if (toile) viderToile(toile)
  }
}

/** La copie réduite en fichier à montrer : un JPEG, ou un PNG pour une image qui laisse (ou peut laisser) voir à travers. */
export function enApercu(toile: HTMLCanvasElement, transparente: boolean | undefined): Promise<Blob | null> {
  return new Promise((fin) => {
    try {
      toile.toBlob(fin, transparente === false ? 'image/jpeg' : 'image/png', 0.85)
    } catch {
      fin(null)
    }
  })
}
