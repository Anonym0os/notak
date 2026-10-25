import type { ReactNode } from 'react'

/**
 * Les formes des diapositives du mode Pitch (relevé 11, chapitres 3 à 17) : accolade, puces, arêtes, chronologie,
 * filets, branches de l'arbre. Chaque forme rend un `<g>` SVG dans le repère (0, 0)–(l, h) que le gabarit lui donne ;
 * les gabarits ne dessinent jamais ces formes eux-mêmes, ils appellent celles qu'on leur passe. Un thème (lot des
 * thèmes) remplace celles qu'il veut ; les autres restent celles-ci, décrites par la géométrie du relevé et dessinées
 * ici sans rien reprendre de Xmind.
 */

export interface ProprietesForme {
  l: number
  h: number
  /** L'épaisseur du trait, px de base. */
  trait: number
  couleur: string
  /** Pour les thèmes à main levée : le même dessin d'une fois sur l'autre. */
  graine: number
}

export interface FormesDiapo {
  /** L'accolade de la liste : le bec à gauche, à `bec` px du haut, les bras vers la droite. */
  accolade: (p: ProprietesForme & { bec: number }) => ReactNode
  /** Le crochet du résumé : deux équerres qui se rejoignent au bec, la pointe vers la droite. */
  accoladeResume: (p: ProprietesForme & { bec: number }) => ReactNode
  puce: (p: ProprietesForme & { niveau: number }) => ReactNode
  /** Une arête oblique : `angle` en degrés depuis la verticale, positif vers le haut à droite, négatif vers le bas. */
  arete: (p: ProprietesForme & { angle: number }) => ReactNode
  /** L'épine centrale du poisson. */
  epine: (p: ProprietesForme) => ReactNode
  /** La ligne de la chronologie. */
  axe: (p: ProprietesForme) => ReactNode
  /** Un point de la chronologie. */
  point: (p: ProprietesForme) => ReactNode
  /** Le filet d'en-tête, et tout trait séparateur : le long du plus grand côté de sa boîte. */
  filet: (p: ProprietesForme) => ReactNode
  /** Une branche de l'arbre portrait : la ligne brisée de ses points, chaque angle arrondi. */
  branche: (p: ProprietesForme & { points: readonly [number, number][] }) => ReactNode
}

/** Le rapprochement d'un quart d'ellipse par une cubique. */
const K = 0.5523

const trace = (couleur: string, trait: number) => ({ fill: 'none', stroke: couleur, strokeWidth: trait, strokeLinecap: 'round', strokeLinejoin: 'round' }) as const

/** La largeur de la marge devant le bec, en part de la boîte de 10,6 vmin (2 vmin). */
const MARGE_BEC = 2 / 10.6

/**
 * L'accolade par défaut (relevé 11 § 3) : du bec, une courbe de 20 × 30 qui monte en s'arrondissant (horizontale au
 * bec, verticale à l'arrivée), un trait vertical jusqu'à 20 px du haut, une courbe de 20 × 20 qui finit horizontale,
 * un bras de 10 px ; la moitié basse en miroir. Trop basse pour le trait vertical : un trait de 50 px au bec.
 */
export function cheminAccolade(l: number, h: number, bec: number): string {
  const x0 = l * MARGE_BEC
  if (bec - 50 < 0 || h - bec - 50 < 0) return `M${x0} ${bec}H${x0 + 50}`
  const moitie = (sens: 1 | -1, bout: number) => {
    const y = (n: number) => bec - sens * n
    const fin = bout + sens * 20
    return (
      `M${x0} ${bec}` +
      `C${x0 + 20 * K} ${bec} ${x0 + 20} ${y(30 - 30 * K)} ${x0 + 20} ${y(30)}` +
      `L${x0 + 20} ${fin}` +
      `C${x0 + 20} ${fin - sens * 20 * K} ${x0 + 40 - 20 * K} ${bout} ${x0 + 40} ${bout}` +
      `H${x0 + 50}`
    )
  }
  return moitie(1, 0) + moitie(-1, h)
}

/** Le crochet du résumé (relevé 11 § 8) : du haut à gauche au milieu, vertical jusqu'au bec, puis vers la droite ; et le miroir. */
export function cheminCrochet(l: number, h: number, bec: number): string {
  const m = l / 2
  return `M0 0H${m}V${bec}H${l}M0 ${h}H${m}V${bec}`
}

