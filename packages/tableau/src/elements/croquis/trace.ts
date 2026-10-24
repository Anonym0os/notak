import { type Croquis, type Element, type Trait, nouvelId } from '../../coeur/tableau'
import { getStroke } from 'perfect-freehand'
import type { SVGProps } from 'react'
import { t, tn } from '../../langue'

/** La feuille sur laquelle on dessine, en unités de feuille (le rendu la met à l'échelle). */
export const LARGEUR_FEUILLE = 640
/** La hauteur des feuilles d'avant les proportions de 1,63 : un croquis sans `hauteur` la garde. */
export const HAUTEUR_FEUILLE = 480
/** La hauteur d'une feuille neuve : rapport de 1,63 (3400 × 2090). */
export const HAUTEUR_FEUILLE_NEUVE = 393
export const LARGEUR_CROQUIS = 34

/** Un croquis, avec la hauteur de sa feuille (absente : 480, celle des croquis d'avant). */
export type CroquisFeuille = Croquis & { hauteur?: number }
export const hauteurFeuille = (c: CroquisFeuille): number => (c.hauteur && c.hauteur > 0 ? c.hauteur : HAUTEUR_FEUILLE)

/** L'encre par défaut, puis les couleurs proposées, dans l'ordre de la palette. */
export const COULEURS_TRAIT = [
  '#323b4a',
  '#bbbec3',
  '#62dbc8',
  '#7cd651',
  '#d58558',
  '#ffd14d',
  '#ff8d48',
  '#ff5757',
  '#ff6ed4',
  '#ad6fff',
  '#4ebafd',
  '#5882f8',
  '#ffffff',
] as const

/** L'encre par défaut. */
export const ENCRE_DEFAUT = COULEURS_TRAIT[0]

/**
 * La couleur dont un trait se dessine. Sur un fond qui suit le thème (un croquis transparent, un dessin sur la toile),
 * l'encre par défaut suit la couleur de ligne du thème, qui s'inverse en sombre ; le trait garde `#323b4a` dans le
 * document. Partout ailleurs, la couleur écrite.
 */
export const couleurAffichee = (couleur: string, suitLeTheme: boolean): string =>
  suitLeTheme && couleur.toLowerCase() === ENCRE_DEFAUT ? 'var(--notak-trait-defaut)' : couleur

/** Les épaisseurs, en pixels d'écran : le trait garde la même allure quelle que soit la taille de la fenêtre. */
export const EPAISSEURS_TRAIT = [
  { get libelle() { return t('croquis.fin') }, px: 2 },
  { get libelle() { return t('croquis.moyen') }, px: 4 },
  { get libelle() { return t('croquis.epais') }, px: 8 },
  { get libelle() { return t('croquis.tresEpais') }, px: 32 },
] as const
export const EPAISSEUR_DEFAUT = 1

/** L'épaisseur à ranger dans le trait : des pixels d'écran ramenés aux unités de la feuille. `echelle` : pixels par unité. */
export const epaisseurFeuille = (px: number, echelle: number): number => arrondi(px / (echelle > 0 ? echelle : 1))

export const nouveauCroquis = (x: number, y: number): Element<CroquisFeuille> => ({
  id: nouvelId(),
  x,
  y,
  largeur: LARGEUR_CROQUIS,
  contenu: { type: 'croquis', traits: [], hauteur: HAUTEUR_FEUILLE_NEUVE },
})

/** Arrondi au centième : assez fin pour un tracé, assez court pour ne pas alourdir le document. */
const arrondi = (v: number) => Math.round(v * 100) / 100

/** Les points ramenés au centième. */
export const arrondir = (points: readonly number[]): number[] => points.map(arrondi)

/** Le point suivant d'un tracé en cours ; tous sont gardés, sauf un doublon exact du dernier (le tracé reste alors inchangé). */
export function ajouterPoint(points: readonly number[], x: number, y: number): number[] {
  const n = points.length
  if (n >= 2 && x === points[n - 2] && y === points[n - 1]) return points as number[]
  return [...points, x, y]
}

/** Distance du point (px, py) au segment [(ax, ay), (bx, by)]. */
export function distanceSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const carre = dx * dx + dy * dy
  const t = carre === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / carre))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const nb = (v: number) => String(arrondi(v))

/**
 * Le tracé lissé, en chemin SVG : chaque point du tracé sert de point de contrôle à une quadratique qui finit au
 * milieu du segment suivant (des courbes bout à bout, sans cassure aux jonctions) ; le dernier segment est droit.
 */
export function cheminLisse(points: readonly number[]): string {
  const n = points.length / 2
  if (n === 0) return ''
  const p = (i: number) => [points[2 * i]!, points[2 * i + 1]!] as const
  const [x0, y0] = p(0)
  if (n === 1) return `M${nb(x0)} ${nb(y0)}l0 0.01`
  let d = `M${nb(x0)} ${nb(y0)}`
  for (let i = 1; i < n - 1; i++) {
    const [cx, cy] = p(i)
    const [sx, sy] = p(i + 1)
    d += `Q${nb(cx)} ${nb(cy)} ${nb((cx + sx) / 2)} ${nb((cy + sy) / 2)}`
  }
  const [xn, yn] = p(n - 1)
  return `${d}L${nb(xn)} ${nb(yn)}`
}

/**
 * L'effet d'encre, comme Milanote : un trait neuf s'amincit quand le geste va vite et s'épaissit quand il ralentit.
 * Le très épais n'en a pas : il sert à remplir des aplats.
 */
