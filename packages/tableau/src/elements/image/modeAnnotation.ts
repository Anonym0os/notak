import { useSyncExternalStore } from 'react'
import type { Id } from '../../coeur/tableau'
import { COULEUR_TRAIT_DEFAUT, EPAISSEURS_PX, EPAISSEUR_DEFAUT } from './annotation'
import { ecrireReglage, lireReglage } from '../croquis/trace'

export type OutilAnnotation = 'crayon' | 'gomme'

export interface EtatAnnotation {
  /** L'image qu'on est en train de dessiner, une seule à la fois. */
  id: Id | null
  outil: OutilAnnotation
  couleur: string
  /** Le rang de l'épaisseur dans `EPAISSEURS_PX`. */
  epaisseur: number
}

// Couleur et épaisseur sont celles du croquis : on les retrouve d'une session à l'autre.
const CLE_COULEUR = 'notak.croquis.couleur'
const CLE_EPAISSEUR = 'notak.croquis.epaisseur'

function reglageCouleur(): string {
  const v = lireReglage(CLE_COULEUR)
  return v !== null && /^#[0-9a-f]{6}$/i.test(v) ? v : COULEUR_TRAIT_DEFAUT
}
function reglageEpaisseur(): number {
  const n = Number(lireReglage(CLE_EPAISSEUR))
  return Number.isInteger(n) && n >= 0 && n < EPAISSEURS_PX.length ? n : EPAISSEUR_DEFAUT
}

/** Le mode dessin : l'image annotée, l'outil, la couleur et l'épaisseur (qu'on garde d'une image à l'autre). */
let etat: EtatAnnotation = { id: null, outil: 'crayon', couleur: reglageCouleur(), epaisseur: reglageEpaisseur() }
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
export function choisirCouleur(couleur: string) {
  ecrireReglage(CLE_COULEUR, couleur)
  poser({ ...etat, couleur, outil: 'crayon' })
}
export function choisirEpaisseur(epaisseur: number) {
  if (!(epaisseur >= 0 && epaisseur < EPAISSEURS_PX.length)) return
  ecrireReglage(CLE_EPAISSEUR, String(epaisseur))
  poser({ ...etat, epaisseur, outil: 'crayon' })
}
