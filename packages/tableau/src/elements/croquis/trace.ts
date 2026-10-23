import { type Croquis, type Element, type Trait, nouvelId } from '../../coeur/tableau'

/** La feuille sur laquelle on dessine, en unités de feuille (le rendu la met à l'échelle). */
export const LARGEUR_FEUILLE = 640
export const HAUTEUR_FEUILLE = 480
export const LARGEUR_CROQUIS = 30

export const COULEURS_TRAIT = ['#1f2328', '#d84b4b', '#ef8a2f', '#3c9d5b', '#3a76df', '#8a5fd1'] as const
export const EPAISSEURS_TRAIT = [
  { libelle: 'Fin', valeur: 2 },
  { libelle: 'Moyen', valeur: 5 },
  { libelle: 'Épais', valeur: 10 },
] as const

/** Sous cette distance, un point de plus n'apporte rien au tracé. */
const PAS_MIN = 1.5
/** L'écart qu'une simplification a le droit d'introduire. */
const TOLERANCE = 0.7

export const nouveauCroquis = (x: number, y: number): Element<Croquis> => ({
  id: nouvelId(),
  x,
  y,
  largeur: LARGEUR_CROQUIS,
  contenu: { type: 'croquis', traits: [] },
})

const arrondi = (v: number) => Math.round(v * 10) / 10

/** Le point suivant d'un tracé en cours ; rend le tracé inchangé s'il est trop près du dernier. */
export function ajouterPoint(points: readonly number[], x: number, y: number): number[] {
  const n = points.length
  if (n >= 2 && Math.hypot(x - points[n - 2]!, y - points[n - 1]!) < PAS_MIN) return points as number[]
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

/** Ramer-Douglas-Peucker : garde les points qui portent la forme, écarte ceux qui sont presque alignés. */
export function simplifier(points: readonly number[], tolerance = TOLERANCE): number[] {
  const n = points.length / 2
  if (n <= 2) return points.map(arrondi)
  const garde = new Array<boolean>(n).fill(false)
  garde[0] = garde[n - 1] = true
  const pile: [number, number][] = [[0, n - 1]]
  while (pile.length > 0) {
    const [a, b] = pile.pop()!
    let pire = -1
    let ecart = tolerance
    for (let i = a + 1; i < b; i++) {
      const d = distanceSegment(points[2 * i]!, points[2 * i + 1]!, points[2 * a]!, points[2 * a + 1]!, points[2 * b]!, points[2 * b + 1]!)
      if (d > ecart) {
        ecart = d
        pire = i
      }
    }
    if (pire >= 0) {
      garde[pire] = true
      pile.push([a, pire], [pire, b])
    }
  }
  const sortie: number[] = []
  garde.forEach((g, i) => g && sortie.push(arrondi(points[2 * i]!), arrondi(points[2 * i + 1]!)))
  return sortie
}

const nb = (v: number) => String(arrondi(v))

/**
 * Le tracé lissé, en chemin SVG : la courbe passe par le milieu de chaque segment et prend chaque point
 * du tracé pour point de contrôle (des quadratiques bout à bout, sans cassure aux jonctions).
 */
export function cheminLisse(points: readonly number[]): string {
  const n = points.length / 2
  if (n === 0) return ''
  const p = (i: number) => [points[2 * i]!, points[2 * i + 1]!] as const
  const [x0, y0] = p(0)
  if (n === 1) return `M${nb(x0)} ${nb(y0)}l0 0.01`
  if (n === 2) {
    const [x1, y1] = p(1)
    return `M${nb(x0)} ${nb(y0)}L${nb(x1)} ${nb(y1)}`
  }
  let d = `M${nb(x0)} ${nb(y0)}`
  for (let i = 1; i < n - 1; i++) {
    const [cx, cy] = p(i)
    const [sx, sy] = p(i + 1)
    // Le dernier segment finit sur le dernier point lui-même, pas sur un milieu.
    const [ex, ey] = i === n - 2 ? [sx, sy] : [(cx + sx) / 2, (cy + sy) / 2]
    d += `Q${nb(cx)} ${nb(cy)} ${nb(ex)} ${nb(ey)}`
  }
  return d
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

/** Ce qu'on lit d'un croquis dans une liste. */
export function resume(c: Croquis): string {
  const n = c.traits.length
  return n === 0 ? 'Croquis vide' : `Croquis (${n} trait${n > 1 ? 's' : ''})`
}
