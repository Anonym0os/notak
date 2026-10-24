import '@fontsource/tenor-sans'
import '@fontsource/audiowide'
import '@fontsource/modak'
import '@fontsource-variable/signika'
import '@fontsource-variable/nunito'
import '@fontsource/kalam'
import '@fontsource/kalam/700.css'
import './themes.css'
import { type ReactNode, useId } from 'react'
import { TAILLES_DE_BASE } from '../modele/dimensions'
import type { Gabarit, Niveau } from '../modele/gabarits'
import { type RatioPitch, type ThemePitch, themePitchDe } from '../themesPitch'

/**
 * Le décor des diapositives du mode Pitch (relevé 12, § « Décor » de chaque thème) : des formes vectorielles posées en %
 * de la diapositive, tournées et mises à l'échelle autour de leur centre, sous le texte. Elles changent selon le ratio,
 * le niveau du sujet et le gabarit ; ailleurs que sur le sujet central, le jeu affiché suit la branche principale,
 * après un mélange tiré une fois par présentation (la `graine`). Les dessins sont les nôtres.
 *
 * Tout se calcule dans l'espace de base de la diapositive (1600 × 900, 1200 × 900, 900 × 1600, 900 × 1200) ; le SVG
 * s'étire ensuite sur la couche. Rien n'est animé ici : `ANIMATIONS_DE_DECOR` décrit ce que joueront les transitions.
 */

/** Le niveau d'une diapositive pour le décor : celui de son sujet, ou l'épilogue (la diapositive « Merci »). */
export type NiveauDecor = Niveau | 'epilogue'

/** Une boîte en px de base. */
export interface Boite {
  x: number
  y: number
  l: number
  h: number
}

const portrait = (r: RatioPitch) => r === '9:16' || r === '3:4'

/** Une valeur par ratio ; sans entrée, le 4:3 prend celle du 16:9, le 3:4 celle du 9:16, le reste celle du 16:9. */
type ParRatio<T> = { '16:9': T } & Partial<Record<Exclude<RatioPitch, '16:9'>, T>>
export const auRatio = <T,>(p: ParRatio<T>, r: RatioPitch): T => p[r] ?? (r === '3:4' ? p['9:16'] : undefined) ?? p['16:9']

// ——— le mélange ———

/** Un générateur pseudo-aléatoire (mulberry32) : la même graine donne la même suite. */
function hasard(graine: number): () => number {
  let a = Math.floor(graine) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Les indices 0…n−1 mélangés par la graine (Fisher-Yates). */
export function melange(graine: number, n: number): number[] {
  const tirer = hasard(graine)
  const ordre = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(tirer() * (i + 1))
    ;[ordre[i], ordre[j]] = [ordre[j]!, ordre[i]!]
  }
  return ordre
}

/** Le jeu d'une branche principale : son indice modulo le nombre de jeux, dans l'ordre mélangé de la présentation. */
export const jeuDe = (graine: number, jeux: number, branche: number): number => melange(graine, jeux)[(((Math.floor(branche) % jeux) + jeux) % jeux)]!

// ——— les dessins ———

/** Une forme de décor : sa boîte propre et son dessin dans (0,0)–(l,h). `id` préfixe les dégradés du SVG. */
interface Dessin {
  l: number
  h: number
  /** Un trait qui se dessine (hand-drawn) : `pathLength` 1, pour que l'animation joue sur `stroke-dashoffset`. */
  trait?: boolean
  dessin: (couleur: string, id: (nom: string) => string) => ReactNode
}

const spirale = (cx: number, cy: number, r0: number, r1: number, tours: number): string => {
  const pas = Math.round(tours * 36)
  let d = ''
  for (let i = 0; i <= pas; i++) {
    const t = i / pas
    const a = t * tours * 2 * Math.PI
    const r = r0 + (r1 - r0) * t
    d += `${i ? 'L' : 'M'}${Math.round((cx + r * Math.cos(a)) * 10) / 10} ${Math.round((cy + r * Math.sin(a)) * 10) / 10}`
  }
  return d
}

/** Une forme close en polaire : un rayon de base, déformé par quelques harmoniques. */
const polaire = (cx: number, cy: number, rx: number, ry: number, harmoniques: readonly (readonly [number, number, number])[]): string => {
  const pas = 72
  let d = ''
  for (let i = 0; i < pas; i++) {
    const a = (i / pas) * 2 * Math.PI
    const k = 1 + harmoniques.reduce((s, [n, amp, phase]) => s + amp * Math.cos(n * a + phase), 0)
    d += `${i ? 'L' : 'M'}${Math.round((cx + rx * k * Math.cos(a)) * 10) / 10} ${Math.round((cy + ry * k * Math.sin(a)) * 10) / 10}`
  }
  return `${d}Z`
}

