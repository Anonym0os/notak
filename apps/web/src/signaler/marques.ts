/**
 * Les marques posées sur une image du signalement, en px de l'image : un trait de stylo, une flèche (de son départ
 * vers sa pointe), un cercle (l'ellipse inscrite dans le geste). Pur : la fenêtre les dessine en SVG, l'envoi les
 * peint sur un canevas, avec la même géométrie, d'où une image envoyée identique à celle qu'on voyait.
 */

export type Point = readonly [number, number]
/** `e` : l'épaisseur du trait, en px de l'image. */
export type Marque =
  | { genre: 'stylo'; e: number; points: Point[] }
  | { genre: 'fleche'; e: number; de: Point; vers: Point }
  | { genre: 'cercle'; e: number; de: Point; vers: Point }
export type Outil = Marque['genre'] | 'recadrer'
export type Cadre = { x: number; y: number; l: number; h: number }

/** Sous cette taille (px d'image), une flèche, un cercle ou un cadre est un clic, pas un geste. */
export const GESTE_MIN = 8

/** L'épaisseur du trait à l'écran, au moment du geste : la même qu'on voie l'image réduite ou recadrée. */
export const EPAISSEUR_ECRAN = 3.5

export function cadreEntre(a: Point, b: Point): Cadre {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), l: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }
}

export const cadreUtile = (c: Cadre | null): c is Cadre => c !== null && c.l >= GESTE_MIN && c.h >= GESTE_MIN

/** Une marque qui vaut d'être gardée : un trait d'un seul point, une flèche ou un cercle minuscules sont des clics. */
export function marqueUtile(m: Marque): boolean {
  if (m.genre === 'stylo') return m.points.length > 1
  if (m.genre === 'fleche') return Math.hypot(m.vers[0] - m.de[0], m.vers[1] - m.de[1]) >= GESTE_MIN
  const c = cadreEntre(m.de, m.vers)
  return c.l >= GESTE_MIN || c.h >= GESTE_MIN
}

/** La flèche : sa tige, qui s'arrête à la base de la pointe, et la pointe pleine, un triangle. */
export function geometrieDeFleche(de: Point, vers: Point, e: number): { tige: [Point, Point]; pointe: [Point, Point, Point] } {
  const l = Math.hypot(vers[0] - de[0], vers[1] - de[1]) || 1
  const ux = (vers[0] - de[0]) / l
  const uy = (vers[1] - de[1]) / l
  const longueur = Math.min(e * 4.5, l * 0.6)
  const demi = longueur * 0.6
  const base: Point = [vers[0] - ux * longueur, vers[1] - uy * longueur]
  return {
    tige: [de, base],
    pointe: [vers, [base[0] - uy * demi, base[1] + ux * demi], [base[0] + uy * demi, base[1] - ux * demi]],
  }
}

export function ellipseDe(de: Point, vers: Point): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: (de[0] + vers[0]) / 2, cy: (de[1] + vers[1]) / 2, rx: Math.abs(vers[0] - de[0]) / 2, ry: Math.abs(vers[1] - de[1]) / 2 }
}

/** Le geste en cours : le point d'arrivée remplace le précédent (flèche, cercle) ou s'ajoute au trait (stylo). */
export function prolonger(m: Marque, p: Point): Marque {
  return m.genre === 'stylo' ? { ...m, points: [...m.points, p] } : { ...m, vers: p }
}

/** `e` en px de l'image : `EPAISSEUR_ECRAN` fois le rapport de l'image à sa taille affichée. */
export function commencer(outil: Marque['genre'], p: Point, e: number): Marque {
  return outil === 'stylo' ? { genre: 'stylo', e, points: [p] } : { genre: outil, e, de: p, vers: p }
}

/** Peint les marques sur un contexte déjà mis à l'échelle de l'image. */
export function peindreMarques(ctx: CanvasRenderingContext2D, marques: readonly Marque[], couleur: string): void {
  ctx.strokeStyle = couleur
  ctx.fillStyle = couleur
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const m of marques) {
    ctx.lineWidth = m.e
    ctx.beginPath()
    if (m.genre === 'stylo') m.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    else if (m.genre === 'cercle') {
      const { cx, cy, rx, ry } = ellipseDe(m.de, m.vers)
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    } else {
      const { tige, pointe } = geometrieDeFleche(m.de, m.vers, m.e)
      ctx.moveTo(...tige[0])
      ctx.lineTo(...tige[1])
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(...pointe[0])
      ctx.lineTo(...pointe[1])
      ctx.lineTo(...pointe[2])
      ctx.closePath()
      ctx.fill()
      continue
    }
    ctx.stroke()
  }
}
