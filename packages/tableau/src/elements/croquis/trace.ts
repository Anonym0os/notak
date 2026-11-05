import { type Croquis, type Element, type Trait, nouvelId } from '../../coeur/tableau'
import { getStroke } from 'perfect-freehand'
import type { SVGProps } from 'react'
import { t, tn } from '../../langue'

/** La feuille sur laquelle on dessine, en unités de feuille (le rendu la met à l'échelle). */
export const LARGEUR_FEUILLE = 640
/** La hauteur des feuilles d'avant les proportions de 1,63 : un croquis sans `hauteur` la garde. */
export const HAUTEUR_FEUILLE = 480
/** La hauteur d'une feuille neuve : rapport de 1,63 (3400 × 2090). */
export const HAUTEUR_FEUILLE_NEUVE = 393
export const LARGEUR_CROQUIS = 34

/** Un croquis, avec la hauteur de sa feuille (absente : 480, celle des croquis d'avant). */
export type CroquisFeuille = Croquis & { hauteur?: number }
export const hauteurFeuille = (c: CroquisFeuille): number => (c.hauteur && c.hauteur > 0 ? c.hauteur : HAUTEUR_FEUILLE)

/** L'encre par défaut, puis les couleurs proposées, dans l'ordre de la palette. */
export const COULEURS_TRAIT = [
  '#323b4a',
  '#bbbec3',
  '#62dbc8',
  '#7cd651',
  '#d58558',
  '#ffd14d',
  '#ff8d48',
  '#ff5757',
  '#ff6ed4',
  '#ad6fff',
  '#4ebafd',
  '#5882f8',
  '#ffffff',
] as const

/** L'encre par défaut. */
export const ENCRE_DEFAUT = COULEURS_TRAIT[0]

/**
 * La couleur dont un trait se dessine. Sur un fond qui suit le thème (un croquis transparent, un dessin sur la toile),
 * l'encre par défaut suit la couleur de ligne du thème, qui s'inverse en sombre ; le trait garde `#323b4a` dans le
 * document. Partout ailleurs, la couleur écrite.
 */
export const couleurAffichee = (couleur: string, suitLeTheme: boolean): string =>
  suitLeTheme && couleur.toLowerCase() === ENCRE_DEFAUT ? 'var(--notak-trait-defaut)' : couleur

/** Les épaisseurs, en pixels d'écran : le trait garde la même allure quelle que soit la taille de la fenêtre. */
export const EPAISSEURS_TRAIT = [
  { get libelle() { return t('croquis.fin') }, px: 2 },
  { get libelle() { return t('croquis.moyen') }, px: 4 },
  { get libelle() { return t('croquis.epais') }, px: 8 },
  { get libelle() { return t('croquis.tresEpais') }, px: 32 },
] as const
export const EPAISSEUR_DEFAUT = 1

/** Les épaisseurs du surligneur, en pixels d'écran : larges, comme un feutre fluo. */
export const EPAISSEURS_SURLIGNEUR = [
  { get libelle() { return t('croquis.fin') }, px: 10 },
  { get libelle() { return t('croquis.moyen') }, px: 18 },
  { get libelle() { return t('croquis.epais') }, px: 28 },
  { get libelle() { return t('croquis.tresEpais') }, px: 44 },
] as const
/** Le surligneur commence jaune, moyen. */
export const COULEUR_SURLIGNEUR_DEFAUT = '#ffd14d'

/** L'épaisseur à ranger dans le trait : des pixels d'écran ramenés aux unités de la feuille. `echelle` : pixels par unité. */
export const epaisseurFeuille = (px: number, echelle: number): number => arrondi(px / (echelle > 0 ? echelle : 1))

export const nouveauCroquis = (x: number, y: number): Element<CroquisFeuille> => ({
  id: nouvelId(),
  x,
  y,
  largeur: LARGEUR_CROQUIS,
  contenu: { type: 'croquis', traits: [], hauteur: HAUTEUR_FEUILLE_NEUVE },
})

/** Arrondi au centième : assez fin pour un tracé, assez court pour ne pas alourdir le document. */
const arrondi = (v: number) => Math.round(v * 100) / 100

/** Les points ramenés au centième. */
export const arrondir = (points: readonly number[]): number[] => points.map(arrondi)