/** Un hexagone à côtés un peu bombés dans sa boîte, pointes à gauche et à droite (ou en haut et en bas, `debout`). */
const hexagoneBombe = (l: number, h: number, debout = false): string => {
  const pts: readonly (readonly [number, number])[] = debout
    ? [[l / 2, 0], [l, h / 4], [l, (3 * h) / 4], [l / 2, h], [0, (3 * h) / 4], [0, h / 4]]
    : [[0, h / 2], [l / 4, 0], [(3 * l) / 4, 0], [l, h / 2], [(3 * l) / 4, h], [l / 4, h]]
  const r = (n: number) => Math.round(n * 10) / 10
  let d = `M${r(pts[0]![0])} ${r(pts[0]![1])}`
  for (let i = 0; i < 6; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % 6]!
    // Le point de contrôle sort du milieu du côté, vers l'extérieur, de 4 %.
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    d += `Q${r(l / 2 + (mx - l / 2) * 1.04)} ${r(h / 2 + (my - h / 2) * 1.04)} ${r(b[0])} ${r(b[1])}`
  }
  return `${d}Z`
}

/** Les huit taches de shape-for-you : larges et basses (300 × 170), chacune sa bosse. */
const TACHES: readonly (readonly (readonly [number, number, number])[])[] = [
  [[2, 0.08, 0.3], [3, 0.06, 1.2], [5, 0.03, 0.4]],
  [[2, 0.1, 1.9], [3, 0.05, 0.2], [4, 0.04, 2.6]],
  [[3, 0.09, 0.8], [2, 0.05, 2.2], [5, 0.025, 1.1]],
  [[2, 0.07, 2.8], [4, 0.06, 0.5], [3, 0.03, 1.7]],
  [[3, 0.08, 2.4], [2, 0.06, 0.9], [6, 0.02, 0.1]],
  [[2, 0.09, 1.1], [3, 0.07, 2.9], [4, 0.03, 0.7]],
  [[4, 0.07, 1.5], [2, 0.06, 0.1], [3, 0.04, 2.1]],
  [[3, 0.1, 0.1], [2, 0.04, 1.4], [5, 0.03, 2.5]],
]
export const COULEURS_TACHES = ['#FCCFB2', '#CFC3BE', '#F3ADC5', '#C4CEDD', '#C1BCDE', '#BED6AB', '#BDDED4', '#E7E1AE'] as const

/** Une bulle pleine : un disque au dégradé `degrade`, cerclé de `contour` (0 : sans), avec son éventuel reflet. */
const bulle =
  (taille: number, contour: number, degrade: string, reflet?: ReactNode): Dessin['dessin'] =>
  (couleur, id) => (
    <>
      <circle cx={taille / 2} cy={taille / 2} r={taille / 2 - contour / 2} fill={`url(#${id(degrade)})`} stroke={contour ? couleur : 'none'} strokeWidth={contour} opacity={contour ? 0.8 : 1} />
      {reflet}
    </>
  )

