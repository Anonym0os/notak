import type { Point } from './geometrie'
import { type Id, type Operation, type Place, type Tableau, memePlace } from './tableau'

/** Les chiffres des clés, dans l'ordre des codes : comparer deux clés comme des chaînes les range comme des fractions. */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = ALPHABET.length

const rang = (c: string) => ALPHABET.indexOf(c)

/** Compare deux clés par code, jamais par locale. */
export const comparerOrdre = (a: string | undefined, b: string | undefined) => {
  const [x, y] = [a ?? '', b ?? '']
  return x < y ? -1 : x > y ? 1 : 0
}

/** Une clé strictement entre `a` et `b`. `a` vide : pas de borne basse. `b` absent : pas de borne haute. */
function milieu(a: string, b: string | undefined): string {
  if (b !== undefined) {
    // Un chiffre absent de `a` vaut zéro : « A » et « A0 » sont la même fraction.
    let n = 0
    while ((a[n] ?? '0') === b[n]) n++
    if (n > 0) return b.slice(0, n) + milieu(a.slice(n), b.slice(n))
  }
  const da = a ? rang(a[0]!) : 0
  const db = b !== undefined ? rang(b[0]!) : BASE
  if (db - da > 1) return ALPHABET[(da + db) >> 1]!
  // Chiffres voisins : soit `b` continue, et son premier chiffre seul passe sous lui, soit on descend d'un cran.
  if (b !== undefined && b.length > 1) return b.slice(0, 1)
  return ALPHABET[da]! + milieu(a.slice(1), undefined)
}

/**
 * Une clé strictement entre `a` et `b` (début ou fin de liste si l'un manque). Les clés s'allongent au
 * besoin et ne finissent jamais par le plus petit chiffre : il reste toujours de la place, sans renumérotation.
 */
export function cleEntre(a?: string, b?: string): string {
  if (a !== undefined && b !== undefined && a >= b) throw new Error(`Pas de clé entre « ${a} » et « ${b} »`)
  return milieu(a ?? '', b)
}

/** `n` clés croissantes, toutes strictement entre `a` et `b`. */
export function clesEntre(a: string | undefined, b: string | undefined, n: number): string[] {
  if (n <= 0) return []
  if (n === 1) return [cleEntre(a, b)]
  const m = cleEntre(a, b)
  const avant = clesEntre(a, m, (n - 1) >> 1)
  return [...avant, m, ...clesEntre(m, b, n - 1 - avant.length)]
}

/**
 * Où s'insère ce qu'on dépose dans une liste : l'index du premier élément dont le centre
 * est sous le pointeur, ou la fin. Les centres sont dans l'ordre de la liste, en hauteur croissante.
 */
export function indexInsertion(centres: readonly number[], pointeurY: number): number {
  const i = centres.findIndex((c) => c > pointeurY)
  return i < 0 ? centres.length : i
}

/** Le sens de lecture : de haut en bas, puis de gauche à droite. Rend une copie triée. */
export function trierLecture<T extends Point>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Un élément qu'on a glissé : sa place avant le geste, et sa position de lecture à ce moment. */
export interface Deplace {
  id: Id
  de: Place
  lecture: Point
}

/** La colonne qui reçoit, la place d'insertion parmi ses éléments restés, et ceux qu'elle accepte. */
export interface Cible {
  colonne: Id
  index: number
  acceptes: readonly Id[]
}

/**
 * Le pas d'historique d'un glisser, de la place d'origine à la place finale. `t` est le tableau tel que
 * le glisser l'a laissé : les éléments y sont libres, à l'endroit où le pointeur les a portés. Ceux que
 * la cible accepte y entrent à l'index dit, dans leur sens de lecture d'origine ; les autres restent posés.
 */
export function pasDeDepot(t: Tableau, deplaces: readonly Deplace[], cible: Cible | null): Operation[] {
  const dedans = new Set(cible?.acceptes ?? [])
  const entrants = trierLecture(deplaces.filter((d) => dedans.has(d.id)).map((d) => ({ ...d, ...d.lecture })))
  let cles: string[] = []
  if (cible) {
    const freres = t.elements.filter((e) => e.parent === cible.colonne && !dedans.has(e.id)).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
    const i = Math.max(0, Math.min(cible.index, freres.length))
    cles = clesEntre(freres[i - 1]?.ordre, freres[i]?.ordre, entrants.length)
  }
  const pas: Operation[] = []
  for (const d of deplaces) {
    const e = t.elements.find((x) => x.id === d.id)
    if (!e) continue
    const k = entrants.findIndex((x) => x.id === d.id)
    const vers: Place = cible && k >= 0 ? { parent: cible.colonne, ordre: cles[k], x: e.x, y: e.y } : { x: e.x, y: e.y }
    if (!memePlace(d.de, vers)) pas.push({ type: 'ranger', id: d.id, de: d.de, vers })
  }
  return pas
}
