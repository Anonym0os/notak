import type { Image } from '../../coeur/tableau'
import { LARGEUR_COLONNE, proportionsAffichees, rotationDe } from './geometrie'

/**
 * Les largeurs, en pixels, que le serveur fabrique (`/api/fichiers/:id?l=800`, ses `LARGEURS`). 2400 et 3200 sont pour
 * les écrans Retina, où une carte large de 1200 px couvre 2400 pixels de l'écran, et la visionneuse d'un Mac davantage.
 */
export const PALIERS = [400, 800, 1600, 2400, 3200] as const

/** Les formats que le serveur réduit ; un SVG n'a pas de pixels, un GIF perdrait son animation. */
export const REDUCTIBLES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * La largeur, en pixels de l'écran, que prend l'image d'origine tout entière pour remplir son cadre : un recadrage
 * l'étire au-delà du cadre, un quart de tour échange la largeur et la hauteur du plan.
 */
export function largeurEntiereAffichee(c: Image, largeurCadrePx: number): number {
  const fraction = c.recadrage?.largeur ?? 1
  const couchee = rotationDe(c) === 90 || rotationDe(c) === 270
  const plan = couchee ? largeurCadrePx / proportionsAffichees(c) : largeurCadrePx
  return plan / fraction
}

/**
 * Le plus petit palier qui garde l'image nette : celui qui couvre les pixels de l'écran qu'elle occupe
 * (`largeurEntierePx` × densité). `null` : l'original, parce qu'aucun palier ne suffit, qu'il ne gagnerait rien
 * (l'image d'origine est aussi étroite), ou que le format ne se réduit pas.
 */
export function palierPour(c: Image, largeurEntierePx: number, densite: number): number | null {
  if (c.typeMime !== undefined && !REDUCTIBLES.has(c.typeMime)) return null
  const besoin = largeurEntierePx * Math.max(1, densite)
  const palier = PALIERS.find((p) => p >= besoin)
  if (palier === undefined || palier >= c.largeurOrigine) return null
  return palier
}

/**
 * La copie que charge la visionneuse : celle qui couvre l'écran (la place de l'image entière, son zoom, la densité),
 * ou la plus grande que le serveur fabrique quand l'écran en voudrait plus, tant qu'on ne zoome pas ; l'original
 * (`null`) quand on zoome au-delà de ce qu'elle couvre, ou qu'aucune copie n'y gagnerait (petite image, GIF, SVG).
 * Une photo de 48 Mpx s'ouvre ainsi sur 1 à 2 Mo, la copie de 3200 px d'un écran Retina, au lieu de 20 Mo.
 */
export function palierVisionneuse(c: Image, largeurEntierePx: number, zoom: number, densite: number): number | null {
  const palier = palierPour(c, largeurEntierePx * zoom, densite)
  if (palier !== null || zoom > 1) return palier
  return palierPour(c, PALIERS[PALIERS.length - 1]!, 1)
}

/** Les paliers se comparent par leur finesse : l'original (`null`) est le plus fin. */
export const finesse = (palier: number | null) => palier ?? Infinity

/** L'adresse du fichier à cette largeur ; les copies locales (`blob:`, `data:`) n'en ont pas. */
export function adresseALargeur(adresse: string, palier: number | null): string {
  if (palier === null || /^(blob|data):/.test(adresse)) return adresse
  return `${adresse}${adresse.includes('?') ? '&' : '?'}l=${palier}`
}

/** La largeur du cadre d'une image, en pixels de l'écran : celle de l'élément, ou celle d'une colonne. */
export function largeurCadrePx(largeurUG: number, dansUneColonne: boolean, pxParUG: number, echelle: number): number {
  return (dansUneColonne ? LARGEUR_COLONNE : largeurUG) * pxParUG * echelle
}