export const AFFINAGE = 0.6
export const affinageDe = (indiceEpaisseur: number): number => (indiceEpaisseur === EPAISSEURS_TRAIT.length - 1 ? 0 : AFFINAGE)
/** Un trait affiné est deux fois plus large qu'un trait constant de même réglage, à vitesse moyenne. */
const LARGEUR_ENCRE = 2

/** Les points du contour, en chemin SVG fermé : des quadratiques qui passent par le milieu de chaque côté. */
function cheminContour(contour: readonly number[][]): string {
  const n = contour.length
  if (n < 3) return ''
  const milieu = (a: number[], b: number[]) => `${nb((a[0]! + b[0]!) / 2)} ${nb((a[1]! + b[1]!) / 2)}`
  let d = `M${milieu(contour[0]!, contour[1]!)}Q`
  for (let i = 1; i <= n; i++) {
    const a = contour[i % n]!
    d += `${nb(a[0]!)} ${nb(a[1]!)} ${milieu(a, contour[(i + 1) % n]!)} `
  }
  return `${d.trimEnd()}Z`
}

/** Le dessin d'un trait : un contour plein pour un trait affiné, une ligne lissée à tracer de son épaisseur sinon. */
export type DessinTrait = { d: string; plein: boolean; epaisseur: number }
export function dessinTrait(points: readonly number[], epaisseur: number, affinage = 0, fini = true): DessinTrait {
  if (!affinage || points.length < 4) return { d: cheminLisse(points), plein: false, epaisseur }
  const paires: number[][] = []
  for (let i = 0; i < points.length; i += 2) paires.push([points[i]!, points[i + 1]!])
  const contour = getStroke(paires, { size: epaisseur * LARGEUR_ENCRE, thinning: affinage, smoothing: 0.5, streamline: 0.5, simulatePressure: true, last: fini })
  const d = cheminContour(contour.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])))
  return d ? { d, plein: true, epaisseur } : { d: cheminLisse(points), plein: false, epaisseur }
}

/** Les attributs SVG d'un trait dessiné en `couleur`, élargi de `deborde` (un contour de choix ou de gomme). */
export function attributsTrait(dt: DessinTrait, couleur: string, deborde = 0): SVGProps<SVGPathElement> {
  const commun = { d: dt.d, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return dt.plein
    ? { ...commun, fill: couleur, stroke: deborde > 0 ? couleur : 'none', strokeWidth: deborde > 0 ? deborde : undefined }
    : { ...commun, fill: 'none', stroke: couleur, strokeWidth: dt.epaisseur + deborde }
}

/** Un trait en balise SVG autonome, pour les téléchargements. */
export function traitEnSvg(tr: Trait): string {
  const dt = dessinTrait(tr.points, tr.epaisseur, tr.affinage)
  return dt.plein
    ? `<path d="${dt.d}" fill="${tr.couleur}"/>`
    : `<path d="${dt.d}" fill="none" stroke="${tr.couleur}" stroke-width="${tr.epaisseur}" stroke-linecap="round" stroke-linejoin="round"/>`
}

/** Un trait touche-t-il le disque de centre (x, y) et de rayon `rayon` ? (Son épaisseur compte.) */
export function toucheTrait(t: Trait, x: number, y: number, rayon: number): boolean {
  const n = t.points.length / 2
  const marge = rayon + t.epaisseur / 2
  if (n === 1) return Math.hypot(x - t.points[0]!, y - t.points[1]!) <= marge
  for (let i = 0; i < n - 1; i++) {
    if (distanceSegment(x, y, t.points[2 * i]!, t.points[2 * i + 1]!, t.points[2 * i + 2]!, t.points[2 * i + 3]!) <= marge) return true
  }
  return false
}

/** La gomme : les traits qui ne touchent pas le disque. Rend le même tableau si elle n'en touche aucun. */
export function gommer(traits: readonly Trait[], x: number, y: number, rayon = 6): Trait[] {
  const reste = traits.filter((t) => !toucheTrait(t, x, y, rayon))
  return reste.length === traits.length ? (traits as Trait[]) : reste
}

/** Le trait que la gomme viserait en (x, y) : le plus haut (le dernier dessiné) qu'elle touche, ou -1. */
export function traitVise(traits: readonly Trait[], x: number, y: number, rayon: number): number {
  for (let i = traits.length - 1; i >= 0; i--) if (toucheTrait(traits[i]!, x, y, rayon)) return i
  return -1
}

/** Ce qu'on garde d'une session à l'autre (dans le navigateur, quand il le permet). */
export function lireReglage(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}
export function ecrireReglage(cle: string, valeur: string): void {
  try {
    localStorage.setItem(cle, valeur)
  } catch {
    // Stockage fermé : le réglage ne survit pas, rien d'autre ne change.
  }
}

/** Ce qu'on lit d'un croquis dans une liste. */
export function resume(c: Croquis): string {
  const n = c.traits.length
  return n === 0 ? t('croquis.resumeVide') : tn('croquis.resume', n)
}

/** Le croquis en SVG autonome (fond blanc), pour « Télécharger en SVG ». */
export function croquisEnSvg(c: CroquisFeuille): string {
  const h = hauteurFeuille(c)
  const chemins = c.traits.map(traitEnSvg).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR_FEUILLE} ${h}" width="${LARGEUR_FEUILLE}" height="${h}"><rect width="100%" height="100%" fill="#ffffff"/>${chemins}</svg>`
}
