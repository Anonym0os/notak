import type { Boite } from '../disposition'

type Point = { x: number; y: number }

/** Une relation tracée : sa courbe, sa pointe, ses deux points de contrôle et son milieu (où va le titre). */
export interface Courbe {
  chemin: string
  pointe: string
  depart: Point
  arrivee: Point
  controles: [Point, Point]
  milieu: Point
}

const centre = (b: Boite): Point => ({ x: b.x + b.l / 2, y: b.y + b.h / 2 })

/** Où le segment du centre de `b` vers `vers` sort de la boîte. */
function bord(b: Boite, vers: Point): Point {
  const c = centre(b)
  const [dx, dy] = [vers.x - c.x, vers.y - c.y]
  if (dx === 0 && dy === 0) return c
  const k = Math.min(dx !== 0 ? b.l / 2 / Math.abs(dx) : Infinity, dy !== 0 ? b.h / 2 / Math.abs(dy) : Infinity)
  return { x: c.x + dx * k, y: c.y + dy * k }
}

/**
 * La courbe d'une relation de `a` vers `b` (docs/XMIND.md § 5). Sans points de contrôle enregistrés, elle se bombe
 * vers le haut, comme celles que Xmind pose ; sinon chaque contrôle se compte depuis son bout.
 */
export function courbeRelation(a: Boite, b: Boite, controles?: [Point, Point]): Courbe {
  const [ca, cb] = [centre(a), centre(b)]
  const [dx, dy] = [cb.x - ca.x, cb.y - ca.y]
  const defaut: [Point, Point] = [
    { x: dx * 0.25, y: dy * 0.25 - 60 },
    { x: -dx * 0.25, y: -dy * 0.25 - 60 },
  ]
  const [o1, o2] = controles ?? defaut
  // Les bouts visent les contrôles : la courbe quitte et rejoint chaque sujet par le bon côté.
  const p0 = bord(a, { x: ca.x + o1.x, y: ca.y + o1.y })
  const p3 = bord(b, { x: cb.x + o2.x, y: cb.y + o2.y })
  const c1 = { x: p0.x + o1.x, y: p0.y + o1.y }
  const c2 = { x: p3.x + o2.x, y: p3.y + o2.y }
  const milieu = {
    x: 0.125 * p0.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p3.x,
    y: 0.125 * p0.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p3.y,
  }
  const f = (v: number) => v.toFixed(1)
  // La pointe suit la tangente à l'arrivée (du second contrôle vers le bout).
  const [tx, ty] = [p3.x - c2.x, p3.y - c2.y]
  const n = Math.hypot(tx, ty) || 1
  const [ux, uy] = [tx / n, ty / n]
  const [bx, by] = [p3.x - ux * 9, p3.y - uy * 9]
  const pointe = `M${f(p3.x)} ${f(p3.y)}L${f(bx - uy * 4.5)} ${f(by + ux * 4.5)}L${f(bx + uy * 4.5)} ${f(by - ux * 4.5)}Z`
  return {
    chemin: `M${f(p0.x)} ${f(p0.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p3.x)} ${f(p3.y)}`,
    pointe,
    depart: p0,
    arrivee: p3,
    controles: [c1, c2],
    milieu,
  }
}
