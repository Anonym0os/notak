import type { Boite } from '../disposition'

/**
 * Le contour de sélection d'un sujet et les pastilles « + » qui l'accompagnent (docs/XMIND.md § 4 bis). Les valeurs
 * sont celles de Xmind ; le dessin ne fait que les poser.
 */

/** Écart entre le bord du sujet et le trait, épaisseur du trait, rayon du coin : px de carte au zoom 1. */
export const CONTOUR = { ecart: 1, trait: 2, rayon: 4 } as const

/** Le zoom tire l'ensemble : sous 100 % le contour reste de la même taille à l'écran, au-dessus il suit la carte. */
export const echelleContour = (zoom: number): number => Math.max(1, 1 / zoom)

export interface RectContour {
  x: number
  y: number
  l: number
  h: number
  rayon: number
  trait: number
}

/** La ligne centrale du contour, relative au coin haut gauche du sujet de taille `l` × `h` : un cran autour, à angles arrondis. */
export function contourDe(l: number, h: number, zoom: number): RectContour {
  const k = echelleContour(zoom)
  const d = (CONTOUR.ecart + CONTOUR.trait / 2) * k
  return { x: -d, y: -d, l: l + 2 * d, h: h + 2 * d, rayon: CONTOUR.rayon * k, trait: CONTOUR.trait * k }
}

/** La pastille « + » : un disque bleu plein de 18 px, qu'un clic de 20 px atteint. */
export const PASTILLE = { diametre: 18, prise: 20 } as const

/** Les pastilles ne se montrent qu'au-dessus de ce zoom. */
export const ZOOM_PASTILLES = 0.3

/** Où se posent les deux pastilles : à droite (ou à gauche) du sujet pour un enfant, dessous pour un frère. */
const ECART_ENFANT = 8
const ECART_FRERE = 7
/** Un sujet replié porte déjà une pastille de repli : celle de l'enfant se met au-delà. */
const LARGEUR_REPLI = 24

export interface Pastilles {
  /** Le centre de la pastille qui ajoute un enfant. */
  enfant: { x: number; y: number }
  /** Le centre de celle qui ajoute un frère après ; `null` : ce sujet n'en a pas (le central, un flottant, un résumé). */
  frere: { x: number; y: number } | null
}

export function pastillesDe(b: Boite, o: { gauche: boolean; souligne: boolean; replie: boolean; frere: boolean }): Pastilles {
  const r = PASTILLE.diametre / 2
  const ecart = ECART_ENFANT + r + (o.replie ? LARGEUR_REPLI : 0)
  return {
    enfant: { x: o.gauche ? b.x - ecart : b.x + b.l + ecart, y: o.souligne ? b.y + b.h - 1 : b.y + b.h / 2 },
    frere: o.frere ? { x: b.x + b.l / 2, y: b.y + b.h + ECART_FRERE + r } : null,
  }
}
