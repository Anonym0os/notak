/**
 * Aligner et répartir : le calcul seul, sans React ni magasin.
 * Tout est en unités de grille (UG). Un élément est donné avec sa position (`x`, `y`, entiers) et son rectangle
 * mesuré, qui peut en différer : une image légendée mesure 17,8 × 32,8 UG (2 px de retrait, 60 px de légende). Les
 * positions restent entières ; un bord qui tombe entre deux points de grille se range à une demi-UG près au plus.
 */
import { type Rect, englobant } from './geometrie'
import type { Id } from './tableau'

export interface Disposable {
  id: Id
  x: number
  y: number
  rect: Rect
}

export type SensAlignement = 'gauche' | 'centre-horizontal' | 'droite' | 'haut' | 'centre-vertical' | 'bas'
export type AxeRepartition = 'horizontal' | 'vertical'

export interface Deplacement {
  id: Id
  de: [number, number]
  vers: [number, number]
}

export const MIN_ALIGNER = 2
export const MIN_REPARTIR = 3

/**
 * Les mesures viennent du DOM, divisées par l'échelle de la toile : 17,799999… ou 17,800001 selon le zoom. Ramenées
 * au dix-millième, deux images pareilles s'arrondissent pareil.
 */
const net = (v: number) => Math.round(v * 1e4) / 1e4
/** En dessous, deux intervalles qui se touchent ne se recouvrent pas. */
const JEU = 0.01

/**
 * La valeur que partagent le plus d'éléments, à `cran` près ; à égalité, la plus proche de `repli` (le bord extrême, ou
 * le centre du groupe). C'est la valeur mesurée d'un élément, pas son arrondi : l'élément de référence ne bouge pas,
 * les autres s'y rangent à une demi-UG près, même quand leurs bords ne tombent pas sur la grille.
 */
function valeurCommune(valeurs: number[], cran: number, repli: number): number {
  const groupes = new Map<number, number[]>()
  for (const v of valeurs) {
    const cle = Math.round(v / cran)
    groupes.set(cle, [...(groupes.get(cle) ?? []), v])
  }
  const meilleur = Math.max(...[...groupes.values()].map((g) => g.length))
  const plusProche = <T>(xs: T[], v: (x: T) => number) => xs.reduce((a, b) => (Math.abs(v(b) - repli) < Math.abs(v(a) - repli) ? b : a))
  const [, groupe] = plusProche([...groupes].filter(([, g]) => g.length === meilleur), ([cle]) => cle * cran)
  return plusProche(groupe, (v) => v)
}

/** Garde seulement ce qui bouge réellement. */
const sansImmobiles = (ds: Deplacement[]) => ds.filter((d) => d.de[0] !== d.vers[0] || d.de[1] !== d.vers[1])

export function aligner(items: Disposable[], sens: SensAlignement): Deplacement[] {
  if (items.length < MIN_ALIGNER) return []
  const horizontal = sens === 'gauche' || sens === 'centre-horizontal' || sens === 'droite'
  const debut = (r: Rect) => net(horizontal ? r.min.x : r.min.y)
  const fin = (r: Rect) => net(horizontal ? r.max.x : r.max.y)
  const auDebut = sens === 'gauche' || sens === 'haut'
  const aLaFin = sens === 'droite' || sens === 'bas'
  // La ligne que chaque élément doit rejoindre : son bord, ou son centre (comparé à la demi-UG).
  const ligne = (r: Rect) => (auDebut ? debut(r) : aLaFin ? fin(r) : (debut(r) + fin(r)) / 2)
  const valeurs = items.map((i) => ligne(i.rect))
  const cadre = englobant(items.map((i) => i.rect))!
  const repli = auDebut ? Math.min(...valeurs) : aLaFin ? Math.max(...valeurs) : (debut(cadre) + fin(cadre)) / 2
  const reference = valeurCommune(valeurs, auDebut || aLaFin ? 1 : 0.5, repli)

  return sansImmobiles(
    items.map((i, k) => {
      const p = Math.round(net((horizontal ? i.x : i.y) + reference - valeurs[k]!))
      return { id: i.id, de: [i.x, i.y], vers: horizontal ? [p, i.y] : [i.x, p] }
    }),
  )
}

