import type { Arbre, Commentaire, Id } from '../../../coeur/tableau'
import type { Lecture } from './sujets'

/**
 * Les commentaires sur les sujets d'une carte. Le fil est le même que sur la toile et dans le document
 * (`elements/commentaire/fil.ts`) ; il vit dans `Arbre.fils`, par identifiant de sujet, à part des sujets.
 */

/** Le fil de ce sujet, s'il en a un. */
export const filDe = (a: Arbre, id: Id): Commentaire | undefined => a.fils?.[id]

/** Le sujet porte un fil qui a au moins un message. */
export const estCommente = (a: Arbre, id: Id): boolean => (a.fils?.[id]?.messages.length ?? 0) > 0

/**
 * Pose le fil d'un sujet, ou le retire (`null`, ou un fil sans message : un fil muet n'a rien à dire). Un sujet qui
 * n'existe pas ne reçoit rien.
 */
export function poserFil(a: Arbre, id: Id, fil: Commentaire | null): Arbre {
  if (!a.sujets[id]) return a
  const garde = fil && fil.messages.length > 0 ? fil : null
  if (!garde && !a.fils?.[id]) return a
  const { fils: _, ...sans } = a
  const suite = { ...a.fils }
  if (garde) suite[id] = garde
  else delete suite[id]
  return Object.keys(suite).length > 0 ? { ...sans, fils: suite } : sans
}

/** Les sujets de la carte (ceux qu'elle montre) qui portent un fil, dans l'ordre où la carte les lit. */
export function sujetsCommentes(a: Arbre, l: Lecture): Id[] {
  if (!a.fils) return []
  return [...l.sujets.keys()].filter((id) => estCommente(a, id))
}
