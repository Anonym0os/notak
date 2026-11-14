import { TAILLE_MAX, TYPES_ACCEPTES } from './geometrie'
import { type Entete, FENETRE_ENTETE, formatDe, lireEntete } from './entete'
import { lireTransparence } from './lecture'

/**
 * Les photos qu'il faut redessiner avant de les envoyer : un HEIC (le format de l'iPhone, que ni Chrome ni le serveur
 * ne savent lire) devient un JPEG, et une photo de plus de 25 Mo une copie plus petite, plutôt qu'un refus.
 */

/** Les types d'un HEIC, que le navigateur ne donne pas toujours (il reste alors l'extension). */
const TYPES_HEIC = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])

/** Ce fichier s'annonce comme une photo HEIC, par son type ou, faute de type, par son nom. */
export const estHeic = (f: { type: string; name?: string }) =>
  TYPES_HEIC.has(f.type.toLowerCase()) || ((f.type === '' || f.type === 'application/octet-stream') && /\.hei[cf]$/i.test(f.name ?? ''))

/** Ce fichier devient une image sur la toile (et pas un fichier joint) : un format qu'on montre, ou un HEIC à convertir. */
export const prisEnImage = (f: { type: string; name?: string }) => TYPES_ACCEPTES.includes(f.type) || estHeic(f)

/**
 * Le plus de pixels qu'une photo redessinée garde : sous la limite des toiles de Safari sur iPhone et iPad (16,7 Mpx),
 * au-delà de laquelle le dessin sort vide. 12 Mpx (la photo ordinaire d'un iPhone) passent entiers.
 */
export const PIXELS_MAX = 16_000_000
/** Une image plus grande ne se décode pas ici : le navigateur y laisserait sa mémoire (400 Mo pour 100 Mpx). */
export const PIXELS_DECODABLES = 100_000_000
/** Au-delà, même pour la réduire, on ne lit pas le fichier. */
export const TAILLE_REDESSINABLE = 100 * 1024 * 1024

const TYPE_DU_FORMAT = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic' } as const

/**
 * Redessine l'image à `PIXELS_MAX` au plus, dans ce format. Le navigateur la décode telle qu'il l'affiche, tournée par
 * son EXIF : la copie a ses pixels droits et plus d'EXIF, elle s'affiche pareil partout. `null` s'il ne la lit pas.
 */
export async function redessiner(fichier: Blob, type: 'image/jpeg' | 'image/png', qualite = 0.9): Promise<Blob | null> {
  const adresse = URL.createObjectURL(fichier)
  let toile: HTMLCanvasElement | null = null
  try {
    const img = new Image()
    img.src = adresse
    await img.decode()
    const [l, h] = [img.naturalWidth, img.naturalHeight]
    if (!l || !h) return null
    const k = Math.min(1, Math.sqrt(PIXELS_MAX / (l * h)))
    toile = document.createElement('canvas')
    toile.width = Math.max(1, Math.floor(l * k))
    toile.height = Math.max(1, Math.floor(h * k))
    const ctx = toile.getContext('2d')
    if (!ctx) return null
    // Un JPEG n'a pas de transparence : le fond d'une image qui en avait devient blanc, pas noir.
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, toile.width, toile.height)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, toile.width, toile.height)
    const dessin = toile
    return await new Promise<Blob | null>((fin) => dessin.toBlob(fin, type, qualite))
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(adresse)
    // Safari garde la mémoire d'une toile tant qu'elle a une taille : plusieurs grandes photos de suite la feraient manquer.
    if (toile) toile.width = toile.height = 0
  }
}

/** Le nom d'une photo devenue JPEG : `IMG_0001.HEIC` → `IMG_0001.jpg`. */
export const nomEnJpeg = (nom: string) => (nom ? `${nom.replace(/\.[^./\\]*$/, '') || nom}.jpg` : 'photo.jpg')

/** Pourquoi une image ne part pas : son format, sa taille, ou ses octets illisibles. */
export type Refus = 'heic' | 'taille' | 'illisible'

/** Une image prête à partir : le fichier à envoyer (le même, ou sa copie redessinée) et son en-tête, s'il dit tout. */
export type Prete = { fichier: File; entete: Entete | null } | { refus: Refus }

/** Ce qui, pour préparer une image, demande un vrai navigateur : à part, pour que les essais s'en passent. */
export interface OutilsPreparation {
  redessiner: typeof redessiner
  lireTransparence: typeof lireTransparence
}

/**
 * Prépare une image pour la toile : le type vient de ses octets (pas de son nom), un HEIC devient un JPEG, une
 * photo trop lourde une copie plus petite.
 */
export async function preparerImage(f: File, outils: Partial<OutilsPreparation> = {}): Promise<Prete> {
  const refaire = outils.redessiner ?? redessiner
  let debut: Uint8Array
  try {
    debut = new Uint8Array(await f.slice(0, FENETRE_ENTETE).arrayBuffer())
  } catch {
    return { refus: 'illisible' }
  }
  const format = formatDe(debut)
  if (format === 'heic' || (format === null && estHeic(f))) {
    if (f.size > TAILLE_REDESSINABLE) return { refus: 'taille' }
    const jpeg = await refaire(f, 'image/jpeg')
    if (!jpeg) return { refus: 'heic' }
    const fichier = new File([jpeg], nomEnJpeg(f.name), { type: 'image/jpeg', lastModified: f.lastModified })
    return { fichier, entete: lireEntete(new Uint8Array(await jpeg.slice(0, FENETRE_ENTETE).arrayBuffer())) }
  }
  const type = format ? TYPE_DU_FORMAT[format] : f.type
  const entete = lireEntete(debut)
  const fichier = type === f.type ? f : new File([f], f.name, { type, lastModified: f.lastModified })
  if (fichier.size <= TAILLE_MAX) return { fichier, entete }
  // Trop lourde : une photo (JPEG) ou une image (PNG) se réduit ; un GIF y perdrait son animation.
  const reductible = (type === 'image/jpeg' || type === 'image/png') && fichier.size <= TAILLE_REDESSINABLE
  if (!reductible || (entete && entete.largeur * entete.hauteur > PIXELS_DECODABLES)) return { refus: 'taille' }
  // Un PNG sans transparence est le plus souvent une photo collée (le presse-papiers du Mac les donne ainsi) : en JPEG,
  // elle tient sous la limite ; un PNG transparent le reste, pour ne pas perdre son détourage.
  const opaque = type === 'image/png' && (await (outils.lireTransparence ?? lireTransparence)(fichier)) === false
  const cible = type === 'image/jpeg' || opaque ? 'image/jpeg' : 'image/png'
  const copie = await refaire(fichier, cible)
  if (!copie || copie.size > TAILLE_MAX) return { refus: 'taille' }
  return {
    fichier: new File([copie], cible === type ? fichier.name : nomEnJpeg(fichier.name), { type: cible, lastModified: f.lastModified }),
    entete: lireEntete(new Uint8Array(await copie.slice(0, FENETRE_ENTETE).arrayBuffer())),
  }
}
