import type { Image, TraitImage } from '../../coeur/tableau'
import { rotationDe } from './geometrie'

export type Point2 = [number, number]

/** Les couleurs du crayon. */
export const COULEURS_TRAIT = ['#e5383b', '#1d1d1f', '#ffffff', '#1d6fe5', '#f5b301'] as const
export const COULEUR_TRAIT_DEFAUT = COULEURS_TRAIT[0]

/** L'épaisseur du crayon à l'écran, en pixels, et le rayon de la gomme. */
export const CRAYON_PX = 3
export const GOMME_PX = 9

const EPAISSEUR_MIN = 0.002
const EPAISSEUR_MAX = 0.03
/** Deux points de la main plus proches que cela (en fraction de la largeur) ne font qu'un. */
const PAS_MIN = 0.0015

const arrondi = (v: number) => Math.round(v * 10_000) / 10_000
const entre01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Un point du cadre montré (fractions de sa largeur et de sa hauteur, rotation et recadrage compris) vers l'image
 * d'origine : on défait le quart de tour, puis on replace la fraction dans la partie gardée.
 */
export function versImage(fx: number, fy: number, c: Pick<Image, 'rotation' | 'recadrage'>): Point2 {
  const rot = rotationDe(c)
  const [a, b] = rot === 90 ? [fy, 1 - fx] : rot === 180 ? [1 - fx, 1 - fy] : rot === 270 ? [1 - fy, fx] : [fx, fy]
  const r = c.recadrage ?? { x: 0, y: 0, largeur: 1, hauteur: 1 }
  return [arrondi(entre01(r.x + a * r.largeur)), arrondi(entre01(r.y + b * r.hauteur))]
}

/** L'épaisseur (fraction de la largeur d'origine) qui fait `px` pixels quand l'image entière occupe `largeurEntierePx`. */
export const epaisseurPour = (px: number, largeurEntierePx: number) =>
  Math.max(EPAISSEUR_MIN, Math.min(EPAISSEUR_MAX, px / Math.max(1, largeurEntierePx)))

/** Ajoute un point au tracé en cours, sauf s'il tombe sur le précédent ; les proportions de l'image comptent. */
export function ajouterPoint(points: readonly Point2[], p: Point2, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>): Point2[] {
  const dernier = points[points.length - 1]
  if (dernier) {
    const d = Math.hypot(p[0] - dernier[0], ((p[1] - dernier[1]) * c.hauteurOrigine) / c.largeurOrigine)
    if (d < PAS_MIN) return points as Point2[]
  }
  return [...points, p]
}

/** Le tracé en commandes SVG, dans l'espace des pixels de l'image d'origine. Un point seul fait un rond. */
export function cheminTrait(t: TraitImage, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>): string {
  const pts = t.points.map(([u, v]) => [+(u * c.largeurOrigine).toFixed(1), +(v * c.hauteurOrigine).toFixed(1)] as const)
  if (pts.length === 0) return ''
  const [x0, y0] = pts[0]!
  if (pts.length === 1) return `M${x0} ${y0}l0 0`
  return `M${x0} ${y0}` + pts.slice(1).map(([x, y]) => `L${x} ${y}`).join('')
}

/** Une couleur qui ne soit rien d'autre que `#rrggbb` : le tableau est partagé, un trait venu d'ailleurs n'est pas de confiance. */
export const couleurSure = (couleur: string) => (/^#[0-9a-f]{6}$/i.test(couleur) ? couleur : COULEUR_TRAIT_DEFAUT)

/** L'image avec ces traits, ou sans la clé quand il n'y en a plus. */
export function avecTraits(c: Image, traits: readonly TraitImage[]): Image {
  const { traits: _, ...reste } = c
  return traits.length > 0 ? { ...reste, traits: [...traits] } : reste
}

/** Le carré de la distance d'un point à un segment, dans l'espace des pixels de l'image d'origine. */
function distanceSegment(p: Point2, a: Point2, b: Point2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const long = dx * dx + dy * dy
  const t = long === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / long))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * Les traits qui restent quand la gomme passe en `p` avec ce rayon (en fraction de la largeur d'origine) : un trait
 * que la gomme touche s'en va tout entier. Les traits non touchés gardent leur identité.
 */
export function gommer(traits: readonly TraitImage[], p: Point2, rayon: number, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>): TraitImage[] {
  const vers = (q: Point2): Point2 => [q[0] * c.largeurOrigine, q[1] * c.hauteurOrigine]
  const centre = vers(p)
  const portee = rayon * c.largeurOrigine
  return traits.filter((t) => {
    const marge = portee + (t.epaisseur * c.largeurOrigine) / 2
    const pts = t.points.map(vers)
    if (pts.length === 1) return Math.hypot(pts[0]![0] - centre[0], pts[0]![1] - centre[1]) > marge
    for (let i = 1; i < pts.length; i++) if (distanceSegment(centre, pts[i - 1]!, pts[i]!) <= marge) return false
    return true
  })
}
