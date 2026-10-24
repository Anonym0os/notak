import type { FormeRelation } from '../../../coeur/tableau'
import type { Boite } from '../disposition'

type Point = { x: number; y: number }

/** Une relation tracée : sa courbe, sa pointe, ses deux points de contrôle et son milieu (où va le titre). */
export interface Courbe {
  chemin: string
  pointe: string
  /** La pointe au départ, si la relation en porte une. */
  pointeDepart: string
  depart: Point
  arrivee: Point
  controles: [Point, Point]
  milieu: Point
  /** Dans quelle direction (radians, 0 : vers la droite) le trait arrive à chaque bout : pour poser une pointe. */
  angles: { depart: number; arrivee: number }
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
export function courbeRelation(a: Boite, b: Boite, controles?: [Point, Point], formeRelation: FormeRelation | 'courbe' | 'droite' | 'coudee' = 'courbe'): Courbe {
  const forme = formeRelation.replace('-souple', '') as 'courbe' | 'droite' | 'coudee' | 'zigzag'
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
  // Une pointe à un bout, dans l'axe de la tangente (du contrôle vers le bout).
  const pointeEn = (bout: Point, depuis: Point) => {
    const [tx, ty] = [bout.x - depuis.x, bout.y - depuis.y]
    const n = Math.hypot(tx, ty) || 1
    const [ux, uy] = [tx / n, ty / n]
    const [bx, by] = [bout.x - ux * 9, bout.y - uy * 9]
    return `M${f(bout.x)} ${f(bout.y)}L${f(bx - uy * 4.5)} ${f(by + ux * 4.5)}L${f(bx + uy * 4.5)} ${f(by - ux * 4.5)}Z`
  }
  const angle = (bout: Point, depuis: Point) => Math.atan2(bout.y - depuis.y, bout.x - depuis.x)
  if (forme === 'droite') {
    // Droite : de centre à centre, coupée aux bords ; les contrôles restent pour qu'on puisse la recourber.
    const [d0, d1] = [bord(a, cb), bord(b, ca)]
    return {
      chemin: `M${f(d0.x)} ${f(d0.y)}L${f(d1.x)} ${f(d1.y)}`,
      pointe: pointeEn(d1, d0),
      pointeDepart: pointeEn(d0, d1),
      depart: d0,
      arrivee: d1,
      controles: [c1, c2],
      milieu: { x: (d0.x + d1.x) / 2, y: (d0.y + d1.y) / 2 },
      angles: { depart: angle(d0, d1), arrivee: angle(d1, d0) },
    }
  }
  if (forme === 'coudee') {
    // Coudée : par le premier contrôle à la verticale, puis à l'horizontale vers la cible.
    const ym = c1.y
    const chemin = `M${f(p0.x)} ${f(p0.y)}V${f(ym)}H${f(p3.x)}V${f(p3.y)}`
    return {
      chemin,
      pointe: pointeEn(p3, { x: p3.x, y: ym }),
      pointeDepart: pointeEn(p0, { x: p0.x, y: ym }),
      depart: p0,
      arrivee: p3,
      controles: [c1, c2],
      milieu: { x: (p0.x + p3.x) / 2, y: ym },
      angles: { depart: angle(p0, { x: p0.x, y: ym }), arrivee: angle(p3, { x: p3.x, y: ym }) },
    }
  }
  if (forme === 'zigzag') {
    // Zigzag : à l'horizontale depuis le départ, puis à la verticale, puis à l'horizontale jusqu'à la cible.
    const xm = c1.x
    return {
      chemin: `M${f(p0.x)} ${f(p0.y)}H${f(xm)}V${f(p3.y)}H${f(p3.x)}`,
      pointe: pointeEn(p3, { x: xm, y: p3.y }),
      pointeDepart: pointeEn(p0, { x: xm, y: p0.y }),
      depart: p0,
      arrivee: p3,
      controles: [c1, c2],
      milieu: { x: xm, y: (p0.y + p3.y) / 2 },
      angles: { depart: angle(p0, { x: xm, y: p0.y }), arrivee: angle(p3, { x: xm, y: p3.y }) },
    }
  }
  return {
    chemin: `M${f(p0.x)} ${f(p0.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p3.x)} ${f(p3.y)}`,
    pointe: pointeEn(p3, c2),
    pointeDepart: pointeEn(p0, c1),
    depart: p0,
    arrivee: p3,
    controles: [c1, c2],
    milieu,
    angles: { depart: angle(p0, c1), arrivee: angle(p3, c2) },
  }
}
