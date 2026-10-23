/**
 * La géométrie des lignes, en unités de grille (UG). Pure : le rendu SVG et les gestes la lisent,
 * rien ici ne touche au DOM.
 *
 * Une ligne va d'un point à un autre. Accrochée à un élément, elle vise son centre et s'arrête sur son bord.
 * Une courbe est une Bézier quadratique qui PASSE par le point que donne `{ ecart, position }` (la poignée est sur
 * le trait, comme dans Milanote) : son vrai point de contrôle s'en déduit.
 */
import { type Point, type Rect, centre, contient, hauteur, largeur, point } from './geometrie'
import type { Ancre, Element, Extremite, Id, Ligne, Pointe, Tableau } from './tableau'

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

/** Le point que la poignée de courbe occupe, sur le trait, ou `null` si le trait est droit. */
export function pointCourbe(a: Point, b: Point, courbe?: Courbe): Point | null {
  if (!courbe) return null
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const long = Math.hypot(dx, dy)
  if (long < 1e-9) return null
  const base = point(a.x + dx * courbe.position, a.y + dy * courbe.position)
  const p = point(base.x - (dy / long) * courbe.ecart, base.y + (dx / long) * courbe.ecart)
  return distance(p, milieu(a, b)) < SEUIL_DROIT ? null : p
}

/**
 * Le point de contrôle de la quadratique d'une courbe sur la corde `a`→`b`, ou `null` si le trait est droit.
 * La courbe passe par `pointCourbe` au milieu de son parcours (t = 0,5) : `P = (a + 2c + b) / 4`.
 */
export function pointControle(a: Point, b: Point, courbe?: Courbe): Point | null {
  const p = pointCourbe(a, b, courbe)
  if (!p) return null
  const m = milieu(a, b)
  return point(2 * p.x - m.x, 2 * p.y - m.y)
}

/**
 * La courbe dont la poignée est en `p`, un point du trait, ou `undefined` (trait droit) si `p` est à moins de
 * `SEUIL_DROIT` du milieu de la corde. L'inverse de `pointCourbe`.
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

/**
 * Les trois sommets d'une pointe en flèche : la pointe sur `bout`, la base à `taille` en arrière. Le triangle est
 * aussi large que long (8 × 8, 10 × 10, 13 × 13 px), comme dans Milanote.
 */
