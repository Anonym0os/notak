import type { FormeLimite, FormeResume, FormeSujet } from '../../coeur/tableau'

/**
 * Les formes d'un sujet, d'une limite et d'un résumé (docs/XMIND.md § 5 bis) : chacune se dessine en chemin SVG dans
 * un cadre de `l` × `h`. La table sert au rendu (`Dessin.tsx`), aux vignettes du panneau Style et au fichier `.xmind`
 * (le suffixe de `org.xmind.topicShape.*`). → Notak : tous les dessins sont à nous ; seuls les noms de classes du
 * format sont ceux de Xmind.
 */

const f = (v: number) => Math.round(v * 10) / 10
type Pt = readonly [number, number]
const poly = (pts: readonly Pt[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`

export type GroupeForme = 'basique' | 'avance' | 'ponctuation' | 'organigramme'

export interface DefForme {
  id: FormeSujet
  /** Le suffixe de `org.xmind.topicShape.` dans `shape-class`. */
  xmind: string
  groupe: GroupeForme
  /** Le contour fermé : rempli et tracé. Absent pour les soulignés et « sans cadre ». */
  d?: (l: number, h: number) => string
  /** Pour les signes de ponctuation : des traits seuls, sur un fond rectangulaire. */
  trait?: (l: number, h: number) => string
  /** Ce que la forme ajoute aux marges du texte (verticale, horizontale), pour que le texte tienne dedans. */
  marge?: (v: number, h: number) => [number, number]
  /** Le cadre est un carré (cercle, double cercle). */
  carre?: boolean
}

const ellipseEn = (x: number, y: number, l: number, h: number) =>
  `M${f(x)} ${f(y + h / 2)}A${f(l / 2)} ${f(h / 2)} 0 1 0 ${f(x + l)} ${f(y + h / 2)}A${f(l / 2)} ${f(h / 2)} 0 1 0 ${f(x)} ${f(y + h / 2)}Z`
const ellipse = (l: number, h: number) => ellipseEn(0, 0, l, h)

/** Un rectangle dont chaque bord porte des bosses : le nuage, les festons. `r` : le rayon d'une bosse, `sortant` : vers l'extérieur. */
function bosses(x0: number, y0: number, l: number, h: number, pas: number, sortant = true): string {
  const nx = Math.max(2, Math.round(l / pas))
  const ny = Math.max(2, Math.round(h / pas))
  const [sx, sy] = [l / nx, h / ny]
  const balai = sortant ? 1 : 0
  let d = `M${f(x0)} ${f(y0)}`
  for (let i = 0; i < nx; i++) d += `A${f(sx * 0.58)} ${f(sx * 0.58)} 0 0 ${balai} ${f(x0 + sx * (i + 1))} ${f(y0)}`
  for (let i = 0; i < ny; i++) d += `A${f(sy * 0.58)} ${f(sy * 0.58)} 0 0 ${balai} ${f(x0 + l)} ${f(y0 + sy * (i + 1))}`
  for (let i = 0; i < nx; i++) d += `A${f(sx * 0.58)} ${f(sx * 0.58)} 0 0 ${balai} ${f(x0 + l - sx * (i + 1))} ${f(y0 + h)}`
  for (let i = 0; i < ny; i++) d += `A${f(sy * 0.58)} ${f(sy * 0.58)} 0 0 ${balai} ${f(x0)} ${f(y0 + h - sy * (i + 1))}`
  return `${d}Z`
}

const etoile = (l: number, h: number) => {
  const pts: Pt[] = []
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const k = i % 2 === 0 ? 1 : 0.42
    pts.push([l / 2 + (l / 2) * k * Math.cos(a), h / 2 + (h / 2) * k * Math.sin(a) * 1.05])
  }
  return poly(pts)
}

/** Un hexagone aux angles arrondis : les six sommets, adoucis par une courbe. */
function hexagoneArrondi(l: number, h: number): string {
  const k = Math.min(h / 2, l / 4)
  const s: Pt[] = [[k, 0], [l - k, 0], [l, h / 2], [l - k, h], [k, h], [0, h / 2]]
  const mil = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  let d = ''
  s.forEach((p, i) => {
    const [avant, apres] = [s[(i + 5) % 6]!, s[(i + 1) % 6]!]
    const [a, b] = [mil(p, avant, 0.22), mil(p, apres, 0.22)]
    d += `${i === 0 ? 'M' : 'L'}${f(a[0])} ${f(a[1])}Q${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`
  })
  return `${d}Z`
}

/** Un chevron, pointe à `x` : le bord d'un guillemet. */
const chevron = (x: number, l: number, y0: number, y1: number) => `M${f(x + l)} ${f(y0)}L${f(x)} ${f((y0 + y1) / 2)}L${f(x + l)} ${f(y1)}`

const feuille = (l: number, h: number, dx = 0, dy = 0) => {
  const b = Math.min(h * 0.18, 10)
  const [w, hh] = [l - dx, h - dy]
  return `M${f(dx)} ${f(dy)}H${f(l)}V${f(dy + hh - b)}C${f(dx + w * 0.75)} ${f(dy + hh - 2.2 * b)} ${f(dx + w * 0.6)} ${f(dy + hh + 0.4 * b)} ${f(dx + w * 0.5)} ${f(dy + hh - b)}S${f(dx + w * 0.15)} ${f(dy + hh)} ${f(dx)} ${f(dy + hh - b)}Z`
}

const D = (id: FormeSujet, xmind: string, groupe: GroupeForme, reste: Omit<DefForme, 'id' | 'xmind' | 'groupe'> = {}): DefForme => ({ id, xmind, groupe, ...reste })

/** Toutes les formes, dans l'ordre du panneau de Xmind (groupe par groupe). */
export const FORMES: readonly DefForme[] = [
  // Basiques.
  D('arrondi', 'roundedRect', 'basique', {
    d: (l, h) => {
      const r = Math.min(8, h / 2)
      return `M${r} 0H${f(l - r)}Q${f(l)} 0 ${f(l)} ${r}V${f(h - r)}Q${f(l)} ${f(h)} ${f(l - r)} ${f(h)}H${r}Q0 ${f(h)} 0 ${f(h - r)}V${r}Q0 0 ${r} 0Z`
    },
  }),
  D('rectangle', 'rect', 'basique', { d: (l, h) => `M0 0H${f(l)}V${f(h)}H0Z` }),
  D('souligne', 'underline', 'basique'),
  D('double-souligne', 'doubleunderline', 'basique'),
  D('cercle', 'circle.compact', 'basique', { d: ellipse, carre: true, marge: (v, h) => [v * 1.5, h * 1.2] }),
  D('ellipse', 'ellipse', 'basique', { d: ellipse, marge: (v, h) => [v * 1.6, h * 1.5] }),
  D('losange', 'diamond', 'basique', { d: (l, h) => `M${f(l / 2)} 0L${f(l)} ${f(h / 2)}L${f(l / 2)} ${f(h)}L0 ${f(h / 2)}Z`, marge: (v, h) => [v * 2.2, h * 2] }),
  D('parallelogramme', 'parallelogram', 'basique', {
    d: (l, h) => {
      const k = Math.min(10, l / 5)
      return `M${f(k)} 0H${f(l)}L${f(l - k)} ${f(h)}H0Z`
    },
    marge: (v, h) => [v, h + 8],
  }),
  D('capsule', 'ellipserect.compact', 'basique', {
    d: (l, h) => {
      const r = h / 2
      return `M${f(r)} 0H${f(l - r)}A${f(r)} ${f(r)} 0 0 1 ${f(l - r)} ${f(h)}H${f(r)}A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0Z`
    },
    marge: (v, h) => [v, h + 6],
  }),
  D('hexagone', 'hexagon', 'basique', {
    d: (l, h) => {
      const k = Math.min(14, l / 4)
      return poly([[k, 0], [l - k, 0], [l, h / 2], [l - k, h], [k, h], [0, h / 2]])
    },
    marge: (v, h) => [v, h + 10],
  }),
  D('hexagone-arrondi', 'roundedhexagon', 'basique', { d: hexagoneArrondi, marge: (v, h) => [v, h + 10] }),
  D('rectangle-elliptique', 'ellipticrectangle', 'basique', {
    d: (l, h) => {
      const k = Math.min(h * 0.6, l / 3)
      return `M${f(k)} 0H${f(l - k)}A${f(k)} ${f(h / 2)} 0 0 1 ${f(l - k)} ${f(h)}H${f(k)}A${f(k)} ${f(h / 2)} 0 0 1 ${f(k)} 0Z`
    },
    marge: (v, h) => [v, h + 8],
  }),
  // Avancées.
  D('coeur', 'heart.compact', 'avance', {
    d: (l, h) => {
      const [x, y] = [(u: number) => f(u * l), (u: number) => f(u * h)]
      return `M${x(0.5)} ${y(0.96)}C${x(0.1)} ${y(0.64)} ${x(0)} ${y(0.44)} ${x(0)} ${y(0.28)}C${x(0)} ${y(0.1)} ${x(0.14)} 0 ${x(0.28)} 0C${x(0.4)} 0 ${x(0.48)} ${y(0.08)} ${x(0.5)} ${y(0.2)}C${x(0.52)} ${y(0.08)} ${x(0.6)} 0 ${x(0.72)} 0C${x(0.86)} 0 ${x(1)} ${y(0.1)} ${x(1)} ${y(0.28)}C${x(1)} ${y(0.44)} ${x(0.9)} ${y(0.64)} ${x(0.5)} ${y(0.96)}Z`
    },
    marge: (v, h) => [v * 1.6, h * 1.6],
  }),
  D('nuage', 'simpleCloud.compact', 'avance', { d: (l, h) => bosses(4, 4, l - 8, h - 8, 26), marge: (v, h) => [v + 4, h + 6] }),
  D('etoile', 'star.compact', 'avance', { d: etoile, marge: (v, h) => [v * 2.2, h * 2.2] }),
  D('goutte', 'waterdrop.compact', 'avance', {
    d: (l, h) => {
      const [x, y] = [(u: number) => f(u * l), (u: number) => f(u * h)]
      return `M${x(0.5)} 0C${x(0.5)} 0 ${x(1)} ${y(0.42)} ${x(1)} ${y(0.64)}C${x(1)} ${y(0.84)} ${x(0.78)} ${y(1)} ${x(0.5)} ${y(1)}C${x(0.22)} ${y(1)} 0 ${y(0.84)} 0 ${y(0.64)}C0 ${y(0.42)} ${x(0.5)} 0 ${x(0.5)} 0Z`
    },
    marge: (v, h) => [v * 1.5, h * 1.6],
  }),
  D('losange-coupe', 'cutdiamond.compact', 'avance', {
    d: (l, h) => poly([[l * 0.22, 0], [l * 0.78, 0], [l, h * 0.36], [l / 2, h], [0, h * 0.36]]),
    marge: (v, h) => [v * 1.3, h * 1.5],
  }),
  D('bouclier', 'shield.compact', 'avance', {
    d: (l, h) => `M0 0H${f(l)}V${f(h * 0.5)}C${f(l)} ${f(h * 0.8)} ${f(l * 0.75)} ${f(h * 0.93)} ${f(l / 2)} ${f(h)}C${f(l * 0.25)} ${f(h * 0.93)} 0 ${f(h * 0.8)} 0 ${f(h * 0.5)}Z`,
    marge: (v, h) => [v * 1.1, h + 4],
  }),
  D('fleche-gauche', 'fatLeftArrow.compact', 'avance', {
    d: (l, h) => {
      const k = Math.min(h * 0.7, l * 0.3)
      return poly([[0, h / 2], [k, 0], [k, h * 0.22], [l, h * 0.22], [l, h * 0.78], [k, h * 0.78], [k, h]])
    },
    marge: (v, h) => [v * 1.6, h + 14],
  }),
  D('fleche-droite', 'fatRightArrow.compact', 'avance', {
    d: (l, h) => {
      const k = Math.min(h * 0.7, l * 0.3)
      return poly([[l, h / 2], [l - k, 0], [l - k, h * 0.22], [0, h * 0.22], [0, h * 0.78], [l - k, h * 0.78], [l - k, h]])
    },
    marge: (v, h) => [v * 1.6, h + 14],
  }),
  D('etiquette', 'label.compact', 'avance', {
    d: (l, h) => {
      const k = Math.min(h / 2, l / 4)
      return poly([[0, 0], [l - k, 0], [l, h / 2], [l - k, h], [0, h]])
    },
    marge: (v, h) => [v, h + 6],
  }),
  D('signet', 'bookmark.compact', 'avance', {
    d: (l, h) => {
      const k = Math.min(h * 0.3, 12)
      return poly([[0, 0], [l, 0], [l, h], [l / 2, h - k], [0, h]])
    },
    marge: (v, h) => [v + 4, h],
  }),
  D('angle-brise', 'singlebreakangle', 'avance', {
    d: (l, h) => {
      const k = Math.min(h * 0.4, 12)
      return poly([[0, 0], [l - k, 0], [l, k], [l, h], [0, h]])
    },
    marge: (v, h) => [v, h + 4],
  }),
  D('pile', 'stack', 'avance', {
    d: (l, h) => {
      const k = Math.min(5, h / 5)
      return `${poly([[k, 0], [l, 0], [l, h - k], [l - k, h - k], [l - k, h], [0, h], [0, k], [k, k]])}M${f(k)} ${f(k)}H${f(l - k)}V${f(h - k)}`
    },
    marge: (v, h) => [v + 3, h + 3],
  }),
  D('carte', 'card', 'avance', {
    d: (l, h) => {
      const k = Math.min(h * 0.4, 12)
      return poly([[k, 0], [l, 0], [l, h], [0, h], [0, k]])
    },
    marge: (v, h) => [v, h + 3],
  }),
  // Ponctuation : des signes de chaque côté du texte.
  D('guillemet-simple', 'singleBookQuote', 'ponctuation', {
    trait: (l, h) => `${chevron(0, 8, h * 0.12, h * 0.88)}${chevron(l, -8, h * 0.12, h * 0.88)}`,
    marge: (v, h) => [v, h + 12],
  }),
  D('guillemets-chevrons', 'doubleBookQuote', 'ponctuation', {
    trait: (l, h) => `${chevron(0, 7, h * 0.12, h * 0.88)}${chevron(8, 7, h * 0.12, h * 0.88)}${chevron(l, -7, h * 0.12, h * 0.88)}${chevron(l - 8, -7, h * 0.12, h * 0.88)}`,
    marge: (v, h) => [v, h + 22],
  }),
  D('crochets', 'squareBracket', 'ponctuation', {
    trait: (l, h) => `M8 0H0V${f(h)}H8M${f(l - 8)} 0H${f(l)}V${f(h)}H${f(l - 8)}`,
    marge: (v, h) => [v, h + 12],
  }),
  D('parentheses', 'roundBracket', 'ponctuation', {
    trait: (l, h) => `M8 0Q0 ${f(h / 2)} 8 ${f(h)}M${f(l - 8)} 0Q${f(l)} ${f(h / 2)} ${f(l - 8)} ${f(h)}`,
    marge: (v, h) => [v, h + 14],
  }),
  D('accolades', 'curlyBracket', 'ponctuation', {
    trait: (l, h) => {
      const g = (x: number, s: 1 | -1) =>
        `M${f(x + s * 7)} 0Q${f(x + s * 3)} 0 ${f(x + s * 3)} ${f(h * 0.2)}V${f(h * 0.4)}Q${f(x + s * 3)} ${f(h / 2)} ${f(x)} ${f(h / 2)}Q${f(x + s * 3)} ${f(h / 2)} ${f(x + s * 3)} ${f(h * 0.6)}V${f(h * 0.8)}Q${f(x + s * 3)} ${f(h)} ${f(x + s * 7)} ${f(h)}`
      return `${g(0, 1)}${g(l, -1)}`
    },
    marge: (v, h) => [v, h + 16],
  }),
  D('guillemet-carre', 'squareQuote', 'ponctuation', {
    trait: (l, h) => `M8 0H0V8M${f(l - 8)} ${f(h)}H${f(l)}V${f(h - 8)}`,
    marge: (v, h) => [v + 2, h + 12],
  }),
  D('guillemets', 'doubleQuote', 'ponctuation', {
    trait: (l, h) => `M5 8L8 0M11 8L14 0M${f(l - 14)} ${f(h)}L${f(l - 11)} ${f(h - 8)}M${f(l - 8)} ${f(h)}L${f(l - 5)} ${f(h - 8)}`,
    marge: (v, h) => [v + 4, h + 20],
  }),
  // Organigramme.
  D('decision', 'decision.compact', 'organigramme', { d: (l, h) => `M${f(l / 2)} 0L${f(l)} ${f(h / 2)}L${f(l / 2)} ${f(h)}L0 ${f(h / 2)}Z`, marge: (v, h) => [v * 2, h * 1.9] }),
  D('saisie-manuelle', 'manualInput', 'organigramme', { d: (l, h) => poly([[0, h * 0.28], [l, 0], [l, h], [0, h]]), marge: (v, h) => [v + 3, h] }),
  D('processus-predefini', 'predefinedProcess', 'organigramme', { d: (l, h) => `M0 0H${f(l)}V${f(h)}H0ZM8 0V${f(h)}M${f(l - 8)} 0V${f(h)}`, marge: (v, h) => [v, h + 14] }),
  D('operation-manuelle', 'manualOperation', 'organigramme', { d: (l, h) => poly([[0, 0], [l, 0], [l - Math.min(12, l / 5), h], [Math.min(12, l / 5), h]]), marge: (v, h) => [v, h + 14] }),
  D('base-de-donnees', 'database', 'organigramme', {
    d: (l, h) => {
      const e = Math.min(7, h / 5)
      return `M0 ${f(e)}A${f(l / 2)} ${f(e)} 0 0 1 ${f(l)} ${f(e)}V${f(h - e)}A${f(l / 2)} ${f(e)} 0 0 1 0 ${f(h - e)}ZM0 ${f(e)}A${f(l / 2)} ${f(e)} 0 0 0 ${f(l)} ${f(e)}`
    },
    marge: (v, h) => [v + 8, h],
  }),
  D('document', 'document', 'organigramme', { d: (l, h) => feuille(l, h), marge: (v, h) => [v + 5, h] }),
  D('multi-documents', 'multiDocument', 'organigramme', {
    d: (l, h) => `${feuille(l, h, 6, 6)}M0 ${f(h - 14)}V0H${f(l - 6)}M3 ${f(h - 11)}V3H${f(l - 3)}`,
    marge: (v, h) => [v + 8, h + 6],
  }),
  D('delai', 'delay', 'organigramme', {
    d: (l, h) => {
      const r = Math.min(h / 2, l / 3)
      return `M0 0H${f(l - r)}A${f(r)} ${f(h / 2)} 0 0 1 ${f(l - r)} ${f(h)}H0Z`
    },
    marge: (v, h) => [v, h + 8],
  }),
  D('donnees', 'data', 'organigramme', {
    d: (l, h) => {
      const k = Math.min(12, l / 5)
      return poly([[k, 0], [l, 0], [l - k, h], [0, h]])
    },
    marge: (v, h) => [v, h + 10],
  }),
  D('renvoi-page', 'onPageReference', 'organigramme', { d: ellipse, carre: true, marge: (v, h) => [v * 1.5, h * 1.2] }),
  D('renvoi-hors-page', 'offPageReference', 'organigramme', { d: (l, h) => poly([[0, 0], [l, 0], [l, h * 0.62], [l / 2, h], [0, h * 0.62]]), marge: (v, h) => [v * 1.3, h] }),
  D('double-cercle', 'circle.double', 'organigramme', { d: (l, h) => `${ellipse(l, h)}${ellipseEn(4, 4, l - 8, h - 8)}`, carre: true, marge: (v, h) => [v * 1.7, h * 1.4] }),
  D('drapeau', 'flag', 'organigramme', {
    d: (l, h) => {
      const k = Math.min(h / 2, l / 5)
      return poly([[0, 0], [l, 0], [l - k, h / 2], [l, h], [0, h]])
    },
    marge: (v, h) => [v, h + 8],
  }),
  D('trapeze', 'trapezoid', 'organigramme', {
    d: (l, h) => {
      const k = Math.min(12, l / 5)
      return poly([[k, 0], [l - k, 0], [l, h], [0, h]])
    },
    marge: (v, h) => [v, h + 12],
  }),
  D('trapeze-inverse', 'trapezoid.inverse', 'organigramme', {
    d: (l, h) => {
      const k = Math.min(12, l / 5)
      return poly([[0, 0], [l, 0], [l - k, h], [k, h]])
    },
    marge: (v, h) => [v, h + 12],
  }),
]

const PAR_ID = new Map<FormeSujet, DefForme>(FORMES.map((x) => [x.id, x]))
const PAR_XMIND = new Map(FORMES.map((x) => [x.xmind, x.id]))

export const defForme = (id: FormeSujet): DefForme | undefined => PAR_ID.get(id)

/** Les groupes du panneau, dans l'ordre. */
export const GROUPES_FORMES: readonly GroupeForme[] = ['basique', 'avance', 'ponctuation', 'organigramme']

/** La forme d'un `shape-class` (`org.xmind.topicShape.roundedRect`), ou `undefined` pour une forme inconnue. */
export function formeDepuisXmind(classe: unknown): FormeSujet | undefined {
  if (typeof classe !== 'string') return undefined
  const m = classe.match(/^org\.xmind\.topicShape\.(.+)$/)
  return m ? PAR_XMIND.get(m[1]!) : undefined
}

export const xmindDeForme = (f: FormeSujet): string | undefined => {
  const d = PAR_ID.get(f)
  return d ? `org.xmind.topicShape.${d.xmind}` : undefined
}

/** Le contour d'une forme, pour un cadre de `l` × `h` : le remplissage-contour, et les traits seuls s'il y en a. */
export function contourForme(forme: FormeSujet, l: number, h: number): { d: string | null; trait: string | null } {
  const def = PAR_ID.get(forme)
  if (!def) return { d: null, trait: null }
  if (def.trait) return { d: `M0 0H${f(l)}V${f(h)}H0Z`, trait: def.trait(l, h) }
  return { d: def.d ? def.d(l, h) : null, trait: null }
}

/** Ce que la forme ajoute aux marges : le texte doit tenir dans le cadre. */
export function margesForme(forme: FormeSujet, m: [number, number]): [number, number] {
  return PAR_ID.get(forme)?.marge?.(m[0], m[1]) ?? m
}

export const formeCarree = (forme: FormeSujet): boolean => !!PAR_ID.get(forme)?.carre

// — Limites —

export const FORMES_LIMITE: readonly { id: FormeLimite; xmind: string }[] = [
  { id: 'rectangle', xmind: 'rect' },
  { id: 'arrondi', xmind: 'roundedRect' },
  { id: 'polygone', xmind: 'polygon' },
  { id: 'festons', xmind: 'scallops' },
  { id: 'vagues', xmind: 'waves' },
  { id: 'tension', xmind: 'tension' },
  { id: 'polygone-arrondi', xmind: 'roundedPolygon' },
  { id: 'focus', xmind: 'focus' },
  { id: 'croix', xmind: 'cross' },
]

/** Le contour d'une limite dans le cadre `x`, `y`, `l`, `h`. `focus` : quatre équerres, sans remplissage de contour. */
export function contourLimite(forme: FormeLimite, x: number, y: number, l: number, h: number): { d: string; equerres?: string } {
  const [x1, y1] = [x + l, y + h]
  switch (forme) {
    case 'rectangle':
      return { d: `M${f(x)} ${f(y)}H${f(x1)}V${f(y1)}H${f(x)}Z` }
    case 'arrondi': {
      const r = Math.min(12, h / 2, l / 2)
      return { d: `M${f(x + r)} ${f(y)}H${f(x1 - r)}Q${f(x1)} ${f(y)} ${f(x1)} ${f(y + r)}V${f(y1 - r)}Q${f(x1)} ${f(y1)} ${f(x1 - r)} ${f(y1)}H${f(x + r)}Q${f(x)} ${f(y1)} ${f(x)} ${f(y1 - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z` }
    }
    case 'polygone': {
      const k = Math.min(14, h / 3, l / 3)
      return { d: poly([[x + k, y], [x1 - k, y], [x1, y + k], [x1, y1 - k], [x1 - k, y1], [x + k, y1], [x, y1 - k], [x, y + k]]) }
    }
    case 'polygone-arrondi': {
      const k = Math.min(16, h / 3, l / 3)
      return { d: `M${f(x + k)} ${f(y)}H${f(x1 - k)}Q${f(x1)} ${f(y)} ${f(x1)} ${f(y + k)}V${f(y1 - k)}Q${f(x1)} ${f(y1)} ${f(x1 - k)} ${f(y1)}H${f(x + k)}Q${f(x)} ${f(y1)} ${f(x)} ${f(y1 - k)}V${f(y + k)}Q${f(x)} ${f(y)} ${f(x + k)} ${f(y)}Z` }
    }
    case 'festons':
      return { d: bosses(x, y, l, h, 28) }
    case 'vagues': {
      const n = Math.max(2, Math.round(l / 40))
      const m = Math.max(2, Math.round(h / 40))
      const [sx, sy, a] = [l / n, h / m, 4]
      let d = `M${f(x)} ${f(y)}`
      for (let i = 0; i < n; i++) d += `q${f(sx / 4)} ${-a} ${f(sx / 2)} 0t${f(sx / 2)} 0`
      for (let i = 0; i < m; i++) d += `q${a} ${f(sy / 4)} 0 ${f(sy / 2)}t0 ${f(sy / 2)}`
      for (let i = 0; i < n; i++) d += `q${f(-sx / 4)} ${a} ${f(-sx / 2)} 0t${f(-sx / 2)} 0`
      for (let i = 0; i < m; i++) d += `q${-a} ${f(-sy / 4)} 0 ${f(-sy / 2)}t0 ${f(-sy / 2)}`
      return { d: `${d}Z` }
    }
    case 'tension': {
      const c = Math.min(14, h / 4, l / 4)
      return { d: `M${f(x)} ${f(y)}Q${f(x + l / 2)} ${f(y + c)} ${f(x1)} ${f(y)}Q${f(x1 - c)} ${f(y + h / 2)} ${f(x1)} ${f(y1)}Q${f(x + l / 2)} ${f(y1 - c)} ${f(x)} ${f(y1)}Q${f(x + c)} ${f(y + h / 2)} ${f(x)} ${f(y)}Z` }
    }
    case 'focus': {
      const k = Math.min(18, h / 3, l / 3)
      return { d: `M${f(x)} ${f(y)}H${f(x1)}V${f(y1)}H${f(x)}Z`, equerres: `M${f(x)} ${f(y + k)}V${f(y)}H${f(x + k)}M${f(x1 - k)} ${f(y)}H${f(x1)}V${f(y + k)}M${f(x1)} ${f(y1 - k)}V${f(y1)}H${f(x1 - k)}M${f(x + k)} ${f(y1)}H${f(x)}V${f(y1 - k)}` }
    }
    case 'croix': {
      const [a, b] = [Math.min(16, l / 4), Math.min(16, h / 4)]
      return { d: poly([[x + a, y], [x1 - a, y], [x1 - a, y + b], [x1, y + b], [x1, y1 - b], [x1 - a, y1 - b], [x1 - a, y1], [x + a, y1], [x + a, y1 - b], [x, y1 - b], [x, y + b], [x + a, y + b]]) }
    }
  }
}

// — Résumés —

export const FORMES_RESUME: readonly { id: FormeResume; xmind: string }[] = [
  { id: 'angle', xmind: 'angle' },
  { id: 'carre', xmind: 'square' },
  { id: 'ronde', xmind: 'round' },
  { id: 'accolade', xmind: 'curly' },
  { id: 'droite', xmind: 'straight' },
]

/**
 * L'accolade d'un résumé, le long de `x` entre `y0` et `y1`, sa pointe vers le sujet de résumé (`sens` : 1 si le sujet
 * est à gauche de la plage, -1 s'il est à droite).
 */
export function cheminResume(forme: FormeResume, x: number, y0: number, y1: number, sens: 1 | -1): string {
  const ym = (y0 + y1) / 2
  const r = Math.min(8, (y1 - y0) / 4)
  const [a, b] = [x + sens * r, x]
  const tige = `M${f(b)} ${f(ym)}H${f(b - sens * 10)}`
  switch (forme) {
    case 'accolade':
      return `M${f(a)} ${f(y0)}Q${f(b)} ${f(y0)} ${f(b)} ${f(y0 + r)}V${f(ym - r)}Q${f(b)} ${f(ym)} ${f(b - sens * r)} ${f(ym)}Q${f(b)} ${f(ym)} ${f(b)} ${f(ym + r)}V${f(y1 - r)}Q${f(b)} ${f(y1)} ${f(a)} ${f(y1)}`
    case 'ronde':
      return `M${f(x + sens * 6)} ${f(y0)}Q${f(b)} ${f(y0)} ${f(b)} ${f(ym)}Q${f(b)} ${f(y1)} ${f(x + sens * 6)} ${f(y1)}${tige}`
    case 'carre':
      return `M${f(x + sens * 6)} ${f(y0)}H${f(b)}V${f(y1)}H${f(x + sens * 6)}${tige}`
    case 'angle':
      return `M${f(x + sens * 8)} ${f(y0)}L${f(b)} ${f(ym)}L${f(x + sens * 8)} ${f(y1)}${tige}`
    case 'droite':
      return `M${f(b)} ${f(y0)}V${f(y1)}${tige}`
  }
}
