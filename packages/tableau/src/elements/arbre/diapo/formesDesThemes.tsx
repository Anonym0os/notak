import type { ReactNode } from 'react'
import rough from 'roughjs'
import { type FormesDiapo, type ProprietesForme, cheminCrochet } from './formes'

/**
 * Les formes propres à chaque thème du mode Pitch (relevé 12, § « Géométrie » de chaque thème), par-dessus celles par
 * défaut (`formes.tsx`). Chaque fonction rend un `<g>` dans le repère (0,0)–(l,h) de sa boîte. Les dessins sont les
 * nôtres, refaits d'après la description : pinceau (innocence), équerres (shape-for-you), soulignement et hexagones
 * (midnight-rose), parenthèse en arc (hubble-bubble), traits à main levée (hand-drawn, par rough.js).
 */

type Point = readonly [number, number]

const arrondi = (n: number) => Math.round(n * 100) / 100

/** Un point d'une courbe de Bézier cubique. */
function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]
}

/**
 * Une traînée de pinceau : la ligne médiane `points`, épaissie de `largeur(t)` de chaque côté de sa normale, rendue
 * comme une surface fermée. Pure : le même appel donne le même tracé.
 */
export function trainee(points: readonly Point[], largeur: (t: number) => number): string {
  const n = points.length
  const gauche: Point[] = []
  const droite: Point[] = []
  for (let i = 0; i < n; i++) {
    const avant = points[Math.max(0, i - 1)]!
    const apres = points[Math.min(n - 1, i + 1)]!
    const dx = apres[0] - avant[0]
    const dy = apres[1] - avant[1]
    const lg = Math.hypot(dx, dy) || 1
    const w = largeur(n === 1 ? 0 : i / (n - 1)) / 2
    const [x, y] = points[i]!
    gauche.push([x - (dy / lg) * w, y + (dx / lg) * w])
    droite.push([x + (dy / lg) * w, y - (dx / lg) * w])
  }
  const tour = [...gauche, ...droite.reverse()]
  return `M${tour.map(([x, y]) => `${arrondi(x)} ${arrondi(y)}`).join('L')}Z`
}

/** Les points d'une Bézier cubique, en `pas` segments. */
const echantillons = (p0: Point, p1: Point, p2: Point, p3: Point, pas = 24): Point[] => Array.from({ length: pas + 1 }, (_, i) => bezier(p0, p1, p2, p3, i / pas))

const vide = (): ReactNode => <g />

/** Une graine utilisable par rough.js, qui tire au hasard sur 0 : toujours un entier strictement positif. */
const graineRough = (base: number, graine: number) => base + Math.abs(Math.floor(graine)) + 1

const generateur = rough.generator()