/** Le point suivant d'un tracé en cours ; tous sont gardés, sauf un doublon exact du dernier (le tracé reste alors inchangé). */
export function ajouterPoint(points: readonly number[], x: number, y: number): number[] {
  const n = points.length
  if (n >= 2 && x === points[n - 2] && y === points[n - 1]) return points as number[]
  return [...points, x, y]
}

/**
 * La pression d'un appui de stylet, à garder dans le trait ; `null` pour la souris et le doigt (leur pression ne dit
 * rien : 0,5 ou 0 tant qu'on appuie). Un stylet posé à peine donne 0 au premier contact : un plancher garde le trait visible.
 */
export const pressionDe = (e: { pointerType: string; pressure: number }): number | null =>
  e.pointerType === 'pen' ? Math.max(0.05, Math.min(1, Number.isFinite(e.pressure) ? e.pressure : 0.5)) : null

/** Les pressions ramenées au centième, comme les points. */
export const arrondirPressions = (pressions: readonly number[]): number[] => pressions.map((p) => Math.round(p * 100) / 100)

/** Les pressions d'un trait, si elles vont avec ses points (une par point) ; sinon rien, la vitesse en tiendra lieu. */
export const pressionsDe = (t: Pick<Trait, 'points' | 'pressions'>): number[] | undefined =>
  t.pressions && t.pressions.length * 2 === t.points.length ? t.pressions : undefined

type Appui = { pointerType: string; pressure: number }

/** Un tracé en cours : ses points et, au stylet, la pression de chacun. */
export interface TraceEnCours {
  points: number[]
  pressions: number[] | null
}

export function commencerTrace(x: number, y: number, e: Appui): TraceEnCours {
  const p = pressionDe(e)
  return { points: [x, y], pressions: p === null ? null : [p] }
}

/** Le tracé prolongé d'un point ; le même objet si c'est un doublon du dernier. Les reculs, `epurer` les écarte au dessin. */
export function prolongerTrace(t: TraceEnCours, x: number, y: number, e: Appui): TraceEnCours {
  const points = ajouterPoint(t.points, x, y)
  if (points === t.points) return t
  return { points, pressions: t.pressions && [...t.pressions, pressionDe(e) ?? t.pressions[t.pressions.length - 1]!] }
}

/** Le trait qu'un tracé laisse, ses nombres ramenés au centième. `surligneur` : un trait translucide d'épaisseur constante. */
export function traitFini(t: TraceEnCours, couleur: string, epaisseur: number, affinage: number, surligneur = false): Trait {
  if (surligneur) return { points: arrondir(t.points), couleur, epaisseur, surligneur: true }
  return {
    points: arrondir(t.points),
    couleur,
    epaisseur,
    ...(affinage ? { affinage } : {}),
    ...(t.pressions && affinage ? { pressions: arrondirPressions(t.pressions) } : {}),
  }
}

/** Distance du point (px, py) au segment [(ax, ay), (bx, by)]. */
export function distanceSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const carre = dx * dx + dy * dy
  const t = carre === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / carre))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const nb = (v: number) => String(arrondi(v))

/**
 * Le tracé lissé, en chemin SVG : chaque point du tracé sert de point de contrôle à une quadratique qui finit au
 * milieu du segment suivant (des courbes bout à bout, sans cassure aux jonctions) ; le dernier segment est droit.
 */
export function cheminLisse(points: readonly number[]): string {
  const n = points.length / 2
  if (n === 0) return ''
  const p = (i: number) => [points[2 * i]!, points[2 * i + 1]!] as const
  const [x0, y0] = p(0)
  if (n === 1) return `M${nb(x0)} ${nb(y0)}l0 0.01`
  let d = `M${nb(x0)} ${nb(y0)}`
  for (let i = 1; i < n - 1; i++) {
    const [cx, cy] = p(i)
    const [sx, sy] = p(i + 1)
    d += `Q${nb(cx)} ${nb(cy)} ${nb((cx + sx) / 2)} ${nb((cy + sy) / 2)}`
  }
  const [xn, yn] = p(n - 1)
  return `${d}L${nb(xn)} ${nb(yn)}`
}

/**
 * L'effet d'encre, comme Milanote : un trait neuf s'amincit quand le geste va vite et s'épaissit quand il ralentit.
 * Le très épais n'en a pas : il sert à remplir des aplats.
 */