/** Ce qui bouge d'un seul tenant le long de l'axe, et la place qu'il y tient. */
interface Bloc {
  membres: Disposable[]
  debut: number
  fin: number
  autre: number
}

/**
 * Les blocs à répartir le long de l'axe, dans l'ordre. Deux éléments empilés en travers de l'axe (qui se recouvrent sur
 * l'axe et se tiennent à distance sur l'autre) font un seul bloc : une colonne d'une grille, quand on répartit en
 * largeur. Une rangée répartie en hauteur n'est ainsi qu'un bloc : rien ne bouge, rien ne se désaligne.
 */
function blocs(items: Disposable[], axe: AxeRepartition): Bloc[] {
  const h = axe === 'horizontal'
  type Intervalle = [number, number]
  const sur = items.map((i): Intervalle => (h ? [net(i.rect.min.x), net(i.rect.max.x)] : [net(i.rect.min.y), net(i.rect.max.y)]))
  const travers = items.map((i): Intervalle => (h ? [net(i.rect.min.y), net(i.rect.max.y)] : [net(i.rect.min.x), net(i.rect.max.x)]))
  const recouvre = (a: Intervalle, b: Intervalle) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > JEU
  const chef = items.map((_, k) => k)
  const racine = (k: number): number => (chef[k] === k ? k : (chef[k] = racine(chef[k]!)))
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (recouvre(sur[a]!, sur[b]!) && !recouvre(travers[a]!, travers[b]!)) chef[racine(b)] = racine(a)
    }
  }
  const parRacine = new Map<number, number[]>()
  items.forEach((_, k) => parRacine.set(racine(k), [...(parRacine.get(racine(k)) ?? []), k]))
  return [...parRacine.values()]
    .map((ks) => ({
      membres: ks.map((k) => items[k]!),
      debut: Math.min(...ks.map((k) => sur[k]![0])),
      fin: Math.max(...ks.map((k) => sur[k]![1])),
      autre: Math.min(...ks.map((k) => travers[k]![0])),
    }))
    .sort((a, b) => a.debut - b.debut || a.fin - b.fin || a.autre - b.autre)
}

/** La place à partager entre les blocs : négative quand ils se chevauchent sur l'axe. */
const vide = (bs: Bloc[]) => Math.max(...bs.map((b) => b.fin)) - bs[0]!.debut - bs.reduce((s, b) => s + b.fin - b.debut, 0)

/** Répartir sur cet axe ferait-il quelque chose ? Il y faut trois blocs qui ne se chevauchent pas. */
export function repartissable(items: Disposable[], axe: AxeRepartition): boolean {
  if (items.length < MIN_REPARTIR) return false
  const bs = blocs(items, axe)
  return bs.length >= MIN_REPARTIR && vide(bs) >= -JEU
}

/** Les axes sur lesquels répartir agit : une rangée ne se répartit qu'en largeur, une colonne qu'en hauteur. */
export const axesRepartissables = (items: Disposable[]): AxeRepartition[] =>
  (['horizontal', 'vertical'] as const).filter((axe) => repartissable(items, axe))

/**
 * Le même écart entre blocs voisins : le premier reste, chacun suit le précédent, comme chez Milanote. Chaque bloc se
 * pose à l'UG la plus proche de sa place exacte, mesurée depuis où le précédent a vraiment fini : l'arrondi ne
 * s'accumule pas, et des éléments de même taille gardent des écarts identiques. Des blocs qui se chevauchent sur l'axe
 * (une rangée qu'on répartirait en hauteur) ne bougent pas, comme chez Figma.
 */
export function repartir(items: Disposable[], axe: AxeRepartition): Deplacement[] {
  if (!repartissable(items, axe)) return []
  const bs = blocs(items, axe)
  const ecart = vide(bs) / (bs.length - 1)
  const h = axe === 'horizontal'
  const resultat: Deplacement[] = []
  let fin = bs[0]!.fin
  for (const b of bs.slice(1)) {
    const d = Math.round(net(fin + ecart - b.debut))
    for (const i of b.membres) resultat.push({ id: i.id, de: [i.x, i.y], vers: h ? [i.x + d, i.y] : [i.x, i.y + d] })
    fin = net(b.fin + d)
  }
  return sansImmobiles(resultat)
}