/** Une ligne brisée dont chaque angle est arrondi d'un rayon égal à la moitié du plus court des deux segments. */
export function cheminArrondi(points: readonly [number, number][]): string {
  if (points.length === 0) return ''
  let d = `M${points[0]![0]} ${points[0]![1]}`
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!
    const suivant = points[i + 1]
    if (!suivant) {
      d += `L${x} ${y}`
      continue
    }
    const [px, py] = points[i - 1]!
    const [nx, ny] = suivant
    const avant = Math.hypot(x - px, y - py)
    const apres = Math.hypot(nx - x, ny - y)
    const r = Math.min(avant, apres / 2)
    const ax = x - ((x - px) / (avant || 1)) * r
    const ay = y - ((y - py) / (avant || 1)) * r
    const bx = x + ((nx - x) / (apres || 1)) * r
    const by = y + ((ny - y) / (apres || 1)) * r
    d += `L${ax} ${ay}Q${x} ${y} ${bx} ${by}`
  }
  return d
}

/**
 * La flèche des paroles (relevé 11 § 5), 46 × 36 : un triangle plein pointé vers la droite, sa base sur le bord gauche,
 * la pointe arrondie d'un rayon de 4. Elle n'est pas dans les formes d'un thème : elle se dessine toujours ainsi.
 */
export function flecheParDefaut({ l, h, couleur }: ProprietesForme): ReactNode {
  const r = 4
  const pointe = l * (1 - (2 * r) / h)
  const m = h / 2
  // Les deux côtés convergent vers la pointe ; une courbe passe autour d'elle.
  const d = `M0 0L${pointe} ${m - r}Q${l} ${m} ${pointe} ${m + r}L0 ${h}Z`
  return (
    <g>
      <path d={d} style={{ fill: couleur }} />
    </g>
  )
}

export const FORMES_PAR_DEFAUT: FormesDiapo = {
  accolade: ({ l, h, trait, couleur, bec }) => (
    <g>
      <path d={cheminAccolade(l, h, bec)} style={trace(couleur, trait)} />
    </g>
  ),
  accoladeResume: ({ l, h, trait, couleur, bec }) => (
    <g>
      <path d={cheminCrochet(l, h, bec)} style={{ ...trace(couleur, trait), strokeLinejoin: 'miter' }} />
    </g>
  ),
  // Un disque plein, sans contour, qui remplit sa boîte.
  puce: ({ l, h, couleur }) => (
    <g>
      <circle cx={l / 2} cy={h / 2} r={Math.min(l, h) / 2} style={{ fill: couleur }} />
    </g>
  ),
  arete: ({ l, h, trait, couleur, angle }) => (
    <g>
      <line x1={0} y1={angle >= 0 ? h : 0} x2={l} y2={angle >= 0 ? 0 : h} style={trace(couleur, trait)} />
    </g>
  ),
  epine: ({ l, h, trait, couleur }) => (
    <g>
      <line x1={trait / 2} y1={h / 2} x2={l - trait / 2} y2={h / 2} style={trace(couleur, trait)} />
    </g>
  ),
  axe: ({ l, h, trait, couleur }) => (
    <g>
      <line x1={trait / 2} y1={h / 2} x2={l - trait / 2} y2={h / 2} style={trace(couleur, trait)} />
    </g>
  ),
  point: ({ l, h, couleur }) => (
    <g>
      <circle cx={l / 2} cy={h / 2} r={Math.min(l, h) / 2} style={{ fill: couleur }} />
    </g>
  ),
  filet: ({ l, h, trait, couleur }) => (
    <g>
      {l >= h ? (
        <line x1={trait / 2} y1={h / 2} x2={Math.max(trait / 2, l - trait / 2)} y2={h / 2} style={trace(couleur, trait)} />
      ) : (
        <line x1={l / 2} y1={trait / 2} x2={l / 2} y2={Math.max(trait / 2, h - trait / 2)} style={trace(couleur, trait)} />
      )}
    </g>
  ),
  branche: ({ trait, couleur, points }) => (
    <g>
      <path d={cheminArrondi(points)} style={trace(couleur, trait)} />
    </g>
  ),
}

/** Les formes d'un thème : les siennes, complétées par celles par défaut. */
export const formesDe = (propres?: Partial<FormesDiapo>): FormesDiapo => (propres ? { ...FORMES_PAR_DEFAUT, ...propres } : FORMES_PAR_DEFAUT)
