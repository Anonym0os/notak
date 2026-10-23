import type { Id, Image } from '../../coeur/tableau'

/** Des pixels RGBA, quatre octets chacun : la forme d'un `ImageData`, sans en dépendre. */
export interface Pixels {
  data: ArrayLike<number>
  width: number
  height: number
}

export interface Detourage {
  /** Les mêmes pixels, le fond rendu transparent. */
  data: Uint8ClampedArray<ArrayBuffer>
  /** Combien de pixels sont devenus (en partie) transparents : 0, le bord n'a rien de uni. */
  retires: number
}

/** La tolérance se règle de 0 à 100 ; à 100, deux couleurs distantes de ce nombre (sur 441, le blanc contre le noir) se confondent. */
export const TOLERANCE_MAX = 100
export const TOLERANCE_DEFAUT = 24
const DISTANCE_A_100 = 250
/** La largeur de la rampe, au bord du fond, où l'opacité remonte de 0 à 1 : au moins ça, pour qu'une tolérance nulle adoucisse quand même. */
const RAMPE_MIN = 14

const mediane = (valeurs: number[]) => {
  valeurs.sort((a, b) => a - b)
  return valeurs[valeurs.length >> 1]!
}

/** La couleur du fond : le milieu, canal par canal, des pixels du pourtour. */
export function couleurDuBord({ data, width, height }: Pixels): [number, number, number] {
  const canaux: number[][] = [[], [], []]
  const lire = (x: number, y: number) => {
    const i = (y * width + x) * 4
    // Un pixel déjà transparent ne dit rien de la couleur du fond.
    if (data[i + 3]! < 128) return
    for (let c = 0; c < 3; c++) canaux[c]!.push(data[i + c]!)
  }
  for (let x = 0; x < width; x++) {
    lire(x, 0)
    if (height > 1) lire(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    lire(0, y)
    if (width > 1) lire(width - 1, y)
  }
  return canaux[0]!.length === 0 ? [255, 255, 255] : [mediane(canaux[0]!), mediane(canaux[1]!), mediane(canaux[2]!)]
}

/**
 * Retire le fond d'une image dont le pourtour est uni ou presque. Depuis chaque pixel du bord proche de la couleur
 * du bord, on gagne de proche en proche les pixels voisins qui lui ressemblent : un fond qui touche le bord part,
 * un blanc enfermé dans l'objet (un œil, un reflet) reste. Les pixels qui touchent le fond sans lui ressembler tout
 * à fait gardent une partie de leur opacité : le contour n'est pas dentelé.
 */
export function detourer(source: Pixels, tolerance: number): Detourage {
  const { data, width, height } = source
  const sortie = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < sortie.length; i++) sortie[i] = data[i]!
  if (width === 0 || height === 0) return { data: sortie, retires: 0 }

  const [r, g, b] = couleurDuBord(source)
  const seuil = (Math.max(0, Math.min(TOLERANCE_MAX, tolerance)) / TOLERANCE_MAX) * DISTANCE_A_100
  const rampe = Math.max(RAMPE_MIN, seuil * 0.6)
  const distance = (p: number) => {
    const i = p * 4
    return Math.hypot(data[i]! - r, data[i + 1]! - g, data[i + 2]! - b)
  }

  const fond = new Uint8Array(width * height)
  const pile: number[] = []
  const semer = (x: number, y: number) => {
    const p = y * width + x
    if (fond[p]) return
    // Un pixel déjà transparent fait partie du fond ; les autres, s'ils ressemblent à sa couleur.
    if (data[p * 4 + 3]! >= 128 && distance(p) > seuil) return
    fond[p] = 1
    pile.push(p)
  }
  for (let x = 0; x < width; x++) {
    semer(x, 0)
    semer(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    semer(0, y)
    semer(width - 1, y)
  }
  while (pile.length > 0) {
    const p = pile.pop()!
    const [x, y] = [p % width, (p / width) | 0]
    if (x > 0) semer(x - 1, y)
    if (x < width - 1) semer(x + 1, y)
    if (y > 0) semer(x, y - 1)
    if (y < height - 1) semer(x, y + 1)
  }

  let retires = 0
  for (let p = 0; p < fond.length; p++) {
    if (fond[p]) {
      sortie[p * 4 + 3] = 0
      retires++
      continue
    }
    // Un pixel qui touche le fond (en diagonale aussi) : plus il lui ressemble, moins il est opaque.
    const [x, y] = [p % width, (p / width) | 0]
    let contre = false
    for (let dy = -1; dy <= 1 && !contre; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const [nx, ny] = [x + dx, y + dy]
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < width && ny < height && fond[ny * width + nx]) {
          contre = true
          break
        }
      }
    }
    if (!contre) continue
    const opacite = Math.max(0, Math.min(1, (distance(p) - seuil) / rampe))
    if (opacite < 1) {
      sortie[p * 4 + 3] = Math.round(data[p * 4 + 3]! * opacite)
      retires++
    }
  }
  return { data: sortie, retires }
}

const sansOriginal = ({ original: _, ...reste }: Image): Image => reste

/**
 * L'image une fois détourée : le nouveau fichier (un PNG transparent) prend la place, et l'ancien est gardé dans
 * `original`. Détourer de nouveau repart du premier fichier, jamais d'un détourage.
 */
export function avecDetourage(c: Image, fichier: Id, dimensions: { largeur: number; hauteur: number }): Image {
  const original = c.original ?? {
    fichier: c.fichier,
    largeurOrigine: c.largeurOrigine,
    hauteurOrigine: c.hauteurOrigine,
    ...(c.typeMime !== undefined ? { typeMime: c.typeMime } : {}),
    ...(c.transparente !== undefined ? { transparente: c.transparente } : {}),
    ...(c.tailles ? { tailles: c.tailles } : {}),
  }
  const { tailles: _t, ...reste } = c
  return { ...reste, fichier, largeurOrigine: dimensions.largeur, hauteurOrigine: dimensions.hauteur, typeMime: 'image/png', transparente: true, original }
}

/** L'image qui retrouve son fichier d'avant le détourage ; sans détourage, elle ne change pas. */
export function sansDetourage(c: Image): Image {
  const o = c.original
  if (!o) return c
  const { tailles: _t, typeMime: _m, transparente: _tr, ...reste } = sansOriginal(c)
  return {
    ...reste,
    fichier: o.fichier,
    largeurOrigine: o.largeurOrigine,
    hauteurOrigine: o.hauteurOrigine,
    ...(o.typeMime !== undefined ? { typeMime: o.typeMime } : {}),
    ...(o.transparente !== undefined ? { transparente: o.transparente } : {}),
    ...(o.tailles ? { tailles: o.tailles } : {}),
  }
}