export function sommetsFleche(bout: Point, vers: Point, taille: number): [Point, Point, Point] {
  const base = point(bout.x - vers.x * taille, bout.y - vers.y * taille)
  const demi = taille * 0.5
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

/** Maj pendant qu'on tire une extrémité : la ligne se cale à l'horizontale, à la verticale ou sur une diagonale. */
export function aimanterAngle(fixe: Point, p: Point): Point {
  const [dx, dy] = [p.x - fixe.x, p.y - fixe.y]
  const cran = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  if (cran % 4 === 0) return point(p.x, fixe.y)
  if (Math.abs(cran) === 2) return point(fixe.x, p.y)
  // Diagonale : on garde le plus long des deux écarts, avec le signe de chacun.
  const t = Math.max(Math.abs(dx), Math.abs(dy))
  return point(fixe.x + Math.sign(dx) * t, fixe.y + Math.sign(dy) * t)
}

/** La longueur la plus courte d'une ligne (UG) : de quoi loger ses flèches sans qu'elles se chevauchent. */
export function longueurMin(depart: Pointe, arrivee: Pointe): number {
  const fleches = Number(depart === 'fleche') + Number(arrivee === 'fleche')
  return fleches === 2 ? 1.5 : fleches === 1 ? 1 : 0.1
}

/** Repousse `p` loin de `fixe` jusqu'à la longueur `min` (UG), dans la même direction (à droite si confondus). */
export function auMoins(fixe: Point, p: Point, min: number): Point {
  const d = Math.hypot(p.x - fixe.x, p.y - fixe.y)
  if (d >= min) return p
  if (d === 0) return point(fixe.x + min, fixe.y)
  return point(fixe.x + ((p.x - fixe.x) / d) * min, fixe.y + ((p.y - fixe.y) / d) * min)
}

/** À la pose d'un bout libre, la ligne fait au moins cette longueur (UG) : plus courte, le bout est repoussé. */
export const LONGUEUR_POSE = 4

/** Un bout libre se pose où est le curseur, au centième d'UG : aucun aimant de grille. */
export const poserExact = (p: Point): Point => point(arrondi(p.x), arrondi(p.y))

/** Dans cet écart (px) et sous cette pente, un trait presque droit se cale à l'horizontale ou à la verticale. */
const ECART_AIMANT_PX = 10
const PENTE_AIMANT = 1 / 30

/**
 * Sans Maj, quand rien d'autre ne tient le bout : un trait à peine penché (écart sous 10 px et pente sous 1/30)
 * se cale à l'horizontale, ou à la verticale.
 */
export function aimanterAuto(fixe: Point, p: Point, pxParUg: number): Point {
  const [dx, dy] = [Math.abs(p.x - fixe.x), Math.abs(p.y - fixe.y)]
  if (dy * pxParUg < ECART_AIMANT_PX && dy < dx * PENTE_AIMANT) return point(p.x, fixe.y)
  if (dx * pxParUg < ECART_AIMANT_PX && dx < dy * PENTE_AIMANT) return point(fixe.x, p.y)
  return p
}

/** Le rectangle élargi de `d` de chaque côté : le trait s'arrête 1 px avant le bord de l'élément. */
export const elargir = (r: Rect, d: number): Rect => ({ min: point(r.min.x - d, r.min.y - d), max: point(r.max.x + d, r.max.y + d) })

// ———— Accroche à un point précis ————

/** Le point du tableau que désigne une ancre sur ce rectangle. */
export const pointAncre = (r: Rect, a: Ancre): Point =>
  point(r.min.x + largeur(r) * a.x, r.min.y + hauteur(r) * a.y)

/** À moins de cette distance (UG), le point se colle au bord, puis à un coin, au milieu d'un bord ou au centre. */
export const PRES_ANCRE = 1

/** Les neuf repères d'un élément : coins, milieux des bords, centre. */
const REPERES = [0, 0.5, 1].flatMap((y) => [0, 0.5, 1].map((x) => ({ x, y })))

/**
 * L'ancre que vise `p` sur ce rectangle : bornée à l'élément, collée au bord tout proche, puis à un repère
 * tout proche. `null` pour le centre lui-même : la ligne vise alors le centre, comme d'habitude.
 */
export function ancreSous(r: Rect, p: Point, pres = PRES_ANCRE): Ancre | null {
  const [l, h] = [largeur(r), hauteur(r)]
  if (l < 1e-9 || h < 1e-9) return null
  let x = Math.max(r.min.x, Math.min(r.max.x, p.x))
  let y = Math.max(r.min.y, Math.min(r.max.y, p.y))
  if (x - r.min.x < pres) x = r.min.x
  else if (r.max.x - x < pres) x = r.max.x
  if (y - r.min.y < pres) y = r.min.y
  else if (r.max.y - y < pres) y = r.max.y
  for (const rep of REPERES) {
    const q = pointAncre(r, rep)
    if (distance(q, point(x, y)) < pres * 1.5) [x, y] = [q.x, q.y]
  }
  const ancre = { x: arrondi((x - r.min.x) / l), y: arrondi((y - r.min.y) / h) }
  return ancre.x === 0.5 && ancre.y === 0.5 ? null : ancre
}

// ———— Deux colonnes côte à côte ————

/** Deux colonnes dont les hauts sont à moins de cet écart (UG) se relient d'un trait horizontal. */
export const ECART_COLONNES_ALIGNEES = 3
/** La hauteur du trait entre deux colonnes alignées, sous le plus bas des deux hauts (UG). */
export const MILIEU_TITRE_COLONNE = 3.2

/**
 * Une ligne entre deux colonnes à peu près alignées : les deux bouts visent la hauteur des titres, sous le plus
 * bas des deux hauts, et le trait est horizontal. `null` si elles ne sont pas alignées.
 */
export function aligneesEnColonnes(a: Point, b: Point, rectA: Rect, rectB: Rect): { a: Point; b: Point } | null {
  if (Math.abs(rectA.min.y - rectB.min.y) >= ECART_COLONNES_ALIGNEES) return null
  const y = Math.max(rectA.min.y, rectB.min.y) + MILIEU_TITRE_COLONNE
  return { a: point(a.x, y), b: point(b.x, y) }
}

// ———— Ce que vise une ligne ————

/**
 * Où s'accroche un bout lâché en `p` sur un élément : au point précis si `p` est sur son bord (coins et milieux
 * des bords collent), sinon `null` et la ligne vise le centre, comme d'habitude. Lâcher dans la carte ne choisit
 * donc jamais un point au hasard.
 */
export function ancreDeposee(r: Rect, p: Point, pres = PRES_ANCRE): Ancre | null {
  const a = ancreSous(r, p, pres)
  return a && (a.x === 0 || a.x === 1 || a.y === 0 || a.y === 1) ? a : null
}

/** Les huit repères d'accroche du « mode dedans » : coins et milieux des côtés (jamais le centre). */
export const GUIDES = REPERES.filter((r) => !(r.x === 0.5 && r.y === 0.5))

/** Le repère à moins de `PRES_GUIDE` (UG) de `p` sur ce rectangle, ou `null`. */
export const PRES_GUIDE = 1
export function guideSous(r: Rect, p: Point): Ancre | null {
  for (const g of GUIDES) if (distance(pointAncre(r, g), p) < PRES_GUIDE) return g
  return null
}

/**
 * Le point précis d'un bout tenu immobile sur un élément (« mode dedans ») : le repère tout proche, sinon le point
 * lui-même, rapporté au bord ou au milieu à une demi-UG près. `null` pour le centre exact. Toujours dans l'élément.
 */
export function ancreDedans(r: Rect, p: Point): Ancre | null {
  const guide = guideSous(r, p)
  if (guide) return guide
  const [l, h] = [largeur(r), hauteur(r)]
  if (l < 1e-9 || h < 1e-9) return null
  const caler = (v: number, min: number, taille: number) => {
    const f = Math.max(0, Math.min(1, (v - min) / taille))
    for (const k of [0, 0.5, 1]) if (Math.abs(f * taille - k * taille) < 0.5) return k
    return arrondi(f)
  }
  const ancre = { x: caler(p.x, r.min.x, l), y: caler(p.y, r.min.y, h) }
  return ancre.x === 0.5 && ancre.y === 0.5 ? null : ancre
}

/** Ce que vise une ligne : ses deux points, et pour chacun le rectangle où le trait s'arrête, s'il y en a un. */
export interface Visee {
  a: Point
  b: Point
  rectA: Rect | null
  rectB: Rect | null
}

/**
 * Les points que la ligne relie, à partir de ses extrémités et des rectangles des éléments accrochés.
 * Un bout accroché vise le centre de l'élément et s'arrête sur son bord ; avec une ancre, il vise ce point
 * et s'y arrête. `entreColonnes` : les deux bouts sont des colonnes, que le trait relie à la hauteur de leurs
 * titres quand elles sont alignées. `null` s'il manque le rectangle d'un élément accroché.
 */
export function viser(
  depart: Extremite,
  arrivee: Extremite,
  rects: { depart: Rect | null; arrivee: Rect | null },
  entreColonnes = false,
): Visee | null {
  const bout = (x: Extremite, r: Rect | null) => {
    if (!('element' in x)) return { p: point(x.x, x.y), rect: null }
    if (!r) return null
    return x.ancre ? { p: pointAncre(r, x.ancre), rect: null } : { p: centre(r), rect: r }
  }
  const [d, a] = [bout(depart, rects.depart), bout(arrivee, rects.arrivee)]
  if (!d || !a) return null
  const droit = entreColonnes && d.rect && a.rect ? aligneesEnColonnes(d.p, a.p, d.rect, a.rect) : null
  return { a: droit?.a ?? d.p, b: droit?.b ?? a.p, rectA: d.rect, rectB: a.rect }
}
