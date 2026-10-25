/**
 * Les courbes des transitions du Pitch (relevé 10 § 7.4, relevé 12 § 8.2). Xmind embarque anime.js 3 et nomme ses
 * courbes comme lui (`easeInOutQuart`, `easeOutElastic(1, .5)`, `spring(0.3, 20, 3, 0)`) ; anime.js 4, qui fait tourner
 * nos animations, a renommé les siennes et en a changé trois (Expo, Elastic, le ressort). On écrit donc les formules
 * publiques nous-mêmes et on les donne à anime.js comme fonctions : le mouvement est celui de Xmind, au point près.
 *
 * Avec t de 0 à 1 et une courbe d'entrée f : easeIn = f(t), easeOut = 1 − f(1 − t), easeInOut = f(2t) / 2 avant ½,
 * 1 − f(2 − 2t) / 2 après, easeOutIn = l'inverse.
 */

export type Courbe = (t: number) => number

const borne = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/** Les courbes d'entrée d'anime.js 3 ; Quad à Expo sont des puissances 2 à 6. */
const ENTREES: Record<string, (a: number, b: number) => Courbe> = {
  Quad: () => (t) => t ** 2,
  Cubic: () => (t) => t ** 3,
  Quart: () => (t) => t ** 4,
  Quint: () => (t) => t ** 5,
  Expo: () => (t) => t ** 6,
  Sine: () => (t) => 1 - Math.cos((t * Math.PI) / 2),
  Circ: () => (t) => 1 - Math.sqrt(1 - t * t),
  Back: () => (t) => t * t * (3 * t - 2),
  Bounce: () => (t) => {
    let p: number
    let b = 4
    while (t < ((p = 2 ** --b) - 1) / 11);
    return 1 / 4 ** (3 - b) - 7.5625 * ((p * 3 - 2) / 22 - t) ** 2
  },
  /** Elastic(a, p) : a borné à [1, 10], p à [0,1, 2] ; 0 et 1 restent fixes. */
  Elastic: (amplitude, periode) => {
    const a = borne(amplitude, 1, 10)
    const p = borne(periode, 0.1, 2)
    return (t) => (t === 0 || t === 1 ? t : -a * 2 ** (10 * (t - 1)) * Math.sin(((t - 1 - (p / (Math.PI * 2)) * Math.asin(1 / a)) * Math.PI * 2) / p))
  },
}

const SENS: Record<string, (f: Courbe) => Courbe> = {
  easeIn: (f) => f,
  easeOut: (f) => (t) => 1 - f(1 - t),
  easeInOut: (f) => (t) => (t < 0.5 ? f(t * 2) / 2 : 1 - f(t * -2 + 2) / 2),
  easeOutIn: (f) => (t) => (t < 0.5 ? (1 - f(1 - t * 2)) / 2 : (f(t * 2 - 1) + 1) / 2),
}

/** Les paramètres entre parenthèses d'un nom de courbe : `spring(0.3, 20, 3, 0)` → [0,3, 20, 3, 0]. */
const parametres = (nom: string): number[] => {
  const m = /\(([^)]*)\)/.exec(nom)
  return m ? m[1]!.split(',').map((x) => Number.parseFloat(x)).filter((x) => !Number.isNaN(x)) : []
}

/** Un ressort amorti : la masse m, la raideur k, l'amortissement c, la vitesse de départ v (relevé 12 § 8.2). */
export interface Ressort {
  /** La position à l'instant t (en secondes) : 0 au départ, 1 au repos. */
  position: (secondes: number) => number
  /** La durée du mouvement, en ms : il remplace celle demandée. */
  duree: number
}

/**
 * Le ressort d'anime.js 3 : ω₀ = √(k/m), ζ = c / (2√(km)). Sa durée est le temps, par pas d'un sixième, après lequel la
 * position reste à 1 seize pas de suite, rapporté en ms comme le fait anime.js 3 ; `spring(0.3, 20, 3, 0)` dure 1 667 ms.
 */