/** Un tracé à main levée : rough.js redessine `d` avec sa rugosité ; la graine rend le tracé déterministe. */
function main(d: string, couleur: string, trait: number, rugosite: number, graine: number): ReactNode {
  const dessin = generateur.path(d, { stroke: couleur, strokeWidth: trait, roughness: rugosite, seed: graine, bowing: 1 })
  return (
    <g data-rough="">
      {generateur.toPaths(dessin).map((p, i) => (
        <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? 'none'} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </g>
  )
}

// ——— innocence ———

/**
 * L'accolade d'innocence : deux demi-accolades galbées en coup de pinceau, épaisses au milieu et effilées aux bouts,
 * la seconde décalée de 13/640 de la hauteur. Trait 21.
 */
function accoladePinceau({ l, h, couleur, bec }: ProprietesForme & { bec: number }): ReactNode {
  const trait = 21
  const decalage = (h * 13) / 640
  const epaisseur = (t: number) => trait * (0.2 + 0.8 * Math.sin(Math.PI * t))
  const haut = trainee(echantillons([0, bec], [l * 0.6, bec], [l * 0.4, 0], [l, trait / 4]), epaisseur)
  const bas = trainee(echantillons([0, bec + decalage], [l * 0.6, bec + decalage], [l * 0.4, h], [l, h - trait / 4]), epaisseur)
  return (
    <g data-forme="accolade-pinceau" fill={couleur}>
      <path d={haut} />
      <path d={bas} />
    </g>
  )
}

export const FORMES_INNOCENCE: Partial<FormesDiapo> = { accolade: accoladePinceau }

// ——— shape-for-you ———

/** Les équerres de shape-for-you : du bec, un trait horizontal jusqu'au bord droit, qui y monte et y descend. Trait 6. */
function accoladeEquerre({ l, h, couleur, bec }: ProprietesForme & { bec: number }): ReactNode {
  const t = 6
  return (
    <g data-forme="accolade-equerre" fill="none" stroke={couleur} strokeWidth={t} strokeLinecap="square" strokeLinejoin="miter">
      <path d={`M0 ${bec}H${l - t / 2}V${t / 2}`} />
      <path d={`M0 ${bec}H${l - t / 2}V${h - t / 2}`} />
    </g>
  )
}

/** L'arête d'arbre de shape-for-you : une simple verticale, sans coude ni ergot, bout carré. */
function brancheDroite({ couleur, trait, points }: ProprietesForme & { points: readonly [number, number][] }): ReactNode {
  if (points.length === 0) return <g />
  const x = points[0]![0]
  const ys = points.map((p) => p[1])
  return (
    <g data-forme="branche-droite">
      <line x1={x} y1={Math.min(...ys)} x2={x} y2={Math.max(...ys)} stroke={couleur} strokeWidth={trait} strokeLinecap="square" />
    </g>
  )
}

export const FORMES_SHAPE: Partial<FormesDiapo> = { accolade: accoladeEquerre, branche: brancheDroite }

// ——— midnight-rose ———

/** Un hexagone pointe en haut, inscrit dans la boîte. */
const hexagoneDebout = (x: number, y: number, l: number, h: number): string =>
  `M${x + l / 2} ${y}L${x + l} ${y + h / 4}L${x + l} ${y + (3 * h) / 4}L${x + l / 2} ${y + h}L${x} ${y + (3 * h) / 4}L${x} ${y + h / 4}Z`

/** La puce de midnight-rose : un hexagone bleu nuit percé d'un petit hexagone du bleu du fond (35 × 40). */
function puceHexagone({ l, h }: ProprietesForme & { niveau: number }): ReactNode {
  const k = Math.min(l / 35, h / 40)
  const L = 35 * k
  const H = 40 * k
  const x = (l - L) / 2
  const y = (h - H) / 2
  return (
    <g data-forme="puce-hexagone">
      <path d={hexagoneDebout(x, y, L, H)} fill="#0C1548" />
      <path d={hexagoneDebout(x + L * 0.32, y + H * 0.32, L * 0.36, H * 0.36)} fill="#2C47D8" />
    </g>
  )
}

/** Midnight-rose n'a ni accolade (un soulignement de 2 px sous chaque sous-sujet la remplace) ni arête d'arbre. */
export const FORMES_MINUIT: Partial<FormesDiapo> = { accolade: vide, branche: vide, puce: puceHexagone }

// ——— hubble-bubble ———

/**
 * La parenthèse de hubble-bubble : un trait horizontal du bec jusqu'à mi-largeur, puis un arc elliptique (rayons
 * demi-largeur × demi-hauteur) qui rejoint le bord droit en haut et en bas. Trait 6.
 */
function accoladeArc({ l, h, couleur, bec }: ProprietesForme & { bec: number }): ReactNode {
  const t = 6
  const rx = l / 2
  const ry = h / 2 - t / 2
  const milieu = h / 2
  return (
    <g data-forme="accolade-arc" fill="none" stroke={couleur} strokeWidth={t} strokeLinecap="round">
      <path d={`M0 ${bec}H${rx}`} />
      <path d={`M${l} ${t / 2}A${rx} ${ry} 0 0 0 ${rx} ${milieu}A${rx} ${ry} 0 0 0 ${l} ${h - t / 2}`} />
    </g>
  )
}

/** La puce de hubble-bubble : un disque vert tendre cerclé de jaune citron sur 6 px. */
function puceCerclee({ l, h }: ProprietesForme & { niveau: number }): ReactNode {
  const r = Math.max(0, Math.min(l, h) / 2 - 3)
  return (
    <g data-forme="puce-cerclee">
      <circle cx={l / 2} cy={h / 2} r={r} fill="#BADD96" stroke="#FDFF8C" strokeWidth={6} />
    </g>
  )
}

export const FORMES_BULLES: Partial<FormesDiapo> = { accolade: accoladeArc, puce: puceCerclee }

// ——— hand-drawn ———

/** Quatre pâtés d'encre dans une boîte de 20 × 20, pris tour à tour. */
export const TACHES_D_ENCRE = [
  'M10 1.5C15 1 19 5 18.5 10C18 15.5 14 19 9 18.5C4 18 1 14 1.5 9C2 4.5 5.5 2 10 1.5Z',
  'M9 1C14 .5 19.5 4 19 10.5C18.5 16 13 19.5 8 18.5C3.5 17.5 .5 13 1.5 8C2.5 3.5 5 1.3 9 1Z',
  'M11 2C16 2.5 19 6.5 18 11.5C17 16.5 12 19 7.5 17.5C3 16 1 11 2.5 6.5C4 3 7.5 1.5 11 2Z',
  'M10.5 1C14.5 2 18.5 4 18.5 9C18.5 14 16 18.5 10 19C5 19.5 1.5 16 1 11C.5 6 5 0 10.5 1Z',
] as const

const tache = (l: number, h: number, couleur: string, graine: number, agrandi = 1): ReactNode => {
  const c = Math.min(l, h) * agrandi
  const d = TACHES_D_ENCRE[Math.abs(Math.floor(graine)) % 4]!
  return <path d={d} fill={couleur} transform={`translate(${arrondi((l - c) / 2)} ${arrondi((h - c) / 2)}) scale(${arrondi(c / 20)})`} />
}

/** La demi-accolade en baïonnette : du bec, un coude, la montée, puis le crochet vers la droite. */
function accoladeMain({ l, h, couleur, trait, graine, bec }: ProprietesForme & { bec: number }): ReactNode {
  const x = l * 0.35
  const haut = `M0 ${bec}L${x} ${bec - h * 0.04}L${x} ${h * 0.06}L${l} 0`
  const bas = `M0 ${bec}L${x} ${bec + h * 0.04}L${x} ${h * 0.94}L${l} ${h}`
  return (
    <g data-forme="accolade-main">
      {main(haut, couleur, trait, 1.5, graineRough(6, graine))}
      {main(bas, couleur, trait, 1.5, graineRough(6, graine + 1))}
    </g>
  )
}

/** Les traits droits de hand-drawn (épine du poisson 15, axe de chronologie 15, filet d'en-tête) au milieu de la boîte. */
const traitMain =
  (epaisseur: number | null, rugosite: number, base: number) =>
  ({ l, h, couleur, trait, graine }: ProprietesForme): ReactNode =>
    main(`M0 ${h / 2}L${l} ${h / 2}`, couleur, epaisseur ?? trait, rugosite, graineRough(base, graine))

export const FORMES_CARNET: Partial<FormesDiapo> = {
  accolade: accoladeMain,
  accoladeResume: ({ l, h, couleur, trait, graine, bec }) => <g data-forme="crochet-main">{main(cheminCrochet(l, h, bec), couleur, trait, 1.5, graineRough(6, graine))}</g>,
  arete: ({ l, h, couleur, trait, graine, angle }) => <g data-forme="arete-main">{main(angle >= 0 ? `M0 ${h}L${l} 0` : `M0 0L${l} ${h}`, couleur, trait, 1, graineRough(0, graine))}</g>,
  puce: ({ l, h, couleur, graine }) => <g data-forme="puce-tache">{tache(l, h, couleur, graine)}</g>,
  point: ({ l, h, couleur, graine }) => <g data-forme="point-tache">{tache(l, h, couleur, graine, 1.5)}</g>,
  epine: traitMain(15, 1, 0),
  axe: traitMain(15, 1, 0),
  filet: traitMain(null, 3, 2),
  branche: ({ couleur, trait, graine, points }) =>
    points.length < 2 ? <g /> : <g data-forme="branche-main">{main(`M${points.map(([x, y]) => `${x} ${y}`).join('L')}`, couleur, trait, 1, graineRough(0, graine))}</g>,
}
