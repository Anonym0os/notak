/**
 * Aligner et répartir : le calcul seul, sans React ni magasin.
 * Tout est en unités de grille (UG). Un élément est donné avec sa position (`x`, `y`, entiers)
 * et son rectangle mesuré, qui peut en différer (hauteur fractionnaire, décalage du cadre).
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

/** Le plus fréquent ; à égalité (ou si tout diffère), l'extrême demandé. */
/** La valeur la plus fréquente ; à égalité, la plus proche de `repli` (le bord extrême, ou le centre du groupe). */
function plusFrequent(valeurs: number[], repli: number): number {
  const comptes = new Map<number, number>()
  for (const v of valeurs) comptes.set(v, (comptes.get(v) ?? 0) + 1)
  const meilleur = Math.max(...comptes.values())
  const ex = [...comptes].filter(([, n]) => n === meilleur).map(([v]) => v)
  return ex.reduce((a, b) => (Math.abs(b - repli) < Math.abs(a - repli) ? b : a))
}

/** Garde seulement ce qui bouge réellement. */
const sansImmobiles = (ds: Deplacement[]) => ds.filter((d) => d.de[0] !== d.vers[0] || d.de[1] !== d.vers[1])

export function aligner(items: Disposable[], sens: SensAlignement): Deplacement[] {
  if (items.length < MIN_ALIGNER) return []
  const horizontal = sens === 'gauche' || sens === 'centre-horizontal' || sens === 'droite'
  const debut = (r: Rect) => (horizontal ? r.min.x : r.min.y)
  const fin = (r: Rect) => (horizontal ? r.max.x : r.max.y)

  // `decalage(r)` : la distance du bord (ou du centre) de l'élément à son coin haut-gauche.
  let decalage: (r: Rect) => number
  let reference: number
  if (sens === 'gauche' || sens === 'haut') {
    decalage = () => 0
    const v = items.map((i) => Math.round(debut(i.rect)))
    reference = plusFrequent(v, Math.min(...v))
  } else if (sens === 'droite' || sens === 'bas') {
    decalage = (r) => fin(r) - debut(r)
    const v = items.map((i) => Math.round(fin(i.rect)))
    reference = plusFrequent(v, Math.max(...v))
  } else {
    // Le centre que partagent le plus d'éléments (à la demi-UG) ; sinon celui qui est le plus près du centre du groupe.
    const cadre = englobant(items.map((i) => i.rect))!
    const centres = items.map((i) => Math.round(debut(i.rect) + fin(i.rect)) / 2)
    reference = plusFrequent(centres, (debut(cadre) + fin(cadre)) / 2)
    decalage = (r) => (fin(r) - debut(r)) / 2
  }

  return sansImmobiles(
    items.map((i) => {
      const ecart = reference - decalage(i.rect) - debut(i.rect)
      const vers: [number, number] = horizontal ? [Math.round(i.x + ecart), i.y] : [i.x, Math.round(i.y + ecart)]
      return { id: i.id, de: [i.x, i.y], vers }
    }),
  )
}

/** L'écart entre deux éléments voisins : au moins 1 UG s'il y a de la place, arrondi vers le haut. */
export function ecartRepartition(videTotal: number, intervalles: number): number {
  const brut = videTotal / intervalles
  const e = Math.ceil(brut)
  if (brut > 0) return Math.max(1, e)
  return e === 0 ? 0 : e // -0 devient 0
}

export function repartir(items: Disposable[], axe: AxeRepartition): Deplacement[] {
  if (items.length < MIN_REPARTIR) return []
  const h = axe === 'horizontal'
  const debut = (r: Rect) => (h ? r.min.x : r.min.y)
  const fin = (r: Rect) => (h ? r.max.x : r.max.y)
  const autre = (r: Rect) => (h ? r.min.y : r.min.x)

  const tries = [...items].sort((a, b) => debut(a.rect) - debut(b.rect) || autre(a.rect) - autre(b.rect))
  const etendue = Math.max(...tries.map((i) => fin(i.rect))) - debut(tries[0]!.rect)
  const tailles = tries.reduce((s, i) => s + (fin(i.rect) - debut(i.rect)), 0)
  const ecart = ecartRepartition(etendue - tailles, tries.length - 1)

  const resultat: Deplacement[] = []
  let curseur = fin(tries[0]!.rect)
  resultat.push({ id: tries[0]!.id, de: [tries[0]!.x, tries[0]!.y], vers: [tries[0]!.x, tries[0]!.y] })
  for (const i of tries.slice(1)) {
    const cible = curseur + ecart
    const decalage = debut(i.rect) - (h ? i.x : i.y)
    const pos = Math.round(cible - decalage)
    resultat.push({ id: i.id, de: [i.x, i.y], vers: h ? [pos, i.y] : [i.x, pos] })
    curseur = pos + decalage + (fin(i.rect) - debut(i.rect))
  }
  return sansImmobiles(resultat)
}
