/**
 * Ce que le morphing de Xmind (`magicMove`, relevé 10 § 7.3) décide avant de bouger quoi que ce soit : quelles unités
 * de texte se répondent d'une diapositive à l'autre, quel déplacement mène une boîte à une autre, si une image est
 * assez visible pour glisser, quel décor répond à quel décor, et comment un tracé devient un autre. Tout est pur et se
 * calcule en px de base de la diapositive ; `jouer.ts` mesure, `transitions.ts` planifie.
 */

export interface Rect {
  x: number
  y: number
  l: number
  h: number
}

export type Point = readonly [number, number]

/** Un mot posé (ou un marqueur, `marqueur` vrai) : son texte, sa boîte, sa ligne dans le rendu, sa police et sa couleur. */
export interface Mot {
  texte: string
  rect: Rect
  ligne: number
  /** La police complète (style, graisse, taille, famille) : deux mots de même police ne changent pas de forme. */
  police: string
  couleur: string
  marqueur?: boolean
}

/**
 * Une unité du morphing de texte : des mots consécutifs d'une même ligne d'un côté (`a`), de l'autre (`b`), ou des deux.
 * Les indices sont ceux des mots de chaque rendu.
 */
export interface Unite {
  a?: number[]
  b?: number[]
}

const memeTexte = (a: readonly Mot[], b: readonly Mot[]) => a.length === b.length && a.every((m, i) => m.texte === b[i]!.texte)

/**
 * Les unités de deux rendus d'un texte (`314 · 21948`). Même texte des deux côtés : des segments, coupés là où l'un ou
 * l'autre rendu passe à la ligne, si bien que chaque segment tient sur une ligne de chaque côté. Textes différents :
 * mot à mot, appariés par différence (la plus longue sous-suite commune) ; les mots sans partenaire sont seuls.
 */
export function apparierUnites(a: readonly Mot[], b: readonly Mot[]): Unite[] {
  if (a.length && memeTexte(a, b)) {
    const unites: Unite[] = []
    let debut = 0
    for (let i = 1; i <= a.length; i++) {
      // Un marqueur reste une unité à lui : il ne se fond pas dans les mots qui l'entourent.
      const coupe = i === a.length || a[i]!.ligne !== a[i - 1]!.ligne || b[i]!.ligne !== b[i - 1]!.ligne || !!a[i]!.marqueur || !!a[i - 1]!.marqueur || a[i]!.police !== a[i - 1]!.police || b[i]!.police !== b[i - 1]!.police
      if (!coupe) continue
      const ix = Array.from({ length: i - debut }, (_, k) => debut + k)
      unites.push({ a: ix, b: ix })
      debut = i
    }
    return unites
  }
  // La plus longue sous-suite commune, en table : les titres font quelques dizaines de mots.
  const n = a.length
  const m = b.length
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i]![j] = a[i]!.texte === b[j]!.texte ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!)
  const unites: Unite[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i]!.texte === b[j]!.texte) unites.push({ a: [i++], b: [j++] })
    else if (j >= m || (i < n && t[i + 1]![j]! >= t[i]![j + 1]!)) unites.push({ a: [i++] })
    else unites.push({ b: [j++] })
  }
  return unites
}

/** La plus petite boîte qui contient toutes celles-ci. */
export function union(rects: readonly Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, l: 0, h: 0 }
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.l))
  const y2 = Math.max(...rects.map((r) => r.y + r.h))
  return { x, y, l: x2 - x, h: y2 - y }
}

/** Translation et échelle (origine au coin haut gauche) qui posent la boîte `de` sur la boîte `a`. */
export interface Deplacement {
  x: number
  y: number
  sx: number
  sy: number
}

export const IMMOBILE: Deplacement = { x: 0, y: 0, sx: 1, sy: 1 }

const rapport = (a: number, b: number) => (b > 0.01 && a > 0.01 ? a / b : 1)

/**
 * Ce qui pose la boîte `de` sur la boîte `a`. `uniforme` : l'échelle des largeurs sur les deux axes (les images ne se
 * déforment pas, relevé 10 § 7.3) ; sinon chaque axe la sienne (une unité de texte s'étire).
 */
export function deplacement(de: Rect, a: Rect, uniforme = false): Deplacement {
  const sx = rapport(a.l, de.l)
  const sy = uniforme ? sx : rapport(a.h, de.h)
  return { x: a.x - de.x, y: a.y - de.y, sx, sy }
}

/** La part de la boîte qu'on voit à travers les fenêtres données (la diapositive, les zones qui défilent). */
export function partVisible(r: Rect, fenetres: readonly Rect[]): number {
  const aire = r.l * r.h
  if (aire <= 0) return 0
  let x1 = r.x
  let y1 = r.y
  let x2 = r.x + r.l
  let y2 = r.y + r.h
  for (const f of fenetres) {
    x1 = Math.max(x1, f.x)
    y1 = Math.max(y1, f.y)
    x2 = Math.min(x2, f.x + f.l)
    y2 = Math.min(y2, f.y + f.h)
  }
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1) / aire
}

