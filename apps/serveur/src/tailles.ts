import sharp from 'sharp'

/** Les largeurs en pixels que le serveur sait fabriquer, de la plus petite à la plus grande. */
export const LARGEURS = [400, 800, 1600] as const

/** Les formats qu'on réduit : un SVG se redimensionne seul, un GIF perdrait son animation. */
const REDUCTIBLES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * La largeur à fabriquer pour une demande `?l=…` : le plus petit palier qui couvre la valeur, 1600 au plus.
 * `null` si la valeur n'est pas un nombre entier positif.
 */
export function largeurDemandee(valeur: string | undefined): number | null {
  if (valeur === undefined || !/^\d{1,5}$/.test(valeur)) return null
  const n = Number(valeur)
  if (n < 1) return null
  return LARGEURS.find((l) => l >= n) ?? LARGEURS[LARGEURS.length - 1]!
}

export const reductible = (type: string) => REDUCTIBLES.has(type.split(';')[0]!.trim().toLowerCase())

/** Le nom, à côté du fichier d'origine, de sa copie à cette largeur. */
export const nomReduit = (id: string, largeur: number) => `${id}.${largeur}`

/**
 * Une copie de l'image à `largeur` pixels, dans son format, tournée comme son EXIF le demande : ses pixels sont
 * redressés et l'EXIF n'y est plus, elle s'affiche comme l'original. `null` quand il n'y a rien à gagner (l'image, vue
 * droite, est déjà aussi étroite) ou que l'image est illisible : le serveur sert alors l'original.
 */
export async function reduire(octets: Buffer, type: string, largeur: number): Promise<Buffer | null> {
  if (!reductible(type)) return null
  try {
    const entree = sharp(octets, { failOn: 'error' })
    const meta = await entree.metadata()
    // La largeur vue : celle d'une photo portrait d'iPhone, enregistrée couchée, est sa hauteur enregistrée.
    const vue = meta.autoOrient?.width ?? meta.width
    if (!vue || vue <= largeur) return null
    const reduite = entree.autoOrient().resize({ width: largeur, withoutEnlargement: true })
    const format = type.split(';')[0]!.trim().toLowerCase()
    if (format === 'image/jpeg') return await reduite.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    if (format === 'image/webp') return await reduite.webp({ quality: 82 }).toBuffer()
    return await reduite.png({ compressionLevel: 9 }).toBuffer()
  } catch {
    return null
  }
}

/** Combien de copies se fabriquent à la fois : chacune tient son original en mémoire (25 Mo au plus) le temps de le réduire. */
export const FABRICATIONS_MAX = 2

/**
 * Une file d'attente : `n` tâches à la fois, les suivantes attendent leur tour sans avoir rien lu. Une toile pleine de
 * grandes photos, ouverte pour la première fois, demande toutes ses copies d'un coup : sans file, chaque demande lirait
 * et déchiffrerait son original avant d'attendre `sharp`, et la mémoire du serveur y passerait.
 */
export function fileDAttente(n: number) {
  let actives = 0
  const attente: (() => void)[] = []
  return async <T>(tache: () => Promise<T>): Promise<T> => {
    // La place d'une tâche finie passe à la suivante sans être rendue : une demande arrivée entre-temps ne la prend pas.
    if (actives < n) actives++
    else await new Promise<void>((tour) => attente.push(tour))
    try {
      return await tache()
    } finally {
      const suivante = attente.shift()
      if (suivante) suivante()
      else actives--
    }
  }
}
