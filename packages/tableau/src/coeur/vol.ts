import type { Point } from './geometrie'

/**
 * Ce qu'on glisse « vole » : il suit le pointeur avec un léger retard, s'incline dans le sens du mouvement et
 * se soulève (son ombre grandit), puis se repose. Positions en pixels, rotations en degrés, ombre de 0 à 1.
 */
export interface Vol {
  x: number
  y: number
  /** Rotation autour de l'axe horizontal (suit le mouvement vertical) et de l'axe vertical. */
  rx: number
  ry: number
  ombre: number
}

export const VOL_REPOS: Vol = { x: 0, y: 0, rx: 0, ry: 0, ombre: 0 }

/** La durée d'une image ordinaire : les pas sont ramenés à elle quand une image tarde. */
export const IMAGE_MS = 1000 / 60

/** Part de l'écart rattrapée à chaque image : moins quand l'élément s'incline, le mouvement en est plus doux. */
const SUIVI = 0.6
const SUIVI_INCLINE = 0.5
/** Part de l'écart d'inclinaison rattrapée à chaque image. */
const AMORTI = 0.2
const INCLINAISON_MAX = 25
/** L'ombre atteint son plein quand l'élément s'est éloigné de tant de pixels de son départ. */
const OMBRE_DISTANCE = 50
const OMBRE_MONTE = 0.05
const OMBRE_DESCEND = 0.1

/** L'inclinaison permise : moindre pour un grand élément, nulle au-delà de 1 000 px environ. */
export function inclinaisonMax(plusGrandCote: number): number {
  if (plusGrandCote <= 0) return INCLINAISON_MAX
  const r = 110 / plusGrandCote
  return r >= 1 ? INCLINAISON_MAX : Math.min(INCLINAISON_MAX, (Math.asin(r) * 180) / Math.PI)
}

export interface Reglage {
  incliner: boolean
  /** En degrés, d'après `inclinaisonMax`. */
  max: number
  /** Au doigt, l'élément reste sous le doigt au lieu de le suivre avec du retard : il ne garde que son inclinaison. */
  colle?: boolean
}

function suivre(v: Vol, cible: Point, dt: number, r: Reglage): { x: number; y: number; dx: number; dy: number } {
  const part = r.colle ? 1 : Math.min(((r.incliner ? SUIVI_INCLINE : SUIVI) * dt) / IMAGE_MS, 1)
  const dx = (cible.x - v.x) * part
  const dy = (cible.y - v.y) * part
  return { x: v.x + dx, y: v.y + dy, dx, dy }
}

function incliner(v: Vol, dx: number, dy: number, r: Reglage): { rx: number; ry: number } {
  if (!r.incliner) return { rx: 0, ry: 0 }
  let [tx, ty] = [-dy * (r.max / 10), dx * (r.max / 10)]
  // Les deux rotations ensemble ne dépassent pas le maximum, sinon la diagonale paraît tordue.
  const n = Math.hypot(tx, ty)
  if (n > r.max) [tx, ty] = [(tx / n) * r.max, (ty / n) * r.max]
  return { rx: v.rx + (tx - v.rx) * AMORTI, ry: v.ry + (ty - v.ry) * AMORTI }
}

/** Une image pendant le glisser : vers la cible, l'ombre montant avec la distance parcourue depuis le départ. */
export function pasEnVol(v: Vol, cible: Point, parcouru: number, dt: number, r: Reglage): Vol {
  const p = suivre(v, cible, dt, r)
  const voulue = v.ombre >= 1 ? 1 : Math.max(v.ombre, parcouru / OMBRE_DISTANCE)
  return { x: p.x, y: p.y, ...incliner(v, p.dx, p.dy, r), ombre: Math.min(v.ombre + OMBRE_MONTE, 1, voulue) }
}

/** Une image de la dépose : vers la place définitive, l'élément se redresse et son ombre s'éteint. */
export function pasDePose(v: Vol, cible: Point, dt: number, r: Reglage): { vol: Vol; fini: boolean } {
  const p = suivre(v, cible, dt, r)
  const rot = incliner(v, p.dx, p.dy, r)
  const ombre = Math.max(v.ombre - OMBRE_DESCEND, 0)
  const fini =
    Math.abs(rot.rx) <= 0.5 && Math.abs(rot.ry) <= 0.5 && Math.abs(cible.x - p.x) <= 1 && Math.abs(cible.y - p.y) <= 1 && ombre < 0.1
  return { vol: fini ? { ...cible, rx: 0, ry: 0, ombre: 0 } : { x: p.x, y: p.y, ...rot, ombre }, fini }
}

/** La transformation CSS d'un vol, décalée de `base` (la place où l'élément est déjà posé). */
export function transformation(v: Vol, base: Point = { x: 0, y: 0 }): string {
  const t = `translate(${v.x - base.x}px, ${v.y - base.y}px)`
  return v.rx || v.ry ? `${t} perspective(2000px) rotateX(${v.rx}deg) rotateY(${v.ry}deg)` : t
}
