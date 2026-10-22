/** Un point du tableau, en unités de grille (UG), ou de l'écran, en pixels. */
export interface Point {
  x: number
  y: number
}

/** Un rectangle aligné sur les axes : coin haut-gauche et coin bas-droit. */
export interface Rect {
  min: Point
  max: Point
}

export const point = (x: number, y: number): Point => ({ x, y })
export const ajouter = (a: Point, b: Point): Point => point(a.x + b.x, a.y + b.y)
export const soustraire = (a: Point, b: Point): Point => point(a.x - b.x, a.y - b.y)

export function depuisCoins(a: Point, b: Point): Rect {
  return {
    min: point(Math.min(a.x, b.x), Math.min(a.y, b.y)),
    max: point(Math.max(a.x, b.x), Math.max(a.y, b.y)),
  }
}

export const depuisTaille = (min: Point, largeur: number, hauteur: number): Rect => ({
  min,
  max: point(min.x + largeur, min.y + hauteur),
})

export const largeur = (r: Rect) => r.max.x - r.min.x
export const hauteur = (r: Rect) => r.max.y - r.min.y
export const centre = (r: Rect): Point => point((r.min.x + r.max.x) / 2, (r.min.y + r.max.y) / 2)

export const contient = (r: Rect, p: Point) =>
  p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y

/** Vrai si les deux rectangles se touchent, même d'un bord. */
export const chevauche = (a: Rect, b: Rect) =>
  a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.y <= b.max.y && b.min.y <= a.max.y

export function englobant(rects: Iterable<Rect>): Rect | null {
  let r: Rect | null = null
  for (const s of rects) {
    r = r
      ? {
          min: point(Math.min(r.min.x, s.min.x), Math.min(r.min.y, s.min.y)),
          max: point(Math.max(r.max.x, s.max.x), Math.max(r.max.y, s.max.y)),
        }
      : s
  }
  return r
}
