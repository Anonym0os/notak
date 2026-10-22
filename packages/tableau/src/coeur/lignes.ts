/**
 * La géométrie des lignes, en unités de grille (UG). Pure : le rendu SVG et les gestes la lisent,
 * rien ici ne touche au DOM.
 *
 * Une ligne va d'un point à un autre. Accrochée à un élément, elle vise son centre et s'arrête sur son bord.
 * Une courbe est une Bézier quadratique dont le point de contrôle vient de `{ ecart, position }`.
 */
import { type Point, type Rect, contient, point } from './geometrie'
import type { Element, Id, Ligne, Tableau } from './tableau'

export type Courbe = NonNullable<Ligne['courbe']>

/** En deçà de cet écart au milieu de la corde, le point de contrôle ne compte plus : le trait est droit. */
export const SEUIL_DROIT = 2

/** Une Bézier quadratique : départ, point de contrôle, arrivée. Droite quand `c` est au milieu de `a` et `b`. */
export interface Quadratique {
  a: Point
  c: Point
  b: Point
}

const distance = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y)
const milieu = (p: Point, q: Point) => point((p.x + q.x) / 2, (p.y + q.y) / 2)
const arrondi = (v: number) => Math.round(v * 100) / 100

/** Le point de contrôle d'une courbe sur la corde `a`→`b`, ou `null` si le trait est droit. */
export function pointControle(a: Point, b: Point, courbe?: Courbe): Point | null {
  if (!courbe) return null
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const long = Math.hypot(dx, dy)
  if (long < 1e-9) return null
  const base = point(a.x + dx * courbe.position, a.y + dy * courbe.position)
  const c = point(base.x - (dy / long) * courbe.ecart, base.y + (dx / long) * courbe.ecart)
  return distance(c, milieu(a, b)) < SEUIL_DROIT ? null : c
}

/**
 * La courbe qui a son point de contrôle en `p`, ou `undefined` (trait droit) si `p` est à moins de
 * `SEUIL_DROIT` du milieu de la corde. L'inverse de `pointControle`.
 */
export function courbeDepuisPoint(a: Point, b: Point, p: Point): Courbe | undefined {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const long = Math.hypot(dx, dy)
  if (long < 1e-9 || distance(p, milieu(a, b)) < SEUIL_DROIT) return undefined
  const [px, py] = [p.x - a.x, p.y - a.y]
  const position = Math.max(0, Math.min(1, (px * dx + py * dy) / (long * long)))
  const ecart = (-px * dy + py * dx) / long
  return { ecart: arrondi(ecart), position: arrondi(position) }
}

export function evaluer(q: Quadratique, t: number): Point {
  const u = 1 - t
  return point(u * u * q.a.x + 2 * u * t * q.c.x + t * t * q.b.x, u * u * q.a.y + 2 * u * t * q.c.y + t * t * q.b.y)
}

/** La tangente (non normée) de la courbe en `t`. */
function derivee(q: Quadratique, t: number): Point {
  return point(
    2 * ((1 - t) * (q.c.x - q.a.x) + t * (q.b.x - q.c.x)),
    2 * ((1 - t) * (q.c.y - q.a.y) + t * (q.b.y - q.c.y)),
  )
}

/** Le morceau de `t0` à `t1`, qui est lui aussi une Bézier quadratique. */
export function decouper(q: Quadratique, t0: number, t1: number): Quadratique {
  const [a, b] = [evaluer(q, t0), evaluer(q, t1)]
  const d = derivee(q, t0)
  const k = (t1 - t0) / 2
  return { a, c: point(a.x + d.x * k, a.y + d.y * k), b }
}

const inverser = (q: Quadratique): Quadratique => ({ a: q.b, c: q.c, b: q.a })

/** Le plus petit `t` où la courbe n'est plus « dedans » (par échantillons, puis dichotomie), ou `null` si elle y reste. */
function premierHors(q: Quadratique, dedans: (p: Point) => boolean): number | null {
  const pas = 64
  for (let i = 0; i <= pas; i++) {
    if (dedans(evaluer(q, i / pas))) continue
    if (i === 0) return 0
    let [bas, haut] = [(i - 1) / pas, i / pas]
    for (let k = 0; k < 24; k++) {
      const m = (bas + haut) / 2
      if (dedans(evaluer(q, m))) bas = m
      else haut = m
    }
    return haut
  }
  return null
}

/** La quadratique d'une ligne : droite (contrôle au milieu) sans courbe, ou si elle est ramenée au droit. */
export function quadratique(a: Point, b: Point, courbe?: Courbe): Quadratique {
  return { a, c: pointControle(a, b, courbe) ?? milieu(a, b), b }
}

export interface EntreeTrace {
  /** Les points visés : un centre d'élément, ou un point libre. */
  a: Point
  b: Point
  /** Le rectangle de l'élément accroché à ce bout, s'il y en a un : le trait s'y arrête. */
  rectA?: Rect | null
  rectB?: Rect | null
  courbe?: Courbe
  /** De combien raccourcir chaque bout, en UG, pour laisser la place à sa pointe. */
  reculA?: number
  reculB?: number
}