/** Une image glisse si on en voit plus de 90 % des deux côtés (relevé 10 § 7.3). */
export const SEUIL_IMAGE = 0.9

/** Le sort d'une image présente des deux côtés. */
export type SortImage = 'glisse' | 'croise' | 'sort' | 'entre' | 'rien'

/**
 * Même source, assez visible des deux côtés : elle glisse ; sources différentes : les deux se croisent ; une seule
 * assez visible : elle sort ou entre en fondu.
 */
export function sortDImage(a: { image: string; visible: number; opacite: number }, b: { image: string; visible: number; opacite: number }): SortImage {
  const va = a.visible > SEUIL_IMAGE && a.opacite > 0
  const vb = b.visible > SEUIL_IMAGE && b.opacite > 0
  if (va && vb) return a.image === b.image ? 'glisse' : 'croise'
  if (va) return 'sort'
  if (vb) return 'entre'
  return 'rien'
}

// — Les décors —

/** La place d'un décor : le centre (le `translate` du groupe), la rotation et l'échelle (le groupe intérieur). */
export interface Transfo {
  cx: number
  cy: number
  rotation: number
  sx: number
  sy: number
}

/** Lit `translate(x y)` et `rotate(r) scale(sx sy)` des groupes d'un décor ; ce qui manque vaut l'identité. */
export function lireTransfo(externe: string | null, interne: string | null): Transfo {
  const nombres = (s: string | undefined) => (s ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
  const t = nombres(/translate\(([^)]*)\)/.exec(externe ?? '')?.[1])
  const r = nombres(/rotate\(([^)]*)\)/.exec(interne ?? '')?.[1])
  const s = nombres(/scale\(([^)]*)\)/.exec(interne ?? '')?.[1])
  return { cx: t[0] ?? 0, cy: t[1] ?? 0, rotation: r[0] ?? 0, sx: s[0] ?? 1, sy: s[1] ?? s[0] ?? 1 }
}

export const ecrireExterne = (t: Pick<Transfo, 'cx' | 'cy'>) => `translate(${t.cx} ${t.cy})`
export const ecrireInterne = (t: Pick<Transfo, 'rotation' | 'sx' | 'sy'>) => `rotate(${t.rotation}) scale(${t.sx} ${t.sy})`

/**
 * Les décors qui se répondent : même forme au même rang, sinon une forme unique de son nom des deux côtés. Les paires
 * sont des indices dans `a` et `b`.
 */
export function apparierDecors(a: readonly { nom: string; rang: number }[], b: readonly { nom: string; rang: number }[]): [number, number][] {
  const paires: [number, number][] = []
  const prisA = new Set<number>()
  const prisB = new Set<number>()
  b.forEach((y, j) => {
    const i = a.findIndex((x, k) => !prisA.has(k) && x.nom === y.nom && x.rang === y.rang)
    if (i >= 0) (paires.push([i, j]), prisA.add(i), prisB.add(j))
  })
  const compte = (l: readonly { nom: string }[], nom: string) => l.filter((x) => x.nom === nom).length
  b.forEach((y, j) => {
    if (prisB.has(j) || compte(b, y.nom) !== 1 || compte(a, y.nom) !== 1) return
    const i = a.findIndex((x) => x.nom === y.nom)
    if (i >= 0 && !prisA.has(i)) (paires.push([i, j]), prisA.add(i), prisB.add(j))
  })
  return paires
}

/** Le coin hors du cadre d'où arrive un décor : le plus proche de son centre (relevé 10 § 7.3, défaut du dissolve). */
export function horsChamp(r: Rect, l: number, h: number): { dx: number; dy: number } {
  const dx = r.x + r.l / 2 < l / 2 ? -(r.x + r.l) : l - r.x
  const dy = r.y + r.h / 2 < h / 2 ? -(r.y + r.h) : h - r.y
  return { dx, dy }
}

// — Les tracés —

/** Un tracé échantillonné, en px de base de la diapositive, avec son trait et ses couleurs. */
export interface Trace {
  points: Point[]
  ferme: boolean
  trait: number
  contour: string
  remplissage: string
  opacite: number
}

