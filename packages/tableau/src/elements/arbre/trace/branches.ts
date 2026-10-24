import type { Boite, Cote } from '../disposition'

/** Les styles de branche de docs/XMIND.md § 5. */
export type StyleBranche = 'courbe' | 'organique' | 'droite' | 'coudee' | 'coudee-arrondie' | 'anse' | 'pli' | 'pli-arrondi' | 'aucune'

/**
 * Quels sujets sont soulignés : leurs branches partent et arrivent au bout du trait, pas au milieu. Un nombre est
 * l'épaisseur du trait, qui occupe le bas du sujet : la branche suit son axe, et le souligné du parent se prolonge
 * ainsi jusqu'à l'enfant. `true` : le bord du sujet (un trait sans épaisseur).
 */
export interface Soulignes {
  parent?: boolean | number
  enfant?: boolean | number
  /** Le parent est le central : ses branches en coude sortent du dessous de son corps (voir `cheminBranche`). */
  centre?: boolean
  /**
   * Le départ du central comme chez Xmind : la branche naît sous le central, à un tiers de sa largeur de son centre, et
   * n'apparaît qu'à sa sortie. Toujours le cas de la forme `organique` ; pour la droite, le pli et le pli arrondi,
   * seulement avec ce réglage (un squelette le pose), car ces formes partaient du milieu du bord du central.
   */
  radial?: boolean
}

/** L'ordonnée où une branche touche un sujet : le milieu de son bord, ou l'axe de son souligné. */
function ordonnee(b: Boite, souligne: boolean | number | undefined): number {
  if (!souligne) return b.y + b.h / 2
  return b.y + b.h - (typeof souligne === 'number' ? souligne / 2 : 0)
}

/** Le point d'où part une branche (le bord du parent tourné vers l'enfant), et celui où elle arrive. */
export function extremites(p: Boite, e: Boite, cote: Cote, s: Soulignes = {}): [[number, number], [number, number]] {
  const yp = ordonnee(p, s.parent)
  const ye = ordonnee(e, s.enfant)
  switch (cote) {
    case 'droite':
      return [[p.x + p.l, yp], [e.x, ye]]
    case 'gauche':
      return [[p.x, yp], [e.x + e.l, ye]]
    case 'bas':
      return [[p.x + p.l / 2, p.y + p.h], [e.x + e.l / 2, e.y]]
    case 'haut':
      return [[p.x + p.l / 2, p.y], [e.x + e.l / 2, e.y + e.h]]
  }
}

const n = (v: number) => Math.round(v * 10) / 10

/** Le rayon des angles d'un coude arrondi. */
const RAYON_COUDE = 10

/**
 * Où part un coude du central : à un tiers de sa largeur du centre, du côté de l'enfant, par le haut ou le bas de son
 * corps (ce que Xmind fait en cachant le départ sous le central). Un enfant à la hauteur du central : une horizontale
 * depuis son bord. `null` quand le parent n'est pas le central, qu'il est souligné, ou que la branche n'est pas
 * horizontale.
 */
function departCentral(p: Boite, cote: Cote, s: Soulignes, y1: number): [number, number] | null {
  if (!s.centre || s.parent || (cote !== 'droite' && cote !== 'gauche')) return null
  const x = p.x + p.l / 2 + (cote === 'droite' ? 1 : -1) * (p.l / 3)
  if (y1 < p.y) return [x, p.y]
  if (y1 > p.y + p.h) return [x, p.y + p.h]
  return [cote === 'droite' ? p.x + p.l : p.x, y1]
}

