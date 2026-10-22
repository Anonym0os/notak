import type { Image } from '../../coeur/tableau'

/** Les formats acceptés, et la taille maximale d'un fichier. */
export const TYPES_ACCEPTES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
export const TAILLE_MAX = 25 * 1024 * 1024

const LARGEUR_MAX_UG = 34
const LARGEUR_MIN_UG = 4
/** La largeur naturelle ne dépasse pas 1600 px. */
const LARGEUR_NATURELLE_MAX_PX = 1600
const LARGEUR_COLONNE = 36
const ECART = 2
const PX_PAR_UG = 10

export interface TailleUG {
  largeur: number
  hauteur: number
}

/** La largeur d'une image neuve, en UG : sa taille en pixels sur dix, entre 4 et 34. */
export const largeurInitiale = (largeurOrigine: number) =>
  Math.max(LARGEUR_MIN_UG, Math.min(Math.round(largeurOrigine / PX_PAR_UG), LARGEUR_MAX_UG))

/** La largeur « naturelle » : la taille d'origine, au plus 1600 px. */
export const largeurNaturelleImage = (c: Image) => Math.min(c.largeurOrigine, LARGEUR_NATURELLE_MAX_PX) / PX_PAR_UG

/** La hauteur qui garde les proportions d'origine, en UG. */
export const hauteurPour = (largeur: number, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>) =>
  (largeur * c.hauteurOrigine) / c.largeurOrigine

/** Les formats qu'on suppose transparents n'ont pas d'ombre. */
export const aUneOmbre = (typeMime: string | undefined) =>
  typeMime !== 'image/png' && typeMime !== 'image/gif' && typeMime !== 'image/svg+xml'

export const nombreColonnes = (largeurVuePx: number) => Math.max(3, Math.floor(largeurVuePx / 360))

/**
 * Où poser des images reçues ensemble, en UG. Une seule : au point de dépôt, décalée d'une UG vers le
 * haut et la gauche. Plusieurs : en colonnes de 36 UG, chacune dans la colonne la moins haute.
 */
export function placerImages(tailles: TailleUG[], ou: { x: number; y: number }, colonnes: number): [number, number][] {
  if (tailles.length === 1) return [[Math.round(ou.x) - 1, Math.round(ou.y) - 1]]
  const hauteurs = new Array<number>(Math.max(1, colonnes)).fill(0)
  return tailles.map((t) => {
    const col = hauteurs.indexOf(Math.min(...hauteurs))
    const position: [number, number] = [Math.round(ou.x) + col * LARGEUR_COLONNE, Math.round(ou.y) + hauteurs[col]!]
    hauteurs[col] = hauteurs[col]! + Math.ceil(t.hauteur) + ECART
    return position
  })
}

/** Le contenu avec sa légende, ou sans la clé si elle est vide. */
export function avecLegende(c: Image, texte: string): Image {
  const { legende: _, ...reste } = c
  const propre = texte.replace(/\s+/g, ' ').trim()
  return propre ? { ...reste, legende: propre } : reste
}