/** `n` points régulièrement espacés le long d'une ligne brisée. */
export function reechantillonner(points: readonly Point[], n: number): Point[] {
  if (points.length === 0) return []
  if (points.length === 1 || n <= 1) return Array.from({ length: Math.max(1, n) }, () => points[0]!)
  const cumul = [0]
  for (let i = 1; i < points.length; i++) cumul.push(cumul[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]))
  const total = cumul.at(-1)!
  const sortie: Point[] = []
  let k = 1
  for (let i = 0; i < n; i++) {
    const s = (total * i) / (n - 1)
    while (k < points.length - 1 && cumul[k]! < s) k++
    const s0 = cumul[k - 1]!
    const s1 = cumul[k]!
    const u = s1 > s0 ? (s - s0) / (s1 - s0) : 0
    const p = points[k - 1]!
    const q = points[k]!
    sortie.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u])
  }
  return sortie
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Les points de `a` vers ceux de `b` au temps t ; les deux sont remis au même nombre de points. */
export function interpolerPoints(a: readonly Point[], b: readonly Point[], t: number): Point[] {
  const n = Math.max(a.length, b.length)
  const pa = a.length === n ? a : reechantillonner(a, n)
  const pb = b.length === n ? b : reechantillonner(b, n)
  return pa.map((p, i) => [lerp(p[0], pb[i]![0], t), lerp(p[1], pb[i]![1], t)] as const)
}

/** Le chemin SVG d'une ligne brisée. */
export function chemin(points: readonly Point[], ferme: boolean): string {
  if (!points.length) return ''
  const r = (x: number) => Math.round(x * 100) / 100
  return points.map((p, i) => `${i ? 'L' : 'M'}${r(p[0])} ${r(p[1])}`).join('') + (ferme ? 'Z' : '')
}

// — Les couleurs —

export type RVBA = [number, number, number, number]

/** Une couleur CSS calculée (`rgb()`, `rgba()`, `#rgb`, `#rrggbb`, `#rrggbbaa`, `transparent`) ; `null` sinon. */
export function lireCouleur(c: string | undefined): RVBA | null {
  if (!c) return null
  const s = c.trim().toLowerCase()
  if (s === 'transparent') return [0, 0, 0, 0]
  const f = /^rgba?\(([^)]*)\)$/.exec(s)
  if (f) {
    const v = f[1]!.split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? Number.parseFloat(x) / 100 : Number.parseFloat(x)))
    if (v.length < 3 || v.some(Number.isNaN)) return null
    return [v[0]!, v[1]!, v[2]!, v[3] ?? 1]
  }
  const h = /^#([0-9a-f]{3,8})$/.exec(s)?.[1]
  if (!h || ![3, 4, 6, 8].includes(h.length)) return null
  const long = h.length <= 4 ? [...h].map((x) => x + x).join('') : h
  const o = (i: number) => Number.parseInt(long.slice(i, i + 2), 16)
  return [o(0), o(2), o(4), long.length === 8 ? o(6) / 255 : 1]
}

/** Le mélange de deux couleurs au temps t, en `rgba()` ; la seconde si l'une ne se lit pas. */
export function melanger(a: string, b: string, t: number): string {
  const x = lireCouleur(a)
  const y = lireCouleur(b)
  if (!x || !y) return t < 1 ? a : b
  const c = x.map((v, i) => lerp(v, y[i]!, t))
  return `rgba(${Math.round(c[0]!)}, ${Math.round(c[1]!)}, ${Math.round(c[2]!)}, ${Math.round(c[3]! * 1000) / 1000})`
}

/** Un tracé entre deux tracés au temps t : les points, le trait, les couleurs et l'opacité. */
export function traceA(a: Trace, b: Trace, t: number): { d: string; trait: number; contour: string; remplissage: string; opacite: number } {
  return {
    d: chemin(interpolerPoints(a.points, b.points, t), t < 0.5 ? a.ferme : b.ferme),
    trait: lerp(a.trait, b.trait, t),
    contour: melanger(a.contour, b.contour, t),
    remplissage: melanger(a.remplissage, b.remplissage, t),
    opacite: lerp(a.opacite, b.opacite, t),
  }
}

// — L'agrandissement d'une image (relevé 12 § 8.5) —

/** La marge de l'image agrandie, sur l'axe qui la limite. */
export const MARGE_ZOOM = 72

/** Où l'image agrandie se pose : la plus grande qui tient dans la scène, à 72 px des bords sur l'axe limitant, centrée. */
export function cadreDuZoom(image: { l: number; h: number }, scene: { l: number; h: number }, marge = MARGE_ZOOM): Rect {
  if (image.l <= 0 || image.h <= 0) return { x: scene.l / 2, y: scene.h / 2, l: 0, h: 0 }
  const k = Math.max(0, Math.min((scene.l - 2 * marge) / image.l, (scene.h - 2 * marge) / image.h)) + 0.001
  const l = image.l * k
  const h = image.h * k
  return { x: (scene.l - l) / 2, y: (scene.h - h) / 2, l, h }
}

/** Un fond est sombre sous 127,5 de luminance : le voile du zoom est noir, sa croix blanche ; blanc et foncée sinon. */
export function fondSombre(couleur: string | undefined): boolean {
  const c = lireCouleur(couleur)
  if (!c) return true
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 127.5
}