/** Le chemin SVG d'une branche du parent `p` à l'enfant `e`. */
export function cheminBranche(p: Boite, e: Boite, cote: Cote, style: StyleBranche | 'arbre' | 'arbre-g' = 'courbe', s: Soulignes = {}): string {
  if (style === 'arbre' || style === 'arbre-g') {
    // Un arbre : un tronc qui descend (ou monte) du parent, puis un coude vers chaque enfant.
    const aDroite = style === 'arbre'
    const xt = aDroite ? p.x + 12 : p.x + p.l - 12
    const yt = cote === 'haut' ? p.y : p.y + p.h
    const ye = ordonnee(e, s.enfant)
    return `M${n(xt)} ${n(yt)}V${n(ye)}H${n(aDroite ? e.x : e.x + e.l)}`
  }
  const [[x0, y0], [x1, y1]] = extremites(p, e, cote, s)
  const horizontal = cote === 'droite' || cote === 'gauche'
  switch (style) {
    case 'aucune':
      return ''
    case 'droite':
    case 'organique':
    case 'anse':
    case 'pli':
    case 'pli-arrondi':
      return versChemin(trajetXmind(p, e, cote, style, s).segments)
    case 'coudee': {
      const c = departCentral(p, cote, s, y1)
      if (c) return c[1] === y1 ? `M${n(c[0])} ${n(y1)}H${n(x1)}` : `M${n(c[0])} ${n(c[1])}V${n(y1)}H${n(x1)}`
      if (horizontal) {
        const xm = (x0 + x1) / 2
        return `M${n(x0)} ${n(y0)}H${n(xm)}V${n(y1)}H${n(x1)}`
      }
      const ym = (y0 + y1) / 2
      return `M${n(x0)} ${n(y0)}V${n(ym)}H${n(x1)}V${n(y1)}`
    }
    case 'coudee-arrondie': {
      const c = departCentral(p, cote, s, y1)
      if (c) {
        if (c[1] === y1) return `M${n(c[0])} ${n(y1)}H${n(x1)}`
        const sx = Math.sign(x1 - c[0]) || 1
        const sy = Math.sign(y1 - c[1])
        const r = Math.min(RAYON_COUDE, Math.abs(y1 - c[1]), Math.abs(x1 - c[0]))
        return `M${n(c[0])} ${n(c[1])}V${n(y1 - sy * r)}Q${n(c[0])} ${n(y1)} ${n(c[0] + sx * r)} ${n(y1)}H${n(x1)}`
      }
      if (horizontal) {
        const xm = (x0 + x1) / 2
        const r = Math.min(RAYON_COUDE, Math.abs(y1 - y0) / 2, Math.abs(xm - x0))
        const sx = Math.sign(x1 - x0) || 1
        const sy = Math.sign(y1 - y0)
        if (sy === 0) return `M${n(x0)} ${n(y0)}H${n(x1)}`
        return `M${n(x0)} ${n(y0)}H${n(xm - sx * r)}Q${n(xm)} ${n(y0)} ${n(xm)} ${n(y0 + sy * r)}V${n(y1 - sy * r)}Q${n(xm)} ${n(y1)} ${n(xm + sx * r)} ${n(y1)}H${n(x1)}`
      }
      const ym = (y0 + y1) / 2
      return `M${n(x0)} ${n(y0)}V${n(ym)}H${n(x1)}V${n(y1)}`
    }
    case 'courbe': {
      // Une courbe en S : elle quitte le parent à l'horizontale (ou à la verticale) et arrive de même sur l'enfant.
      if (horizontal) {
        const xm = (x0 + x1) / 2
        return `M${n(x0)} ${n(y0)}C${n(xm)} ${n(y0)} ${n(xm)} ${n(y1)} ${n(x1)} ${n(y1)}`
      }
      const ym = (y0 + y1) / 2
      return `M${n(x0)} ${n(y0)}C${n(x0)} ${n(ym)} ${n(x1)} ${n(ym)} ${n(x1)} ${n(y1)}`
    }
  }
}


// — Les formes de Xmind : des trajets faits de segments —

type Pt = readonly [number, number]

/** Un morceau de trajet : une droite, une courbe quadratique ou une courbe cubique, de son premier point au dernier. */
export type Segment = readonly ['L', Pt, Pt] | readonly ['Q', Pt, Pt, Pt] | readonly ['C', Pt, Pt, Pt, Pt]

const dernier = (g: Segment): Pt => g[g.length - 1] as Pt
const entre = (a: Pt, b: Pt, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]

