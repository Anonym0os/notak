import type { Id } from '../../../coeur/tableau'
import type { Boite } from '../disposition'
import { type Lecture, enfantsDe } from './sujets'

/**
 * Le cadre de sélection et les clics sur les sujets (docs/XMIND.md § 4 bis) : ce qui décide quels sujets sont pris, et
 * comment une sélection change à l'appui. Des fonctions pures : la fenêtre ne fait que les appeler.
 */

type Point = { x: number; y: number }

/** Un glisser démarre quand le pointeur s'écarte de plus de 2 px d'écran du point d'appui, sur l'un des deux axes. */
export const SEUIL_GLISSER = 2

export const franchiLeSeuil = (depart: Point, p: Point, seuil = SEUIL_GLISSER): boolean => Math.abs(p.x - depart.x) > seuil || Math.abs(p.y - depart.y) > seuil

/** Le rectangle des deux coins, quel que soit le sens dans lequel on a tiré. */
export function rectDeDeuxPoints(a: Point, b: Point): Boite {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), l: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

/**
 * Les sujets que le cadre attrape : ceux dont la boîte le chevauche sur une aire non nulle. Un simple contact de bord ne
 * compte pas, un cadre sans largeur ou sans hauteur ne prend rien. Seuls les sujets passent : `boites` ne porte que
 * ceux-là.
 */
export function sujetsDansCadre(boites: Iterable<readonly [Id, Boite]>, cadre: Boite): Id[] {
  if (cadre.l <= 0 || cadre.h <= 0) return []
  const sortie: Id[] = []
  for (const [id, b] of boites) {
    if (b.x < cadre.x + cadre.l && cadre.x < b.x + b.l && b.y < cadre.y + cadre.h && cadre.y < b.y + b.h) sortie.push(id)
  }
  return sortie
}

/**
 * La sélection après un mouvement du cadre. Sans ⇧ ni Cmd, elle est remplacée par ce que le cadre attrape (le rétrécir
 * lâche des sujets) ; avec, elle s'y ajoute (rien ne se retire).
 */
export function selectionDuCadre(courante: ReadonlySet<Id>, trouves: readonly Id[], ajout: boolean): Set<Id> {
  return ajout ? new Set([...courante, ...trouves]) : new Set(trouves)
}

/** Deux ensembles de même contenu : de quoi ne pas redessiner pour rien à chaque image du cadre. */
export function memeEnsemble(a: ReadonlySet<Id>, b: ReadonlySet<Id>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

/** Cmd + appui : le sujet entre dans la sélection, ou en sort s'il y est. */
export function basculer(s: ReadonlySet<Id>, id: Id): Set<Id> {
  const n = new Set(s)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  return n
}

/**
 * Maj + appui : si le sujet a un frère déjà choisi, tous les frères entre eux le sont aussi (le plus proche sert de
 * borne) ; sinon il s'ajoute seul. Un flottant, un résumé, le central s'ajoutent seuls.
 */
export function selectionParPlage(l: Lecture, s: ReadonlySet<Id>, id: Id): Set<Id> {
  const n = new Set(s)
  n.add(id)
  const sujet = l.sujets.get(id)
  if (!sujet || sujet.parent === undefined || sujet.genre) return n
  const freres = enfantsDe(l, sujet.parent)
  const i = freres.indexOf(id)
  let borne = -1
  freres.forEach((x, j) => {
    if (x !== id && s.has(x) && (borne < 0 || Math.abs(j - i) < Math.abs(borne - i))) borne = j
  })
  if (borne < 0) return n
  for (let j = Math.min(i, borne); j <= Math.max(i, borne); j++) n.add(freres[j]!)
  return n
}

/**
 * Les sujets de tête d'une sélection : ceux dont aucun ancêtre n'est choisi (leurs descendants suivent d'office), sans
 * le central, qui ne se glisse pas. Dans l'ordre où on les donne.
 */
export function tetesDe(l: Lecture, ids: Iterable<Id>): Id[] {
  const choisis = new Set([...ids].filter((x) => x !== l.central))
  return [...choisis].filter((x) => {
    const s = l.sujets.get(x)
    if (!s) return false
    for (let p = s.parent; p !== undefined; p = l.sujets.get(p)?.parent) if (choisis.has(p)) return false
    return true
  })
}