export const AFFINAGE = 0.6
export const affinageDe = (indiceEpaisseur: number): number => (indiceEpaisseur === EPAISSEURS_TRAIT.length - 1 ? 0 : AFFINAGE)
/** Un trait affiné est deux fois plus large qu'un trait constant de même réglage, à vitesse moyenne. */
const LARGEUR_ENCRE = 2
/** L'épaisseur à laquelle le contour se calcule : celle du trait moyen à l'écran, où le rendu en direct est juste. */
const EPAISSEUR_CONTOUR = 4

/** Les points du contour, en chemin SVG fermé : des quadratiques qui passent par le milieu de chaque côté. */
function cheminContour(contour: readonly number[][]): string {
  const n = contour.length
  if (n < 3) return ''
  const milieu = (a: number[], b: number[]) => `${nb((a[0]! + b[0]!) / 2)} ${nb((a[1]! + b[1]!) / 2)}`
  let d = `M${milieu(contour[0]!, contour[1]!)}Q`
  for (let i = 1; i <= n; i++) {
    const a = contour[i % n]!
    d += `${nb(a[0]!)} ${nb(a[1]!)} ${milieu(a, contour[(i + 1) % n]!)} `
  }
  return `${d.trimEnd()}Z`
}

/**
 * Ce qu'un stylet envoie n'est pas un trait propre : l'Apple Pencil donne 240 points par seconde, que WebKit regroupe
 * par image (`getCoalescedEvents`) ; ces paquets ramènent parfois un point déjà passé, une poussière de recul, et leurs
 * points groupés n'ont pas toujours de pression (0, gardée comme le plancher de `pressionDe`). Le contour d'encre
 * prend chaque recul pour un virage serré et y pose un bout rond : le trait se hachait en chapelet de pointillés.
 *
 * `epurer` rend le tracé qu'on a voulu faire : les points trop serrés (moins d'un quart d'épaisseur) se fondent ; un
 * point qui recule est écarté s'il est court (moins de deux épaisseurs, la poussière d'une pointe presque immobile), ou
 * s'il retombe sur le chemin déjà tracé et que le stylet repart en avant dans les points d'après (un point déjà passé,
 * renvoyé ; son recul grandit avec la vitesse, d'où un seuil qui ne dépend pas d'elle). Un vrai virage, lui, continue
 * dans le nouveau sens : il reste. Les pressions manquantes prennent celle de leurs voisines et toutes sont lissées sur
 * cinq points. `enCours` : le trait se trace encore ; un recul tout au bout, dont la suite n'est pas arrivée, attend
 * d'être confirmé avant de compter (sinon un bout rond clignote à la pointe). Rien n'est réécrit dans le document : le trait enregistré garde ses points, et un trait d'avant se
 * redessine propre.
 */
export function epurer(points: readonly number[], epaisseur: number, pressions?: readonly number[], enCours = false): { points: number[]; pressions?: number[] } {
  const n = points.length / 2
  const avecPression = !!pressions && pressions.length === n
  if (n < 3) return { points: [...points], ...(avecPression ? { pressions: pressionsPropres(pressions) } : {}) }
  const pas = Math.max(epaisseur * 0.25, 1e-6)
  const recul = epaisseur * 2
  const pres = Math.max(epaisseur * 0.5, pas)
  const garde: number[] = [points[0]!, points[1]!]
  const indices: number[] = [0]
  let dx0 = 0
  let dy0 = 0
  /** Le point (x, y) est-il sur le chemin gardé, parmi ses derniers segments ? */
  const surLeChemin = (x: number, y: number) => {
    const m = garde.length / 2
    for (let k = m - 1; k >= Math.max(1, m - REGARD_CHEMIN); k--) {
      if (distanceSegment(x, y, garde[2 * k - 2]!, garde[2 * k - 1]!, garde[2 * k]!, garde[2 * k + 1]!) <= pres) return true
    }
    return false
  }
  /** Le stylet repart-il en avant du dernier point gardé (sens `dx0`, `dy0`) dans les points qui suivent `i` ? */
  const repartEnAvant = (i: number, lx: number, ly: number) => {
    for (let j = i + 1; j < Math.min(n, i + 1 + REGARD_SUITE); j++) {
      if ((points[2 * j]! - lx) * dx0 + (points[2 * j + 1]! - ly) * dy0 > 0) return true
    }
    return enCours && i + REGARD_SUITE >= n
  }
  for (let i = 1; i < n; i++) {
    const x = points[2 * i]!
    const y = points[2 * i + 1]!
    const lx = garde[garde.length - 2]!
    const ly = garde[garde.length - 1]!
    const dx = x - lx
    const dy = y - ly
    const d = Math.hypot(dx, dy)
    if (d < pas) continue
    if (dx * dx0 + dy * dy0 < 0 && (d < recul || (surLeChemin(x, y) && repartEnAvant(i, lx, ly)))) continue
    garde.push(x, y)
    indices.push(i)
    dx0 = dx
    dy0 = dy
  }
  // Le dernier point est celui où le stylet s'est levé : on finit là, sauf s'il n'était qu'un recul.
  if (indices.length === 1) {
    garde.push(points[2 * n - 2]!, points[2 * n - 1]!)
    indices.push(n - 1)
  }
  if (!avecPression) return { points: garde }
  // Chaque point gardé prend la pression la plus forte de ceux qu'il a absorbés : un appui ne se perd pas.
  const propres = pressionsPropres(pressions)
  const fondues = indices.map((debut, k) => {
    const fin = k + 1 < indices.length ? indices[k + 1]! : n
    let p = 0
    for (let j = debut; j < fin; j++) p = Math.max(p, propres[j]!)
    return p
  })
  return { points: garde, pressions: lisserPressions(fondues) }
}

