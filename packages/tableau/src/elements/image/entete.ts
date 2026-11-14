/**
 * Les dimensions d'une image lues dans son en-tête, sans la décoder : une photo de 48 Mpx coûte 200 Mo et une demi-
 * seconde au décodage, quelques octets ici. Celles d'une photo JPEG sont celles de l'écran : son indicateur de rotation
 * EXIF (une photo portrait d'iPhone est enregistrée couchée, avec l'orientation 6) est appliqué, comme le font les
 * navigateurs en l'affichant. `null` quand l'en-tête ne suffit pas à le dire : le décodeur du navigateur tranche.
 */
export interface Entete {
  largeur: number
  hauteur: number
  /** L'orientation EXIF lue (1 à 8) ; 1 quand il n'y en a pas. */
  orientation: number
}

/** Ce qu'on lit d'un fichier pour trouver son en-tête : l'EXIF d'un JPEG tient en 64 Ko, ses tables avant l'image en peu. */
export const FENETRE_ENTETE = 256 * 1024

/** Les orientations EXIF qui échangent la largeur et la hauteur (un quart de tour, avec ou sans miroir). */
const ORIENTATIONS_COUCHEES = new Set([5, 6, 7, 8])

const u16 = (o: Uint8Array, i: number, le = false) => (le ? o[i]! | (o[i + 1]! << 8) : (o[i]! << 8) | o[i + 1]!)
const u32 = (o: Uint8Array, i: number, le = false) =>
  (le ? o[i]! | (o[i + 1]! << 8) | (o[i + 2]! << 16) | (o[i + 3]! << 24) : (o[i]! << 24) | (o[i + 1]! << 16) | (o[i + 2]! << 8) | o[i + 3]!) >>> 0
const texte = (o: Uint8Array, i: number, n: number) => String.fromCharCode(...o.subarray(i, i + n))

/** L'orientation d'un bloc TIFF (celui de l'EXIF), entre `debut` et `fin` : l'étiquette 0x0112 de son premier répertoire. */
export function orientationTiff(o: Uint8Array, debut: number, fin: number): number {
  if (fin - debut < 8) return 1
  const ordre = texte(o, debut, 2)
  if (ordre !== 'II' && ordre !== 'MM') return 1
  const le = ordre === 'II'
  if (u16(o, debut + 2, le) !== 42) return 1
  const repertoire = debut + u32(o, debut + 4, le)
  if (repertoire + 2 > fin) return 1
  const entrees = u16(o, repertoire, le)
  for (let k = 0; k < entrees; k++) {
    const e = repertoire + 2 + k * 12
    if (e + 12 > fin) break
    if (u16(o, e, le) !== 0x0112) continue
    const v = u16(o, e + 8, le)
    return v >= 1 && v <= 8 ? v : 1
  }
  return 1
}

/** Largeur et hauteur à l'écran : un quart de tour EXIF les échange. */
const oriente = (largeur: number, hauteur: number, orientation: number): Entete | null =>
  largeur > 0 && hauteur > 0
    ? ORIENTATIONS_COUCHEES.has(orientation)
      ? { largeur: hauteur, hauteur: largeur, orientation }
      : { largeur, hauteur, orientation }
    : null

/** Les marqueurs SOF d'un JPEG : ceux qui portent ses dimensions (C4, C8 et CC sont d'autres tables). */
const estSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc

function enteteJpeg(o: Uint8Array): Entete | null {
  let orientation: number | null = null
  let i = 2
  while (i + 4 <= o.length) {
    if (o[i] !== 0xff) return null
    const m = o[i + 1]!
    // Octets de remplissage, et marqueurs sans longueur.
    if (m === 0xff) {
      i++
      continue
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
      i += 2
      continue
    }
    // Le début des données (ou la fin) sans dimensions : un JPEG qu'on ne sait pas lire ici.
    if (m === 0xd9 || m === 0xda) return null
    const longueur = u16(o, i + 2)
    if (longueur < 2) return null
    const debut = i + 4
    const fin = Math.min(o.length, i + 2 + longueur)
    // Le premier EXIF compte, comme pour les navigateurs.
    if (m === 0xe1 && orientation === null && texte(o, debut, 6) === 'Exif\0\0') orientation = orientationTiff(o, debut + 6, fin)
    if (estSof(m)) return debut + 5 <= o.length ? oriente(u16(o, debut + 3), u16(o, debut + 1), orientation ?? 1) : null
    i += 2 + longueur
  }
  return null
}