const DESSINS: Readonly<Record<string, Dessin>> = {
  // innocence
  onde: { l: 560, h: 150, dessin: (c) => <path d="M30 100C90 20 150 20 205 75S320 135 380 70 495 10 530 60" fill="none" stroke={c} strokeWidth={34} strokeLinecap="round" /> },
  boucle: { l: 380, h: 380, dessin: (c) => <path d={spirale(190, 190, 18, 165, 2.2)} fill="none" stroke={c} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" /> },
  batonnets: {
    l: 130,
    h: 240,
    dessin: (c) => (
      <g stroke={c} strokeWidth={26} strokeLinecap="round">
        <line x1={28} y1={210} x2={58} y2={30} />
        <line x1={84} y1={222} x2={108} y2={70} />
      </g>
    ),
  },
  triangle: { l: 96, h: 84, dessin: (c) => <path d="M48 10L88 76H8Z" fill={c} stroke={c} strokeWidth={12} strokeLinejoin="round" /> },
  etoile: { l: 140, h: 140, dessin: (c) => <path d="M70 4C78 50 90 62 136 70C90 78 78 90 70 136C62 90 50 78 4 70C50 62 62 50 70 4Z" fill={c} stroke={c} strokeWidth={6} strokeLinejoin="round" /> },
  grandePastille: { l: 73, h: 64, dessin: (c) => <ellipse cx={36.5} cy={32} rx={36.5} ry={32} fill={c} /> },
  petitePastille: { l: 46, h: 46, dessin: (c) => <circle cx={23} cy={23} r={23} fill={c} /> },
  // shape-for-you
  fleuron: { l: 263, h: 263, dessin: (c) => <path d={polaire(131.5, 131.5, 112, 112, [[8, 0.13, 0]])} fill={c} /> },
  ...Object.fromEntries(TACHES.map((h, i) => [`tache${i + 1}`, { l: 300, h: 170, dessin: (c: string) => <path d={polaire(150, 85, 140, 76, h)} fill={c} /> } satisfies Dessin])),
  // midnight-rose
  grandHexagone: { l: 482, h: 482, dessin: (_c, id) => <path d={hexagoneBombe(482, 418)} fill={`url(#${id('hexagone')})`} transform="translate(0 32)" /> },
  moyenHexagone: { l: 500, h: 478, dessin: (_c, id) => <path d={hexagoneBombe(500, 478, true)} fill={`url(#${id('hexagone')})`} /> },
  petitHexagone: { l: 352, h: 307, dessin: () => <path d={hexagoneBombe(352, 307)} fill="#112385" /> },
  // hubble-bubble
  grandeBulleJaune: { l: 759, h: 759, dessin: bulle(759, 9, 'bulle-jaune') },
  petiteBulleJaune: { l: 288, h: 288, dessin: (c) => <circle cx={144} cy={144} r={140} fill="none" stroke={c} strokeWidth={6} /> },
  grandeBulleBlanche: { l: 605, h: 605, dessin: bulle(605, 0, 'bulle-blanche', <path d="M120 200C150 130 220 95 290 92C230 120 180 165 150 230C140 230 128 220 120 200Z" fill="#BFEDA3" />) },
  petiteBulleBlanche: { l: 304, h: 304, dessin: bulle(304, 0, 'bulle-blanche', <path d="M60 100C76 66 110 48 146 46C116 60 92 82 76 116C70 116 64 110 60 100Z" fill="#BFEDA3" />) },
  // hand-drawn
  zigzag: { l: 354, h: 286, trait: true, dessin: (c) => <path pathLength={1} d="M20 100L60 64L96 104L134 66L172 106L212 68L252 108L294 70L334 104" fill="none" stroke={c} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" /> },
  pli: { l: 520, h: 123, trait: true, dessin: (c) => <path pathLength={1} d="M14 32C150 24 330 18 504 22L74 94C230 88 380 86 470 90" fill="none" stroke={c} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" /> },
  fleur: {
    l: 109,
    h: 108,
    dessin: (c) => (
      <g stroke={c} strokeWidth={22} strokeLinecap="round">
        {[0, 1, 2, 3, 4].map((i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
          return <line key={i} x1={54.5} y1={54} x2={Math.round((54.5 + 40 * Math.cos(a)) * 10) / 10} y2={Math.round((54 + 40 * Math.sin(a)) * 10) / 10} />
        })}
      </g>
    ),
  },
  feuilleGauche: { l: 47, h: 72, trait: true, dessin: (c) => <path pathLength={1} d="M36 64L13 10" stroke={c} strokeWidth={12} strokeLinecap="round" fill="none" /> },
  feuilleMilieu: { l: 83, h: 80, trait: true, dessin: (c) => <path pathLength={1} d="M64 70L22 14" stroke={c} strokeWidth={12} strokeLinecap="round" fill="none" /> },
  feuilleDroite: { l: 64, h: 42, trait: true, dessin: (c) => <path pathLength={1} d="M56 34L10 12" stroke={c} strokeWidth={12} strokeLinecap="round" fill="none" /> },
}

export const FORMES_DE_DECOR = Object.keys(DESSINS)

/** Les dégradés d'un thème, préfixés pour que deux SVG d'une même page (les vignettes) ne se mêlent pas. */
const DEGRADES: Readonly<Record<string, (id: (n: string) => string) => ReactNode>> = {
  'midnight-rose': (id) => (
    <radialGradient id={id('hexagone')}>
      <stop offset="0" stopColor="#010101" />
      <stop offset="0.4375" stopColor="#010101" />
      <stop offset="1" stopColor="#2A43CA" />
    </radialGradient>
  ),
  'hubble-bubble': (id) => (
    <>
      <linearGradient id={id('bulle-jaune')} x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F0F35A" stopOpacity={0.5} />
        <stop offset="1" stopColor="#48C279" stopOpacity={0} />
      </linearGradient>
      <linearGradient id={id('bulle-blanche')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#BADD96" />
        <stop offset="1" stopColor="#BADD96" stopOpacity={0} />
      </linearGradient>
    </>
  ),
}

// ——— les placements ———

/** Une forme posée : coin haut-gauche de sa boîte en % de la diapositive, rotation (degrés) et échelle autour du centre. */
interface Placement {
  forme: string
  x: number
  y: number
  r?: number
  s?: number | readonly [number, number]
  couleur?: string
  /** La forme est là pour pouvoir glisser d'une diapositive à l'autre, mais hors champ. */
  horsChamp?: boolean
}

/** Une forme résolue, en px de base. */
export interface FormePlacee {
  cle: string
  forme: string
  x: number
  y: number
  l: number
  h: number
  rotation: number
  sx: number
  sy: number
  couleur: string
  horsChamp: boolean
}

/** Une bande de couleur (midnight-rose, hubble-bubble), en px de base ; elle garde une taille nulle quand elle n'a pas lieu. */
export interface Bande {
  couleur: string
  x: number
  y: number
  l: number
  h: number
}

export interface Decor {
  l: number
  h: number
  bandes: Bande[]
  /** Le cadre manuscrit de hand-drawn : son tracé, son épaisseur. */
  cadre: { d: string; trait: number } | null
  formes: FormePlacee[]
}

export interface DemandeDecor {
  theme: string
  ratio: RatioPitch
  niveau: NiveauDecor
  gabarit: Gabarit
  /** L'indice de la branche principale de la diapositive (0 pour le sujet central). */
  branche: number
  /** Tirée une fois par présentation : fixe le mélange des jeux. */
  graine: number
  /** La boîte du titre, px de base, quand le gabarit la connaît ; sinon on la suppose au centre. */
  titre?: Boite | undefined
  /** Le centre de chaque sous-sujet, en % de la diapositive (les taches de shape-for-you s'y posent). */
  sousSujets?: readonly (readonly [number, number])[] | undefined
}

/** La diapositive d'un sujet seul, sans liste (le central, l'épilogue, un sujet principal ou flottant). */
const estSujet = (g: Gabarit) => g === 'sujet' || g === 'sujet-image'
const estCentre = (d: DemandeDecor) => d.niveau === 'epilogue' || (d.niveau === 'central' && estSujet(d.gabarit))
const titreColle = (g: Gabarit) => g === 'accolade' || g === 'arete' || g === 'tete-arete' || g === 'chronologie' || g === 'tete-chronologie'

/** La boîte du titre supposée : au centre d'une diapo sujet, à gauche d'une liste. */
function titreSuppose(d: DemandeDecor, l: number, h: number): Boite {
  if (d.titre) return d.titre
  if (estSujet(d.gabarit) || d.niveau === 'epilogue') return { x: l * 0.25, y: h * 0.43, l: l * 0.5, h: h * 0.14 }
  return portrait(d.ratio) ? { x: l * 0.1, y: h * 0.12, l: l * 0.8, h: h * 0.1 } : { x: l * 0.08, y: h * 0.43, l: l * 0.34, h: h * 0.14 }
}

// innocence
const I = { rose: '#FF9A9A', jaune: '#FFEB83', orange: '#FFC368', vert: '#ACDB87', bleu: '#749AC7' }

const INNOCENCE_CENTRE: ParRatio<Placement[]> = {
  '16:9': [
    { forme: 'onde', x: -3.7, y: 63.9, couleur: I.rose },
    { forme: 'boucle', x: 76.2, y: -8.9, couleur: I.bleu },
    { forme: 'batonnets', x: 6.3, y: -16.7, couleur: I.jaune },
    { forme: 'triangle', x: -2, y: 17.8, couleur: I.bleu },
    { forme: 'etoile', x: 78.1, y: 59.6, couleur: I.vert },
    { forme: 'grandePastille', x: 45, y: 80.1, couleur: I.orange },
  ],
  '9:16': [
    { forme: 'onde', x: -9.5, y: 80, couleur: I.rose },
    { forme: 'boucle', x: 40, y: -13.9, couleur: I.bleu },
    { forme: 'batonnets', x: 8, y: -6, r: -19, couleur: I.jaune },
    { forme: 'triangle', x: -4, y: 24, couleur: I.bleu },
    { forme: 'etoile', x: 74, y: 70, couleur: I.vert },
    { forme: 'grandePastille', x: 58, y: 90, couleur: I.orange },
  ],
}

const INNOCENCE_JEUX: readonly Placement[][] = [
  [
    { forme: 'onde', x: -6, y: 72, r: -23.67, s: 0.64, couleur: I.rose },
    { forme: 'boucle', x: 82, y: -12, s: 0.586, couleur: I.bleu },
    { forme: 'batonnets', x: 4, y: -10, s: 0.86, couleur: I.jaune },
    { forme: 'etoile', x: 88, y: 72, s: 0.64, couleur: I.vert },
    { forme: 'petitePastille', x: 14, y: 20, couleur: I.orange },
  ],
  [
    { forme: 'boucle', x: -10, y: 62, r: 82.52, s: 0.64, couleur: I.jaune },
    { forme: 'onde', x: 70, y: -6, r: -24.92, s: 0.586, couleur: I.bleu },
    { forme: 'triangle', x: 90, y: 40, couleur: I.vert },
    { forme: 'grandePastille', x: 8, y: 10, couleur: I.orange },
    { forme: 'etoile', x: 4, y: 84, s: 0.86, couleur: I.rose },
  ],
  [
    { forme: 'batonnets', x: 88, y: 62, r: -24.92, s: 0.86, couleur: I.vert },
    { forme: 'onde', x: -8, y: -4, s: 0.64, couleur: I.orange },
    { forme: 'etoile', x: 80, y: 6, s: 0.586, couleur: I.jaune },
    { forme: 'triangle', x: 6, y: 80, r: 82.52, couleur: I.rose },
    { forme: 'petitePastille', x: 60, y: 88, couleur: I.bleu },
  ],
  [
    { forme: 'etoile', x: -2, y: -4, r: -23.67, s: 0.86, couleur: I.bleu },
    { forme: 'boucle', x: 84, y: 64, s: 0.64, couleur: I.rose },
    { forme: 'batonnets', x: 70, y: -14, r: 82.52, s: 0.64, couleur: I.orange },
    { forme: 'grandePastille', x: 4, y: 84, couleur: I.vert },
    { forme: 'triangle', x: 92, y: 8, couleur: I.jaune },
  ],
  [
    { forme: 'onde', x: 60, y: 84, r: -23.67, s: 0.586, couleur: I.vert },
    { forme: 'boucle', x: -12, y: -14, s: 0.586, couleur: I.orange },
    { forme: 'triangle', x: 88, y: 18, r: -24.92, couleur: I.rose },
    { forme: 'petitePastille', x: 10, y: 74, couleur: I.jaune },
    { forme: 'etoile', x: 86, y: 76, s: 0.64, couleur: I.bleu },
  ],
]

// midnight-rose
const MINUIT_CENTRE: Placement[] = [
  { forme: 'grandHexagone', x: 34.7, y: 23.2, s: [1.68, 1.48] },
  { forme: 'moyenHexagone', x: 34.4, y: 23.4, s: [1.06, 1.16] },
  { forme: 'petitHexagone', x: 38.3, y: 33.1, s: 1 },
]
const MINUIT_PRINCIPAL: Placement[] = [
  { forme: 'grandHexagone', x: 36, y: 24, s: [3.76, 3.32], r: 165 },
  { forme: 'moyenHexagone', x: 34, y: 22, s: [2.37, 2.6], r: 165 },
  { forme: 'petitHexagone', x: 40, y: 31, s: 2.24, r: 165 },
]
const MINUIT_ACCOLADE: Placement[] = [
  { forme: 'grandHexagone', x: 12.4, y: 23.2, s: [1.68, 1.48] },
  { forme: 'moyenHexagone', x: 12.1, y: 23.4, s: [1.06, 1.16] },
  { forme: 'petitHexagone', x: 16, y: 33.1, s: 1 },
]
/** Le trio décalé de (dx, dy) %, agrandi de k et tourné de r. */
const trio = (dx: number, dy: number, k: number, r: number): Placement[] =>
  MINUIT_CENTRE.map((p) => {
    const [sx, sy] = typeof p.s === 'number' ? [p.s, p.s] : (p.s ?? [1, 1])
    return { ...p, x: p.x + dx, y: p.y + dy, s: [sx * k, sy * k] as const, r }
  })
const MINUIT_JEUX: readonly Placement[][] = [trio(32, 30, 1.2, 30), trio(-42, -30, 1.4, -20), trio(36, -28, 1.1, 90), trio(-40, 34, 1.5, 165)]

// hubble-bubble
const HUBBLE_CENTRE: ParRatio<Placement[]> = {
  '16:9': [
    { forme: 'grandeBulleJaune', x: 10, y: 40, s: 1.87 },
    { forme: 'petiteBulleJaune', x: 78.8, y: -5.4, s: 1.78 },
    { forme: 'grandeBulleBlanche', x: -100, y: 40, horsChamp: true },
    { forme: 'petiteBulleBlanche', x: 110, y: -5, horsChamp: true },
  ],
  '4:3': [
    { forme: 'grandeBulleJaune', x: -10, y: 40, s: 1.87 },
    { forme: 'petiteBulleJaune', x: 78.8, y: -5.4, s: 1.78 },
    { forme: 'grandeBulleBlanche', x: -100, y: 40, horsChamp: true },
    { forme: 'petiteBulleBlanche', x: 110, y: -5, horsChamp: true },
  ],
  '9:16': [
    { forme: 'grandeBulleJaune', x: -30.9, y: 53.9, s: 1.87 },
    { forme: 'petiteBulleJaune', x: 66, y: -3, s: 1.2 },
    { forme: 'grandeBulleBlanche', x: -100, y: 50, horsChamp: true },
    { forme: 'petiteBulleBlanche', x: 110, y: 0, horsChamp: true },
  ],
}
const HUBBLE_JEUX: readonly Placement[][] = [
  [
    { forme: 'grandeBulleBlanche', x: 68, y: 48, s: 1.25 },
    { forme: 'petiteBulleBlanche', x: -6, y: -10, s: 0.9 },
    { forme: 'grandeBulleJaune', x: -100, y: 40, s: 1.87, horsChamp: true },
    { forme: 'petiteBulleJaune', x: 110, y: -5, s: 1.78, horsChamp: true },
  ],
  [
    { forme: 'grandeBulleJaune', x: 58, y: 52, s: 1.1 },
    { forme: 'petiteBulleBlanche', x: 4, y: 66, s: 0.8 },
    { forme: 'grandeBulleBlanche', x: -100, y: 0, horsChamp: true },
    { forme: 'petiteBulleJaune', x: 110, y: -5, horsChamp: true },
  ],
  [
    { forme: 'grandeBulleBlanche', x: -18, y: -38, s: 1.3 },
    { forme: 'petiteBulleJaune', x: 82, y: 70 },
    { forme: 'grandeBulleJaune', x: 110, y: 40, s: 1.87, horsChamp: true },
    { forme: 'petiteBulleBlanche', x: -100, y: 60, horsChamp: true },
  ],
]

/**
 * Le cadre à main levée de hand-drawn : un rectangle qui suit le bord à 1 à 3 %, coins de travers, bas un peu ondulé.
 * Pur et sans hasard : le même ratio donne le même cadre. Épaisseur 42 pour 900 de petit côté.
 */
export function cadreManuscrit(l: number, h: number): { d: string; trait: number } {
  const m = Math.min(l, h)
  const trait = Math.round((42 * m) / 900)
  const g = (k: number) => Math.round(m * k)
  const r = (n: number) => Math.round(n)
  const bas = Array.from({ length: 6 }, (_, i) => {
    const x = l - g(0.03) - ((l - g(0.05)) * (i + 1)) / 7
    return `${r(x)} ${r(h - g(0.025) + Math.sin(i * 1.7) * g(0.008))}`
  })
  const d = [
    `M${g(0.03)} ${g(0.035)}`,
    `L${r(l / 2)} ${g(0.022)}`,
    `L${l - g(0.025)} ${g(0.03)}`,
    `L${l - g(0.018)} ${r(h / 2)}`,
    `L${l - g(0.03)} ${h - g(0.03)}`,
    ...bas.map((p) => `L${p}`),
    `L${g(0.02)} ${h - g(0.035)}`,
    `L${g(0.028)} ${r(h / 2)}`,
    `L${g(0.025)} ${g(0.05)}`,
  ].join('')
  return { d, trait }
}

/** Les placements d'un thème, en % de la diapositive, avec ses bandes et son cadre. */
function placementsDe(d: DemandeDecor, l: number, h: number): { formes: Placement[]; bandes: Bande[]; cadre: boolean } {
  const pc = (b: Boite) => ({ x: (b.x / l) * 100, y: (b.y / h) * 100, l: (b.l / l) * 100, h: (b.h / h) * 100 })
  /** Le coin d'une forme pour que son centre tombe en (cx, cy) %. */
  const centree = (forme: string, cx: number, cy: number, reste: Omit<Placement, 'forme' | 'x' | 'y'> = {}): Placement => {
    const f = DESSINS[forme]!
    return { forme, x: cx - (f.l / 2 / l) * 100, y: cy - (f.h / 2 / h) * 100, ...reste }
  }
  switch (d.theme) {
    case 'innocence':
      return { formes: estCentre(d) ? auRatio(INNOCENCE_CENTRE, d.ratio) : INNOCENCE_JEUX[jeuDe(d.graine, 5, d.branche)]!, bandes: [], cadre: false }
    case 'shape-for-you': {
      if (estCentre(d)) {
        const etoile: Placement = portrait(d.ratio) ? { forme: 'fleuron', x: -22.2, y: 13.3, s: 5.27, r: 10.78, couleur: '#F4B7B8' } : { forme: 'fleuron', x: 22.5, y: 13.3, s: 4.7, couleur: '#F4B7B8' }
        return { formes: [etoile], bandes: [], cadre: false }
      }
      const j = jeuDe(d.graine, 8, d.branche)
      const tache = (k: number) => ({ forme: `tache${(k % 8) + 1}`, couleur: COULEURS_TACHES[k % 8]! })
      const t = pc(titreSuppose(d, l, h))
      const cx = t.x + t.l / 2
      const cy = t.y + t.h / 2
      const sous = (d.sousSujets ?? []).map(([x, y], i) => centree(tache(j + i + 1).forme, x, y, { s: 0.8, couleur: tache(j + i + 1).couleur }))
      if (estSujet(d.gabarit))
        return {
          formes: [centree(tache(j).forme, cx, cy, { s: portrait(d.ratio) ? 2.5 : 4, couleur: tache(j).couleur }), centree(tache(j + 3).forme, cx + 25, cy + 3.6, { s: 2.15, r: -27.75, couleur: tache(j + 3).couleur })],
          bandes: [],
          cadre: false,
        }
      if (d.niveau === 'central') return { formes: [centree('fleuron', cx, cy, { s: 2.2, couleur: '#F4B7B8' }), ...sous], bandes: [], cadre: false }
      if (titreColle(d.gabarit)) return { formes: [centree(tache(j).forme, cx, cy, { s: 2, couleur: tache(j).couleur }), ...sous], bandes: [], cadre: false }
      return { formes: [centree(tache(j + 3).forme, 88, 86, { s: 2.15, r: -27.75, couleur: tache(j + 3).couleur }), ...sous], bandes: [], cadre: false }
    }
    case 'midnight-rose': {
      const plein = estCentre(d) ? 1 : d.gabarit === 'accolade' ? 0.55 : 0
      const bande: Bande = portrait(d.ratio) ? { couleur: '#0C1548', x: 0, y: 0, l, h: Math.round(h * plein) } : { couleur: '#0C1548', x: 0, y: 0, l: Math.round(l * plein), h }
      const formes = estCentre(d)
        ? MINUIT_CENTRE
        : d.gabarit === 'accolade'
          ? MINUIT_ACCOLADE
          : (d.niveau === 'principal' || d.niveau === 'flottant') && estSujet(d.gabarit)
            ? MINUIT_PRINCIPAL
            : MINUIT_JEUX[jeuDe(d.graine, 4, d.branche)]!
      return { formes, bandes: [bande], cadre: false }
    }
    case 'hubble-bubble': {
      const paroles = d.gabarit === 'paroles'
      const hauteur = paroles ? Math.round(h * (portrait(d.ratio) ? 0.212 : 0.26)) : 0
      return {
        formes: estCentre(d) ? auRatio(HUBBLE_CENTRE, d.ratio) : HUBBLE_JEUX[jeuDe(d.graine, 3, d.branche)]!,
        bandes: [{ couleur: '#279452', x: 0, y: h - hauteur, l, h: hauteur }],
        cadre: false,
      }
    }
    case 'hand-drawn': {
      if (!(estSujet(d.gabarit) || d.niveau === 'epilogue')) return { formes: [], bandes: [], cadre: true }
      const t = titreSuppose(d, l, h)
      const px = (forme: string, x: number, y: number): Placement => ({ forme, x: (x / l) * 100, y: (y / h) * 100 })
      const zigzagX = auRatio<number>({ '16:9': 1216, '4:3': 816, '9:16': 516 }, d.ratio)
      const fleur = auRatio<[number, number]>({ '16:9': [137, 671], '4:3': [87, 672], '9:16': [67, 1400], '3:4': [67, 1000] }, d.ratio)
      const formes = [px('zigzag', zigzagX, -50), px('pli', t.x + t.l - 525, t.y + t.h + (portrait(d.ratio) ? -160 : -60)), px('fleur', fleur[0], fleur[1])]
      if (d.ratio === '16:9') formes.push(px('feuilleGauche', t.x + 30, t.y - 110), px('feuilleMilieu', t.x - 10, t.y - 90), px('feuilleDroite', t.x - 15, t.y - 40))
      return { formes, bandes: [], cadre: true }
    }
    default:
      return { formes: [], bandes: [], cadre: false }
  }
}

/** Le décor d'une diapositive : formes, bandes et cadre, en px de base. Pur : tout vient de la demande. */
export function decorDe(d: DemandeDecor, couleur = themePitchDe(d.theme).texte): Decor {
  const { l, h } = TAILLES_DE_BASE[d.ratio]
  const p = placementsDe(d, l, h)
  return {
    l,
    h,
    bandes: p.bandes,
    cadre: p.cadre ? cadreManuscrit(l, h) : null,
    formes: p.formes.map((f, i) => {
      const dessin = DESSINS[f.forme]!
      const [sx, sy] = typeof f.s === 'number' ? [f.s, f.s] : (f.s ?? [1, 1])
      return {
        cle: `${f.forme}-${i}`,
        forme: f.forme,
        x: Math.round(((f.x * l) / 100) * 10) / 10,
        y: Math.round(((f.y * h) / 100) * 10) / 10,
        l: dessin.l,
        h: dessin.h,
        rotation: f.r ?? 0,
        sx,
        sy,
        couleur: f.couleur ?? couleur,
        horsChamp: !!f.horsChamp,
      }
    }),
  }
}

export interface ProprietesDecor extends Omit<DemandeDecor, 'theme'> {
  theme: ThemePitch | string
}

/**
 * La couche de décor : un SVG à la taille de base de la diapositive, étiré sur sa couche. Chaque forme porte
 * `data-decor` (son nom) et `data-rang` (son ordre), que les transitions visent ; la position est sur le `<g>` externe,
 * rotation et échelle sur l'interne, pour qu'on puisse animer l'un sans l'autre.
 */
export function DecorDiapo({ theme, ...demande }: ProprietesDecor) {
  const th = typeof theme === 'string' ? themePitchDe(theme) : theme
  const prefixe = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const id = (nom: string) => `d${prefixe}-${nom}`
  const d = decorDe({ ...demande, theme: th.id }, th.texte)
  if (!d.formes.length && !d.bandes.length && !d.cadre) return null
  return (
    <svg className="notak-arbre-diapo-decor-svg" viewBox={`0 0 ${d.l} ${d.h}`} preserveAspectRatio="none" aria-hidden="true" data-theme={th.id}>
      {DEGRADES[th.id] && <defs>{DEGRADES[th.id]!(id)}</defs>}
      {d.bandes.map((b, i) => (
        <rect key={`bande-${i}`} data-decor="bande" x={b.x} y={b.y} width={b.l} height={b.h} fill={b.couleur} />
      ))}
      {d.cadre && <path data-decor="cadre" pathLength={1} d={d.cadre.d} fill="none" stroke={th.texte} strokeWidth={d.cadre.trait} strokeLinecap="round" strokeLinejoin="round" />}
      {d.formes.map((f, i) => {
        const dessin = DESSINS[f.forme]!
        return (
          <g key={f.cle} data-decor={f.forme} data-rang={i} data-hors-champ={f.horsChamp ? '' : undefined} data-trait={dessin.trait ? '' : undefined} transform={`translate(${f.x + f.l / 2} ${f.y + f.h / 2})`}>
            <g transform={`rotate(${f.rotation}) scale(${f.sx} ${f.sy})`}>
              <g transform={`translate(${-f.l / 2} ${-f.h / 2})`}>{dessin.dessin(f.couleur, id)}</g>
            </g>
          </g>
        )
      })}
    </svg>
  )
}

// ——— les animations, que les transitions joueront ———

/** Une durée : en ms, ou un multiple de la durée de la transition en cours. */
export type DureeDecor = number | { fois: number }

export interface AnimationDeDecor {
  theme: string
  /** `entree` : le fondu vers une diapo à décor ; `affichage` : chaque fois que la diapo paraît ; `morphing` : d'une diapo à l'autre. */
  quand: 'entree' | 'affichage' | 'morphing'
  /** Un sélecteur dans la couche de décor (`contenu` : la couche du contenu de la diapo). */
  cible: string
  propriete: string
  de: number | string
  a: number | string
  duree: DureeDecor
  delai: DureeDecor
  /** Le nom de la courbe d'anime.js 3. */
  courbe: string
  boucle?: number
  sens?: 'alternate'
}

/** Relevé 12, § 6, § 7 et § 8.3. */
export const ANIMATIONS_DE_DECOR: readonly AnimationDeDecor[] = [
  // hand-drawn : chaque trait se dessine (stroke-dashoffset 1 → 0, les tracés ont `pathLength` 1), 2 600 ms en tout.
  { theme: 'hand-drawn', quand: 'entree', cible: '[data-decor="cadre"]', propriete: 'strokeDashoffset', de: 1, a: 0, duree: 1000, delai: 0, courbe: 'linear' },
  { theme: 'hand-drawn', quand: 'entree', cible: '[data-decor="zigzag"] path', propriete: 'strokeDashoffset', de: 1, a: 0, duree: 1000, delai: 800, courbe: 'linear' },
  { theme: 'hand-drawn', quand: 'entree', cible: '[data-decor^="feuille"] path', propriete: 'strokeDashoffset', de: 1, a: 0, duree: 600, delai: 1000, courbe: 'linear' },
  { theme: 'hand-drawn', quand: 'entree', cible: '[data-decor="pli"] path', propriete: 'strokeDashoffset', de: 1, a: 0, duree: 800, delai: 1500, courbe: 'linear' },
  { theme: 'hand-drawn', quand: 'entree', cible: '[data-decor="fleur"] > g', propriete: 'rotate', de: 160, a: 0, duree: 1600, delai: 1000, courbe: 'linear' },
  { theme: 'hand-drawn', quand: 'entree', cible: '[data-decor="fleur"]', propriete: 'opacity', de: 0, a: 1, duree: 1000, delai: 1000, courbe: 'linear' },
  // midnight-rose, effet « scale » : T = 2 × la durée du fondu.
  { theme: 'midnight-rose', quand: 'entree', cible: '[data-decor][data-rang="0"]', propriete: 'opacity', de: 0, a: 1, duree: { fois: 0.66 }, delai: 0, courbe: 'easeInOutQuart' },
  { theme: 'midnight-rose', quand: 'entree', cible: '[data-decor][data-rang="1"]', propriete: 'opacity', de: 0, a: 1, duree: { fois: 0.66 }, delai: { fois: 0.34 }, courbe: 'easeInOutQuart' },
  { theme: 'midnight-rose', quand: 'entree', cible: '[data-decor][data-rang]:not([data-rang="0"]):not([data-rang="1"])', propriete: 'opacity', de: 0, a: 1, duree: { fois: 1.66 }, delai: { fois: 0.34 }, courbe: 'easeInOutQuart' },
  { theme: 'midnight-rose', quand: 'entree', cible: '[data-decor][data-rang] > g', propriete: 'scale', de: 0.77, a: 1, duree: { fois: 1.66 }, delai: { fois: 0.34 }, courbe: 'easeInOutQuart' },
  { theme: 'midnight-rose', quand: 'entree', cible: 'contenu', propriete: 'opacity', de: 0, a: 1, duree: { fois: 1.67 }, delai: { fois: 0.33 }, courbe: 'easeInQuad' },
  // Les autres décors arrivent du bord le plus proche (gauche ou droite, haut ou bas selon leur centre).
  ...(['innocence', 'shape-for-you'] as const).map((theme) => ({ theme, quand: 'entree' as const, cible: '[data-decor][data-rang]', propriete: 'translate', de: 'hors-champ', a: 'place', duree: { fois: 1 }, delai: { fois: 1 }, courbe: 'easeInOutQuart' })),
  { theme: 'hubble-bubble', quand: 'entree', cible: '[data-decor][data-rang]', propriete: 'translate', de: 'hors-champ', a: 'place', duree: { fois: 1 }, delai: { fois: 1 }, courbe: 'spring(0.3, 20, 3, 0)' },
  // hubble-bubble : chaque bulle gonfle d'environ 25 px de diamètre et revient, une fois par affichage.
  { theme: 'hubble-bubble', quand: 'affichage', cible: '[data-decor*="Bulle"]:not([data-hors-champ]) > g', propriete: 'scale', de: 'échelle', a: 'échelle + 25 / (largeur × échelle)', duree: 2000, delai: 0, courbe: 'easeInQuart', boucle: 2, sens: 'alternate' },
  // D'une diapo à l'autre : les décors communs glissent de leur place à la nouvelle ; les bandes suivent, élastiques.
  ...(['innocence', 'shape-for-you', 'midnight-rose', 'hand-drawn'] as const).map((theme) => ({ theme, quand: 'morphing' as const, cible: '[data-decor][data-rang]', propriete: 'translate, rotate, scale, opacity, fill', de: 'source', a: 'cible', duree: { fois: 1 }, delai: 0, courbe: 'easeInOutQuart' })),
  { theme: 'hubble-bubble', quand: 'morphing', cible: '[data-decor][data-rang]', propriete: 'translate, rotate, scale, opacity', de: 'source', a: 'cible', duree: { fois: 1.5 }, delai: 0, courbe: 'easeInOutQuart' },
  { theme: 'hubble-bubble', quand: 'morphing', cible: '[data-decor="bande"]', propriete: 'y, height', de: 'source', a: 'cible', duree: { fois: 0.5 }, delai: 300, courbe: 'easeOutElastic(1, 1.5)' },
  { theme: 'midnight-rose', quand: 'morphing', cible: '[data-decor="bande"]', propriete: 'width, height', de: 'source', a: 'cible', duree: { fois: 0.5 }, delai: 300, courbe: 'easeOutElastic(1, .5)' },
]