/** Combien de points on regarde après un recul (25 ms au Pencil), et combien de segments du chemin déjà tracé. */
const REGARD_SUITE = 6
const REGARD_CHEMIN = 12

/** En dessous, une pression ne dit rien : le premier contact, ou un point groupé que WebKit n'a pas renseigné. */
const PRESSION_MUETTE = 0.05

/** Les pressions muettes prennent celle du point renseigné le plus proche avant (ou après, en début de trait). */
function pressionsPropres(pressions: readonly number[]): number[] {
  const r = [...pressions]
  let derniere = r.find((p) => p > PRESSION_MUETTE) ?? 0.5
  for (let i = 0; i < r.length; i++) {
    if (r[i]! > PRESSION_MUETTE && Number.isFinite(r[i])) derniere = r[i]!
    else r[i] = derniere
  }
  return r
}

/** Une moyenne glissante sur cinq points : la largeur suit l'appui sans trembler d'un point à l'autre. */
function lisserPressions(pressions: readonly number[]): number[] {
  const n = pressions.length
  return pressions.map((_, i) => {
    let somme = 0
    let nb = 0
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      somme += pressions[j]!
      nb++
    }
    return somme / nb
  })
}

/** La transparence d'un trait de surligneur : l'encre dessous se lit au travers, deux passages foncent. */
export const OPACITE_SURLIGNEUR = 0.4

/**
 * Le dessin d'un trait : un contour plein pour un trait affiné, une ligne lissée à tracer de son épaisseur sinon.
 * `pressions` (le stylet) : la largeur suit l'appui. Sans elles, elle suit la vitesse. Le tracé passe d'abord par
 * `epurer`. `surligneur` : une ligne d'épaisseur constante, translucide.
 */
export type DessinTrait = { d: string; plein: boolean; epaisseur: number; surligneur?: boolean }
export function dessinTrait(
  points: readonly number[],
  epaisseur: number,
  affinage = 0,
  fini = true,
  pressions?: readonly number[],
  surligneur = false,
): DessinTrait {
  const propre = epurer(points, epaisseur, pressions, !fini)
  const constant = (): DessinTrait => ({ d: cheminLisse(propre.points), plein: false, epaisseur, ...(surligneur ? { surligneur: true } : {}) })
  if (surligneur || !affinage || propre.points.length < 4) return constant()
  const pts = propre.points
  const pr = propre.pressions
  // Le contour se calcule toujours à la même échelle, l'épaisseur ramenée à EPAISSEUR_CONTOUR : perfect-freehand a
  // des seuils en unités absolues (il saute les points à moins de 3 unités du bout), invisibles en pixels d'écran
  // mais qui, en UG (un dessin posé), avalaient la barre d'un E et n'en laissaient qu'une tache.
  const f = epaisseur > 0 ? EPAISSEUR_CONTOUR / epaisseur : 1
  const paires: number[][] = []
  for (let i = 0; i < pts.length; i += 2) paires.push(pr ? [pts[i]! * f, pts[i + 1]! * f, pr[i / 2]!] : [pts[i]! * f, pts[i + 1]! * f])
  const contour = getStroke(paires, { size: epaisseur * f * LARGEUR_ENCRE, thinning: affinage, smoothing: 0.5, streamline: 0.4, simulatePressure: !pr, last: fini })
  const d = cheminContour(contour.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([x, y]) => [x! / f, y! / f]))
  return d ? { d, plein: true, epaisseur } : constant()
}

