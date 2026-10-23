import type { Image, TraitImage } from '../../coeur/tableau'
import { COULEURS_TRAIT as PALETTE, EPAISSEURS_TRAIT as TAILLES } from '../croquis/trace'
import { rotationDe } from './geometrie'

export type Point2 = [number, number]

/** Les couleurs du crayon : la palette du croquis, la même partout. */
export const COULEURS_TRAIT = PALETTE
export const COULEUR_TRAIT_DEFAUT = COULEURS_TRAIT[0]

/** Les épaisseurs du crayon à l'écran, en pixels (celles du croquis : 2, 4, 8 et 32), et le rayon de la gomme. */
export const EPAISSEURS_PX = TAILLES.map((e) => e.px)
export const EPAISSEUR_DEFAUT = 1
export const GOMME_PX = 9
/** Le contour rouge du trait que la gomme viserait, en pixels d'écran. */
export const CONTOUR_GOMME_PX = 4

const EPAISSEUR_MIN = 0.0005
const EPAISSEUR_MAX = 0.2

const arrondi = (v: number) => Math.round(v * 10_000) / 10_000
const entre01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Un point du cadre montré (fractions de sa largeur et de sa hauteur, rotation et recadrage compris) vers l'image
 * d'origine : on défait le miroir et le quart de tour, puis on replace la fraction dans la partie gardée.
 */
export function versImage(fx0: number, fy0: number, c: Pick<Image, 'rotation' | 'recadrage' | 'miroirH' | 'miroirV'>): Point2 {
  const rot = rotationDe(c)
  // Le miroir est celui de l'écran, appliqué après le quart de tour : on le défait en premier.
  const fx = c.miroirH ? 1 - fx0 : fx0
  const fy = c.miroirV ? 1 - fy0 : fy0
  const [a, b] = rot === 90 ? [fy, 1 - fx] : rot === 180 ? [1 - fx, 1 - fy] : rot === 270 ? [1 - fy, fx] : [fx, fy]
  const r = c.recadrage ?? { x: 0, y: 0, largeur: 1, hauteur: 1 }
  return [arrondi(entre01(r.x + a * r.largeur)), arrondi(entre01(r.y + b * r.hauteur))]
}

/** L'épaisseur (fraction de la largeur d'origine) qui fait `px` pixels quand l'image entière occupe `largeurEntierePx`. */
export const epaisseurPour = (px: number, largeurEntierePx: number) =>
  Math.max(EPAISSEUR_MIN, Math.min(EPAISSEUR_MAX, px / Math.max(1, largeurEntierePx)))

/** Ajoute un point au tracé en cours : tous sont gardés, sauf un doublon exact du dernier (le tracé reste alors le même). */
export function ajouterPoint(points: readonly Point2[], p: Point2, _c?: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>): Point2[] {
  const dernier = points[points.length - 1]
  if (dernier && dernier[0] === p[0] && dernier[1] === p[1]) return points as Point2[]
  return [...points, p]
}

const nb = (v: number) => +v.toFixed(2)

/**
 * Le tracé en commandes SVG, dans l'espace des pixels de l'image d'origine : comme dans le croquis, chaque point sert
 * de contrôle à une quadratique qui finit au milieu du segment suivant, et le dernier segment est droit. Un point seul
 * fait un rond.
 */
export function cheminTrait(t: TraitImage, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>): string {
  const pts = t.points.map(([u, v]) => [nb(u * c.largeurOrigine), nb(v * c.hauteurOrigine)] as const)
  if (pts.length === 0) return ''
  const [x0, y0] = pts[0]!
  if (pts.length === 1) return `M${x0} ${y0}l0 0`
  let d = `M${x0} ${y0}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i]!
    const [sx, sy] = pts[i + 1]!
    d += `Q${cx} ${cy} ${nb((cx + sx) / 2)} ${nb((cy + sy) / 2)}`
  }
  const [xn, yn] = pts[pts.length - 1]!
  return `${d}L${xn} ${yn}`
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

/** Le trait touche-t-il le disque de centre `p` et de rayon `rayon` (fraction de la largeur d'origine) ? Son épaisseur compte. */
function touche(t: TraitImage, centre: Point2, portee: number, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>): boolean {
  const vers = (q: Point2): Point2 => [q[0] * c.largeurOrigine, q[1] * c.hauteurOrigine]
  const marge = portee + (t.epaisseur * c.largeurOrigine) / 2
  const pts = t.points.map(vers)
  if (pts.length === 1) return Math.hypot(pts[0]![0] - centre[0], pts[0]![1] - centre[1]) <= marge
  for (let i = 1; i < pts.length; i++) if (distanceSegment(centre, pts[i - 1]!, pts[i]!) <= marge) return true
  return false
}

/** Le trait que la gomme viserait en `p` : le plus haut (le dernier dessiné) qu'elle touche, ou -1. */
export function traitVise(traits: readonly TraitImage[], p: Point2, rayon: number, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>): number {
  const centre: Point2 = [p[0] * c.largeurOrigine, p[1] * c.hauteurOrigine]
  const portee = rayon * c.largeurOrigine
  for (let i = traits.length - 1; i >= 0; i--) if (touche(traits[i]!, centre, portee, c)) return i
  return -1
}

/**
 * Les traits qui restent quand la gomme passe en `p` avec ce rayon (en fraction de la largeur d'origine) : un trait
 * que la gomme touche s'en va tout entier. Les traits non touchés gardent leur identité.
 */
export function gommer(traits: readonly TraitImage[], p: Point2, rayon: number, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>): TraitImage[] {
  const centre: Point2 = [p[0] * c.largeurOrigine, p[1] * c.hauteurOrigine]
  const portee = rayon * c.largeurOrigine
  return traits.filter((t) => !touche(t, centre, portee, c))
}