export function ressort(masse = 1, raideur = 100, amortissement = 10, vitesse = 0): Ressort {
  const m = borne(masse, 0.1, 100)
  const k = borne(raideur, 0.1, 100)
  const c = borne(amortissement, 0.1, 100)
  const v = borne(vitesse, 0.1, 100)
  const w0 = Math.sqrt(k / m)
  const zeta = c / (2 * Math.sqrt(k * m))
  const wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0
  const b = zeta < 1 ? (zeta * w0 - v) / wd : -v + w0
  const ecart = (s: number) => (zeta < 1 ? Math.exp(-s * zeta * w0) * (Math.cos(wd * s) + b * Math.sin(wd * s)) : (1 + b * s) * Math.exp(-s * w0))
  const position = (s: number) => (s === 0 ? 0 : 1 - ecart(s))
  const pas = 1 / 6
  let ecoule = 0
  let repos = 0
  // Le ressort finit par se poser : la position vaut 1 au dernier bit près. On s'arrête au bout d'une minute quoi qu'il arrive.
  while (repos < 16 && ecoule < 360) {
    ecoule += pas
    repos = position(ecoule) === 1 ? repos + 1 : 0
  }
  return { position, duree: ecoule * pas * 1000 }
}

const cache = new Map<string, Courbe>()

/**
 * La courbe d'un nom d'anime.js 3 : `linear`, `easeInOutQuart`, `easeOutElastic(1, .5)`, `spring(m, k, c, v)`,
 * `cubicBezier(x1, y1, x2, y2)`. Un nom inconnu donne la linéaire.
 */
export function courbe(nom: string): Courbe {
  const deja = cache.get(nom)
  if (deja) return deja
  let f: Courbe = (t) => t
  const p = parametres(nom)
  if (nom.startsWith('spring')) {
    const r = ressort(p[0], p[1], p[2], p[3])
    const s = r.duree / 1000
    f = (t) => (t === 0 || t === 1 ? t : r.position(t * s))
  } else if (nom.startsWith('cubicBezier')) {
    f = bezier(p[0] ?? 0, p[1] ?? 0, p[2] ?? 1, p[3] ?? 1)
  } else {
    const m = /^(easeInOut|easeOutIn|easeIn|easeOut)([A-Za-z]+)/.exec(nom)
    const entree = m && ENTREES[m[2]!]
    if (m && entree) f = SENS[m[1]!]!(entree(p[0] ?? 1, p[1] ?? 0.5))
  }
  cache.set(nom, f)
  return f
}

/** La durée qu'une courbe impose (le ressort calcule la sienne) ; sinon celle demandée. */
export function dureeImposee(nom: string, demandee: number): number {
  if (!nom.startsWith('spring')) return demandee
  const p = parametres(nom)
  return ressort(p[0], p[1], p[2], p[3]).duree
}

/** Une courbe de Bézier cubique comme en CSS : Newton, puis la dichotomie s'il le faut. */
export function bezier(x1: number, y1: number, x2: number, y2: number): Courbe {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a
  const B = (a: number, b: number) => 3 * b - 6 * a
  const C = (a: number) => 3 * a
  const calc = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t
  const pente = (t: number, a: number, b: number) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a)
  const tDeX = (x: number) => {
    let t = x
    for (let i = 0; i < 8; i++) {
      const p = pente(t, x1, x2)
      if (Math.abs(p) < 1e-6) break
      const e = calc(t, x1, x2) - x
      if (Math.abs(e) < 1e-7) return t
      t -= e / p
    }
    let a = 0
    let b = 1
    t = x
    for (let i = 0; i < 40 && b - a > 1e-7; i++) {
      if (calc(t, x1, x2) < x) a = t
      else b = t
      t = (a + b) / 2
    }
    return t
  }
  return (x) => (x <= 0 || x >= 1 ? x : calc(tDeX(x), y1, y2))
}
