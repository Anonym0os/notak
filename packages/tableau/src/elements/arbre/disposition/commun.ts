import type { Id } from '../../../coeur/tableau'
import { type Lecture, cache, enfantsDe } from '../modele/sujets'

/** La taille d'un sujet dessiné, en pixels de carte. */
export interface Taille {
  l: number
  h: number
}

/** Où un sujet se pose : son coin haut gauche et sa taille, en pixels, le centre du central en (0, 0). */
export interface Boite extends Taille {
  x: number
  y: number
}

/** De quel bord d'un sujet partent ses branches, et de quel bord elles arrivent sur ses enfants. */
export type Cote = 'droite' | 'gauche' | 'bas' | 'haut'

/** Une branche à tracer, du parent vers l'enfant. */
export interface Lien {
  de: Id
  vers: Id
  cote: Cote
}

export interface Disposition {
  boites: Map<Id, Boite>
  liens: Lien[]
}

/** Les écarts de docs/XMIND.md § 2 : entre un parent et ses enfants, entre deux frères. */
export interface Ecarts {
  principal: number
  secondaire: number
}

export const ECARTS: Ecarts = { principal: 40, secondaire: 12 }
/** Le central est plus loin de ses principaux que les autres sujets de leurs enfants. */
export const ECART_CENTRAL = 64

/** Les enfants qu'on dessine : aucun si le sujet est replié. */
export const visibles = (l: Lecture, id: Id): readonly Id[] => (l.sujets.get(id)?.replie || cache(l, id) ? [] : enfantsDe(l, id))

/**
 * Une branche disposée en arbre horizontal (la structure logique, et chaque moitié d'une carte) : les enfants en
 * colonne à droite (ou à gauche) du parent, centrés sur lui. Rend la hauteur occupée par la branche ; les boîtes sont
 * posées relativement à `x0` (le bord du parent d'où partent les branches) et `yMilieu` (le milieu du parent).
 */
export function hauteurBranche(l: Lecture, id: Id, taille: (id: Id) => Taille, e: Ecarts, memo: Map<Id, number>): number {
  const deja = memo.get(id)
  if (deja !== undefined) return deja
  const enfants = visibles(l, id)
  const propre = taille(id).h
  const somme = enfants.reduce((s, x, i) => s + hauteurBranche(l, x, taille, e, memo) + (i > 0 ? e.secondaire : 0), 0)
  const h = Math.max(propre, somme)
  memo.set(id, h)
  return h
}

/**
 * Pose en colonne les enfants de `parent`, déjà posé dans `boites`, du côté `cote` ; puis leurs propres enfants, du
 * même côté. `ecart` : la distance horizontale entre le parent et ses enfants.
 */
export function poserEnColonne(
  l: Lecture,
  parent: Id,
  enfants: readonly Id[],
  cote: 'droite' | 'gauche',
  taille: (id: Id) => Taille,
  e: Ecarts,
  ecart: number,
  memo: Map<Id, number>,
  sortie: Disposition,
) {
  const p = sortie.boites.get(parent)!
  const total = enfants.reduce((s, x, i) => s + hauteurBranche(l, x, taille, e, memo) + (i > 0 ? e.secondaire : 0), 0)
  let y = p.y + p.h / 2 - total / 2
  for (const x of enfants) {
    const hb = hauteurBranche(l, x, taille, e, memo)
    const t = taille(x)
    const bx = cote === 'droite' ? p.x + p.l + ecart : p.x - ecart - t.l
    sortie.boites.set(x, { x: bx, y: y + hb / 2 - t.h / 2, ...t })
    sortie.liens.push({ de: parent, vers: x, cote })
    poserEnColonne(l, x, visibles(l, x), cote, taille, e, e.principal, memo, sortie)
    y += hb + e.secondaire
  }
}

/** Le rectangle qui contient toutes les boîtes (vide : un point en 0, 0). */
export function emprise(boites: Iterable<Boite>): Boite {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const b of boites) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.l)
    y1 = Math.max(y1, b.y + b.h)
  }
  return x0 === Infinity ? { x: 0, y: 0, l: 0, h: 0 } : { x: x0, y: y0, l: x1 - x0, h: y1 - y0 }
}
