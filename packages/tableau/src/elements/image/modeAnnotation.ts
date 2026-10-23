import { useSyncExternalStore } from 'react'
import type { Id } from '../../coeur/tableau'
import { COULEUR_TRAIT_DEFAUT } from './annotation'

export type OutilAnnotation = 'crayon' | 'gomme'

export interface EtatAnnotation {
  /** L'image qu'on est en train de dessiner, une seule à la fois. */
  id: Id | null
  outil: OutilAnnotation
  couleur: string
}

/** Le mode dessin : l'image annotée, l'outil et la couleur (qu'on garde d'une image à l'autre). */
let etat: EtatAnnotation = { id: null, outil: 'crayon', couleur: COULEUR_TRAIT_DEFAUT }
const ecouteurs = new Set<() => void>()

const poser = (suite: EtatAnnotation) => {
  etat = suite
  for (const f of ecouteurs) f()
}
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

export const etatAnnotation = () => etat
export const useAnnotation = () => useSyncExternalStore(ecouter, etatAnnotation)

/** Entre dans le mode dessin sur cette image, ou en sort (`null`). Le crayon reprend la main à chaque entrée. */
export function annoter(id: Id | null) {
  if (etat.id === id) return
  poser({ ...etat, id, outil: 'crayon' })
}
export const choisirOutil = (outil: OutilAnnotation) => poser({ ...etat, outil })
export const choisirCouleur = (couleur: string) => poser({ ...etat, couleur, outil: 'crayon' })