/** Le point d'un segment au paramètre `u` (0 : son début, 1 : sa fin). */
export function pointDe(g: Segment, u: number): Pt {
  if (g[0] === 'L') return entre(g[1], g[2], u)
  if (g[0] === 'Q') return entre(entre(g[1], g[2], u), entre(g[2], g[3], u), u)
  const [a, b, c] = [entre(g[1], g[2], u), entre(g[2], g[3], u), entre(g[3], g[4], u)]
  return entre(entre(a, b, u), entre(b, c, u), u)
}

/** La direction du segment au paramètre `u` (non normée) ; la corde quand la dérivée s'annule. */
function tangente(g: Segment, u: number): Pt {
  const v = (a: Pt, b: Pt): Pt => [b[0] - a[0], b[1] - a[1]]
  let t: Pt
  if (g[0] === 'L') t = v(g[1], g[2])
  else if (g[0] === 'Q') t = entre(v(g[1], g[2]), v(g[2], g[3]), u)
  else {
    const [a, b, c] = [v(g[1], g[2]), v(g[2], g[3]), v(g[3], g[4])]
    t = entre(entre(a, b, u), entre(b, c, u), u)
  }
  return Math.hypot(t[0], t[1]) > 1e-6 ? t : v(g[1], dernier(g))
}

/** Le segment coupé au paramètre `u` : ce qui précède, et ce qui suit (algorithme de de Casteljau). */
export function couper(g: Segment, u: number): [Segment, Segment] {
  if (g[0] === 'L') {
    const m = entre(g[1], g[2], u)
    return [['L', g[1], m], ['L', m, g[2]]]
  }
  if (g[0] === 'Q') {
    const [a, b] = [entre(g[1], g[2], u), entre(g[2], g[3], u)]
    const m = entre(a, b, u)
    return [['Q', g[1], a, m], ['Q', m, b, g[3]]]
  }
  const [a, b, c] = [entre(g[1], g[2], u), entre(g[2], g[3], u), entre(g[3], g[4], u)]
  const [d, e] = [entre(a, b, u), entre(b, c, u)]
  const m = entre(d, e, u)
  return [['C', g[1], a, d, m], ['C', m, e, c, g[4]]]
}

/** Le chemin SVG d'un trajet. */
export function versChemin(segments: readonly Segment[]): string {
  if (segments.length === 0) return ''
  const p = (q: Pt) => `${n(q[0])} ${n(q[1])}`
  let d = `M${p(segments[0]![1])}`
  for (const g of segments) d += g[0] === 'L' ? `L${p(g[2])}` : g[0] === 'Q' ? `Q${p(g[2])} ${p(g[3])}` : `C${p(g[2])} ${p(g[3])} ${p(g[4])}`
  return d
}

/** Un trajet lu dans un chemin SVG (M, L, H, V, Q, C en absolu : ceux que `cheminBranche` écrit). */
export function segmentsDe(d: string): Segment[] {
  const sortie: Segment[] = []
  let [x, y] = [0, 0]
  for (const [, cmd, reste] of d.matchAll(/([MLHVQC])([^MLHVQCZ]*)/g)) {
    const v = reste!.trim().split(/[\s,]+/).filter(Boolean).map(Number)
    const depart: Pt = [x, y]
    switch (cmd) {
      case 'M':
        ;[x, y] = [v[0]!, v[1]!]
        break
      case 'L':
        sortie.push(['L', depart, [v[0]!, v[1]!]])
        ;[x, y] = [v[0]!, v[1]!]
        break
      case 'H':
        sortie.push(['L', depart, [v[0]!, y]])
        x = v[0]!
        break
      case 'V':
        sortie.push(['L', depart, [x, v[0]!]])
        y = v[0]!
        break
      case 'Q':
        sortie.push(['Q', depart, [v[0]!, v[1]!], [v[2]!, v[3]!]])
        ;[x, y] = [v[2]!, v[3]!]
        break
      case 'C':
        sortie.push(['C', depart, [v[0]!, v[1]!], [v[2]!, v[3]!], [v[4]!, v[5]!]])
        ;[x, y] = [v[4]!, v[5]!]
        break
    }
  }
  return sortie
}