/** Le dessin d'un trait du document, à l'échelle `k` (et décalé de `-ox`, `-oy` avant) : ce que montrent les rendus. */
export function dessinDuTrait(tr: Trait, fini = true, k = 1, ox = 0, oy = 0): DessinTrait {
  const points = k === 1 && ox === 0 && oy === 0 ? tr.points : tr.points.map((v, i) => (v - (i % 2 === 0 ? ox : oy)) * k)
  return dessinTrait(points, tr.epaisseur * k, tr.affinage, fini, pressionsDe(tr), !!tr.surligneur)
}

/** Les attributs SVG d'un trait dessiné en `couleur`, élargi de `deborde` (un contour de choix ou de gomme). */
export function attributsTrait(dt: DessinTrait, couleur: string, deborde = 0): SVGProps<SVGPathElement> {
  const commun = { d: dt.d, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (dt.plein) return { ...commun, fill: couleur, stroke: deborde > 0 ? couleur : 'none', strokeWidth: deborde > 0 ? deborde : undefined }
  return {
    ...commun,
    fill: 'none',
    stroke: couleur,
    strokeWidth: dt.epaisseur + deborde,
    ...(dt.surligneur && deborde === 0 ? { strokeOpacity: OPACITE_SURLIGNEUR } : {}),
  }
}

/** Un trait en balise SVG autonome, pour les téléchargements. */
export function traitEnSvg(tr: Trait): string {
  const dt = dessinDuTrait(tr)
  return dt.plein
    ? `<path d="${dt.d}" fill="${tr.couleur}"/>`
    : `<path d="${dt.d}" fill="none" stroke="${tr.couleur}" stroke-width="${tr.epaisseur}" stroke-linecap="round" stroke-linejoin="round"${dt.surligneur ? ` stroke-opacity="${OPACITE_SURLIGNEUR}"` : ''}/>`
}

/** Un trait touche-t-il le disque de centre (x, y) et de rayon `rayon` ? (Son épaisseur compte.) */
export function toucheTrait(t: Trait, x: number, y: number, rayon: number): boolean {
  const n = t.points.length / 2
  const marge = rayon + t.epaisseur / 2
  if (n === 1) return Math.hypot(x - t.points[0]!, y - t.points[1]!) <= marge
  for (let i = 0; i < n - 1; i++) {
    if (distanceSegment(x, y, t.points[2 * i]!, t.points[2 * i + 1]!, t.points[2 * i + 2]!, t.points[2 * i + 3]!) <= marge) return true
  }
  return false
}

/** La gomme : les traits qui ne touchent pas le disque. Rend le même tableau si elle n'en touche aucun. */
export function gommer(traits: readonly Trait[], x: number, y: number, rayon = 6): Trait[] {
  const reste = traits.filter((t) => !toucheTrait(t, x, y, rayon))
  return reste.length === traits.length ? (traits as Trait[]) : reste
}

/** Le trait que la gomme viserait en (x, y) : le plus haut (le dernier dessiné) qu'elle touche, ou -1. */
export function traitVise(traits: readonly Trait[], x: number, y: number, rayon: number): number {
  for (let i = traits.length - 1; i >= 0; i--) if (toucheTrait(traits[i]!, x, y, rayon)) return i
  return -1
}

/** Ce qu'on garde d'une session à l'autre (dans le navigateur, quand il le permet). */
export function lireReglage(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}
export function ecrireReglage(cle: string, valeur: string): void {
  try {
    localStorage.setItem(cle, valeur)
  } catch {
    // Stockage fermé : le réglage ne survit pas, rien d'autre ne change.
  }
}

/** Ce qu'on lit d'un croquis dans une liste. */
export function resume(c: Croquis): string {
  const n = c.traits.length
  return n === 0 ? t('croquis.resumeVide') : tn('croquis.resume', n)
}

/** Le croquis en SVG autonome (fond blanc), pour « Télécharger en SVG ». */
export function croquisEnSvg(c: CroquisFeuille): string {
  const h = hauteurFeuille(c)
  const chemins = c.traits.map(traitEnSvg).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR_FEUILLE} ${h}" width="${LARGEUR_FEUILLE}" height="${h}"><rect width="100%" height="100%" fill="#ffffff"/>${chemins}</svg>`
}
