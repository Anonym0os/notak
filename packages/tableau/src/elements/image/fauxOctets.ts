/**
 * Des images écrites octet par octet, pour les essais : leurs en-têtes seulement (dimensions, orientation EXIF), sans
 * pixels. De quoi éprouver la lecture et l'arrivée des photos sans navigateur ni fichier sur le disque.
 */

export const octets = (...morceaux: (number[] | Uint8Array | string)[]) =>
  new Uint8Array(morceaux.flatMap((m) => (typeof m === 'string' ? [...m].map((c) => c.charCodeAt(0)) : [...m])))
export const be16 = (v: number) => [(v >> 8) & 0xff, v & 0xff]
export const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
export const be32 = (v: number) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]
export const le32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]

/** Un segment JPEG : son marqueur, sa longueur (qui se compte elle-même), ses octets. */
export const segment = (marqueur: number, corps: number[]) => [0xff, marqueur, ...be16(corps.length + 2), ...corps]

/** Le bloc TIFF d'un EXIF qui ne porte que l'orientation, écrit comme un iPhone (« MM ») ou à l'envers (« II »). */
export function tiff(orientation: number, ordre: 'II' | 'MM' = 'MM') {
  const [u16, u32] = ordre === 'II' ? [le16, le32] : [be16, be32]
  // En-tête, puis le premier répertoire à l'octet 8 : deux étiquettes (la largeur, pour ne pas être seule, puis 0x0112).
  return [...octets(ordre), ...u16(42), ...u32(8), ...u16(2), ...u16(0x0100), ...u16(3), ...u32(1), ...u16(4032), 0, 0, ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)]
}

/** Un JPEG réduit à ses en-têtes (les dimensions sont celles d'avant l'orientation, comme dans le fichier). */
export function jpeg(
  largeur: number,
  hauteur: number,
  { orientation, ordre, sof = 0xc0, avant = [] }: { orientation?: number; ordre?: 'II' | 'MM'; sof?: number; avant?: number[][] } = {},
) {
  const exif = orientation === undefined ? [] : segment(0xe1, [...octets('Exif\0\0'), ...tiff(orientation, ordre)])
  return octets([0xff, 0xd8], ...avant, exif, segment(0xdb, new Array(65).fill(1)), segment(sof, [8, ...be16(hauteur), ...be16(largeur), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), [0xff, 0xda, 0, 2])
}

export const chunk = (type: string, corps: number[]) => [...be32(corps.length), ...octets(type), ...corps, 0, 0, 0, 0]

/** Un PNG réduit à son IHDR, et ce qu'on veut avant ses pixels. */
export const png = (largeur: number, hauteur: number, avantIdat: number[][] = []) =>
  octets('\x89PNG\r\n\x1a\n', chunk('IHDR', [...be32(largeur), ...be32(hauteur), 8, 6, 0, 0, 0]), ...avantIdat, chunk('IDAT', [1, 2, 3]))

/** Le début d'un HEIC d'iPhone : sa boîte `ftyp`. */
export const heic = (marque = 'heic', compatibles = ['mif1', 'heic']) => {
  const corps = octets(marque, [0, 0, 0, 0], ...compatibles)
  return octets(be32(corps.length + 8), 'ftyp', corps, [0, 0, 0, 8], 'meta')
}

/** Un fichier fait de ces octets, et de `remplissage` octets nuls derrière (pour peser ce qu'on veut). */
export const fichier = (debut: Uint8Array, nom: string, type: string, remplissage = 0) =>
  new File([debut as Uint8Array<ArrayBuffer>, new Uint8Array(remplissage)], nom, { type })