/** Le trajet d'une branche, et la part (0 à 1) du trajet entier qui reste cachée sous le central. */
export interface Trajet {
  segments: Segment[]
  debut: number
}

/**
 * Ce qui reste d'un trajet une fois sorti du cadre `b` : le trajet qui commence dedans (sous le central) est coupé à
 * l'endroit où il en sort. Un trajet qui ne commence pas dedans, ou n'en sort pas, reste entier.
 */
export function horsDuCadre(segments: Segment[], b: Boite): Trajet {
  const dedans = ([x, y]: Pt) => x > b.x + 0.5 && x < b.x + b.l - 0.5 && y > b.y + 0.5 && y < b.y + b.h - 0.5
  if (segments.length === 0 || !dedans(segments[0]![1])) return { segments, debut: 0 }
  for (const [i, g] of segments.entries()) {
    const PAS = 32
    for (let k = 1; k <= PAS; k++) {
      if (dedans(pointDe(g, k / PAS))) continue
      let [bas, haut] = [(k - 1) / PAS, k / PAS]
      for (let it = 0; it < 24; it++) {
        const milieu = (bas + haut) / 2
        if (dedans(pointDe(g, milieu))) bas = milieu
        else haut = milieu
      }
      return { segments: [couper(g, haut)[1], ...segments.slice(i + 1)], debut: (i + haut) / segments.length }
    }
  }
  return { segments, debut: 0 }
}

/** Le rayon des angles d'un pli arrondi, côté départ : la moitié du plus petit écart ; côté arrivée, la moitié de ce rayon. */
const coin = (a: Pt, b: Pt, rayon: number): Pt => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1])
  return d === 0 ? a : entre(a, b, Math.min(rayon, d) / d)
}

/**
 * Les cinq formes de Xmind qui ne sont pas des coudes, dans le repère de la croissance : `g` va du parent (0) à l'enfant
 * (1) le long de la branche, `t` en travers. La courbe organique est un arc : son point de contrôle est à `g` = 0,2 et
 * `t` = 1, elle part donc presque en travers et se couche sur l'enfant. L'anse est une cubique à plat, qui tourne tard
 * (contrôles à 0,75 puis 0,5). Le pli va en biais jusqu'aux deux tiers, le pli arrondi jusqu'à la moitié, avec un coin.
 */
export function trajetXmind(p: Boite, e: Boite, cote: Cote, style: 'droite' | 'organique' | 'anse' | 'pli' | 'pli-arrondi', s: Soulignes = {}): Trajet {
  const horizontal = cote === 'droite' || cote === 'gauche'
  let [[x0, y0], [x1, y1]] = extremites(p, e, cote, s)
  const radial = !!s.centre && !s.parent && horizontal && (style === 'organique' || (!!s.radial && style !== 'anse'))
  // Le départ du central : sous lui, à un tiers de sa largeur de son centre, à mi-hauteur.
  if (radial) [x0, y0] = [p.x + p.l / 2 + (cote === 'droite' ? 1 : -1) * (p.l / 3), p.y + p.h / 2]
  const a: Pt = [x0, y0]
  const b: Pt = [x1, y1]
  const au = (g: number, t: number): Pt => (horizontal ? [x0 + (x1 - x0) * g, y0 + (y1 - y0) * t] : [x0 + (x1 - x0) * t, y0 + (y1 - y0) * g])
  let segments: Segment[]
  switch (style) {
    case 'droite':
      segments = [['L', a, b]]
      break
    case 'organique':
      segments = [['Q', a, au(0.2, 1), b]]
      break
    case 'anse':
      segments = [['C', a, au(0.75, 0), au(0.5, 1), b]]
      break
    case 'pli': {
      segments = [['L', a, au(2 / 3, 1)], ['L', au(2 / 3, 1), b]]
      break
    }
    case 'pli-arrondi': {
      const c = au(0.5, 1)
      const rayon = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2
      const [debut, fin] = [coin(c, a, rayon), coin(c, b, rayon / 2)]
      segments = [['L', a, debut], ['Q', debut, c, fin], ['L', fin, b]]
      break
    }
  }
  return radial ? horsDuCadre(segments, p) : { segments, debut: 0 }
}