function entetePng(o: Uint8Array): Entete | null {
  if (o.length < 24 || texte(o, 12, 4) !== 'IHDR') return null
  // Un PNG peut porter un EXIF (`eXIf`, que le Mac écrit dans ses captures) : sans rotation, il ne change rien ; avec,
  // les navigateurs ne s'accordent pas à la suivre, et le décodeur tranchera.
  for (let i = 8; i + 8 <= o.length; ) {
    const type = texte(o, i + 4, 4)
    if (type === 'IDAT') break
    if (type === 'eXIf' && orientationTiff(o, i + 8, Math.min(o.length, i + 8 + u32(o, i))) !== 1) return null
    i += 12 + u32(o, i)
  }
  return oriente(u32(o, 16), u32(o, 20), 1)
}

function enteteGif(o: Uint8Array): Entete | null {
  return o.length >= 10 ? oriente(u16(o, 6, true), u16(o, 8, true), 1) : null
}

function enteteWebp(o: Uint8Array): Entete | null {
  if (o.length < 30) return null
  const morceau = texte(o, 12, 4)
  if (morceau === 'VP8 ') return oriente(u16(o, 26, true) & 0x3fff, u16(o, 28, true) & 0x3fff, 1)
  if (morceau === 'VP8L') {
    if (o[20] !== 0x2f) return null
    const bits = u32(o, 21, true)
    return oriente((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, 1)
  }
  if (morceau === 'VP8X') {
    // Un WebP qui porte un EXIF : comme pour le PNG, au décodeur de trancher.
    if (o[20]! & 0x08) return null
    const l = (o[24]! | (o[25]! << 8) | (o[26]! << 16)) + 1
    const h = (o[27]! | (o[28]! << 8) | (o[29]! << 16)) + 1
    return oriente(l, h, 1)
  }
  return null
}

/** Les marques d'un fichier HEIF qui disent une image HEVC : le HEIC de l'iPhone (pas l'AVIF, que les navigateurs lisent). */
const MARQUES_HEIC = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs'])

/**
 * Le format que disent ces premiers octets, quel que soit le nom ou le type annoncé du fichier : une photo nommée
 * `.jpg` peut être un HEIC, et l'inverse.
 */
export function formatDe(o: Uint8Array): 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | null {
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'jpeg'
  if (o.length >= 8 && texte(o, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (o.length >= 6 && (texte(o, 0, 6) === 'GIF87a' || texte(o, 0, 6) === 'GIF89a')) return 'gif'
  if (o.length >= 12 && texte(o, 0, 4) === 'RIFF' && texte(o, 8, 4) === 'WEBP') return 'webp'
  if (o.length >= 16 && texte(o, 4, 4) === 'ftyp') {
    // La marque principale, puis les compatibles : un HEIC peut s'annoncer en HEIF générique (`mif1`).
    const fin = Math.min(o.length, u32(o, 0))
    for (let i = 8; i + 4 <= fin; i += i === 8 ? 8 : 4) if (MARQUES_HEIC.has(texte(o, i, 4))) return 'heic'
  }
  return null
}

/** L'en-tête de ces premiers octets d'une image JPEG, PNG, GIF ou WebP, ou `null`. */
export function lireEntete(o: Uint8Array): Entete | null {
  if (o.length >= 4 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return enteteJpeg(o)
  if (o.length >= 8 && texte(o, 0, 8) === '\x89PNG\r\n\x1a\n') return entetePng(o)
  if (o.length >= 6 && (texte(o, 0, 6) === 'GIF87a' || texte(o, 0, 6) === 'GIF89a')) return enteteGif(o)
  if (o.length >= 12 && texte(o, 0, 4) === 'RIFF' && texte(o, 8, 4) === 'WEBP') return enteteWebp(o)
  return null
}

/** L'en-tête d'un fichier image, lu dans ses premiers octets ; `null` s'il ne dit pas tout. */
export async function lireEnteteDe(fichier: Blob): Promise<Entete | null> {
  try {
    return lireEntete(new Uint8Array(await fichier.slice(0, FENETRE_ENTETE).arrayBuffer()))
  } catch {
    return null
  }
}