export interface Trace {
  /** Le trait à dessiner, pointes déduites. */
  chemin: Quadratique
  droit: boolean
  /** Où le trait touche vraiment le bord (la pointe s'y pose). */
  debut: Point
  fin: Point
  /** Les directions unitaires, vers l'extérieur du trait, à chaque bout. */
  versDebut: Point
  versFin: Point
  /** Le milieu du trait visible. */
  milieu: Point
}

function unitaire(v: Point, repli: Point): Point {
  const l = Math.hypot(v.x, v.y)
  return l < 1e-9 ? repli : point(v.x / l, v.y / l)
}

/**
 * Ce qui se voit d'une ligne : la courbe entre les centres, coupée là où elle sort des rectangles accrochés.
 * `null` si rien ne dépasse (deux éléments qui se chevauchent).
 */
export function tracer(e: EntreeTrace): Trace | null {
  const q = quadratique(e.a, e.b, e.courbe)
  const t0 = e.rectA ? premierHors(q, (p) => contient(e.rectA!, p)) : 0
  const sortie = e.rectB ? premierHors(inverser(q), (p) => contient(e.rectB!, p)) : 0
  if (t0 === null || sortie === null) return null
  const t1 = 1 - sortie
  if (t1 - t0 < 1e-6) return null
  const visible = decouper(q, t0, t1)
  const corde = point(e.b.x - e.a.x, e.b.y - e.a.y)
  const versFin = unitaire(point(visible.b.x - visible.c.x, visible.b.y - visible.c.y), unitaire(corde, point(1, 0)))
  const versDebut = unitaire(point(visible.a.x - visible.c.x, visible.a.y - visible.c.y), point(-versFin.x, -versFin.y))

  // La place des pointes : on raccourcit seulement si le trait reste plus long que ce qu'on retire.
  let [u0, u1] = [0, 1]
  if (e.reculA) u0 = premierHors(visible, (p) => distance(p, visible.a) < e.reculA!) ?? 0
  if (e.reculB) u1 = 1 - (premierHors(inverser(visible), (p) => distance(p, visible.b) < e.reculB!) ?? 0)
  if (u1 - u0 < 1e-6) [u0, u1] = [0, 1]
  const chemin = u0 === 0 && u1 === 1 ? visible : decouper(visible, u0, u1)

  return {
    chemin,
    droit: pointControle(e.a, e.b, e.courbe) === null,
    debut: visible.a,
    fin: visible.b,
    versDebut,
    versFin,
    milieu: evaluer(visible, 0.5),
  }
}

/** Les trois sommets d'une pointe en flèche : la pointe sur `bout`, la base à `taille` en arrière. */
export function sommetsFleche(bout: Point, vers: Point, taille: number): [Point, Point, Point] {
  const base = point(bout.x - vers.x * taille, bout.y - vers.y * taille)
  const demi = taille * 0.45
  return [
    bout,
    point(base.x - vers.y * demi, base.y + vers.x * demi),
    point(base.x + vers.y * demi, base.y - vers.x * demi),
  ]
}

/** Taille d'une pointe selon l'épaisseur du trait, en pixels. */
export const TAILLE_POINTE: Record<Ligne['epaisseur'], number> = { 1: 8, 2: 10, 4: 13 }

/** Les éléments auxquels une ligne est accrochée. */
export function accroches(l: Ligne): Id[] {
  return [l.depart, l.arrivee].flatMap((x) => ('element' in x ? [x.element] : []))
}

/**
 * Cmd+K : relie des éléments par un arbre couvrant minimal sur la distance entre les centres (Kruskal).
 * Les liaisons existantes comptent déjà comme reliées : on ne les double pas, et on ne crée jamais
 * plus de n−1 lignes.
 */
export function relier(items: { id: Id; centre: Point }[], existantes: readonly (readonly [Id, Id])[] = []): [Id, Id][] {
  const parent = items.map((_, i) => i)
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i]!)))
  const joindre = (i: number, j: number) => {
    const [ri, rj] = [racine(i), racine(j)]
    if (ri === rj) return false
    parent[ri] = rj
    return true
  }
  const rang = new Map(items.map((x, i) => [x.id, i]))
  for (const [p, q] of existantes) {
    const [i, j] = [rang.get(p), rang.get(q)]
    if (i !== undefined && j !== undefined) joindre(i, j)
  }
  const aretes: { i: number; j: number; d: number }[] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) aretes.push({ i, j, d: distance(items[i]!.centre, items[j]!.centre) })
  }
  aretes.sort((x, y) => x.d - y.d || x.i - y.i || x.j - y.j)
  const nouvelles: [Id, Id][] = []
  for (const { i, j } of aretes) if (joindre(i, j)) nouvelles.push([items[i]!.id, items[j]!.id])
  return nouvelles
}

/** Les lignes à emporter quand ces éléments sont supprimés : celles qui s'y accrochent, hors celles déjà supprimées. */
export function lignesASupprimer(supprimes: Element[], tableau: Tableau): Element[] {
  const ids = new Set(supprimes.map((e) => e.id))
  return tableau.elements.filter(
    (e) => e.contenu.type === 'ligne' && !ids.has(e.id) && accroches(e.contenu).some((id) => ids.has(id)),
  )
}