/** Le trajet d'une branche, quelle que soit sa forme ; `null` pour « aucune » et les troncs d'arbre. */
export function trajetBranche(p: Boite, e: Boite, cote: Cote, style: StyleBranche | 'arbre' | 'arbre-g', s: Soulignes = {}): Trajet | null {
  if (style === 'aucune' || style === 'arbre' || style === 'arbre-g') return null
  if (style === 'droite' || style === 'organique' || style === 'anse' || style === 'pli' || style === 'pli-arrondi') return trajetXmind(p, e, cote, style, s)
  return { segments: segmentsDe(cheminBranche(p, e, cote, style, s)), debut: 0 }
}

// — L'effilé —

/**
 * La largeur d'une branche effilée au départ, en épaisseurs de trait (chez Xmind, de chaque côté 1,8 pour la courbe,
 * 1,5 pour la droite, l'anse et le pli arrondi, 1,2 pour les coudes et le pli) ; à l'arrivée, elle vaut 1.
 */
const DEPART_EFFILE: Record<Exclude<StyleBranche, 'aucune'>, number> = { organique: 3.6, courbe: 3.6, droite: 3, anse: 3, 'pli-arrondi': 3, pli: 2.4, coudee: 2.4, 'coudee-arrondie': 2.4 }

/**
 * La largeur (en épaisseurs) de la branche effilée à chaque sommet de son trajet (un de plus que de segments) : elle
 * décroît linéairement du départ à l'arrivée sur un trait d'un seul segment. Un coude ou un pli garde la largeur du
 * départ jusqu'à son dernier segment, qui seul s'effile ; le pli arrondi passe par 2 à son coin.
 */
export function largeursEffile(style: Exclude<StyleBranche, 'aucune'>, segments: number): number[] {
  const depart = DEPART_EFFILE[style]
  if (style === 'pli-arrondi' && segments === 3) return [depart, 2, 2, 1]
  return Array.from({ length: segments + 1 }, (_, i) => (segments === 1 ? (i === 0 ? depart : 1) : i < segments ? depart : 1))
}

/**
 * Une branche effilée (docs/XMIND.md § 5) : un trait plein dont la largeur décroît le long du trajet, du parent à
 * l'enfant, comme chez Xmind (voir `largeursEffile`). `epaisseur` : celle du trait ordinaire. Tracée comme une surface,
 * pour toutes les formes ; `null` pour « aucune » et les troncs d'arbre, qui gardent un trait.
 */
export function cheminEffile(p: Boite, e: Boite, cote: Cote, style: StyleBranche | 'arbre' | 'arbre-g', s: Soulignes, epaisseur: number): string | null {
  const t = trajetBranche(p, e, cote, style, s)
  if (!t || t.segments.length === 0 || style === 'aucune' || style === 'arbre' || style === 'arbre-g') return null
  const largeurs = largeursEffile(style, t.segments.length)
  // Un départ caché sous le central : la branche y a déjà commencé à s'amincir.
  largeurs[0] = largeurs[0]! + (largeurs[1]! - largeurs[0]!) * t.debut
  const gauche: string[] = []
  const droite: string[] = []
  for (const [i, g] of t.segments.entries()) {
    const pas = g[0] === 'L' ? 1 : 14
    for (let k = 0; k <= pas; k++) {
      const u = k / pas
      const [x, y] = pointDe(g, u)
      const [dx, dy] = tangente(g, u)
      const long = Math.hypot(dx, dy) || 1
      const w = (epaisseur * (largeurs[i]! + (largeurs[i + 1]! - largeurs[i]!) * u)) / 2
      gauche.push(`${n(x - (dy / long) * w)} ${n(y + (dx / long) * w)}`)
      droite.push(`${n(x + (dy / long) * w)} ${n(y - (dx / long) * w)}`)
    }
  }
  return `M${gauche.join('L')}L${droite.reverse().join('L')}Z`
}
