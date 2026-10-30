import { useSyncExternalStore } from 'react'
import type { ContexteToile } from '../types'

/**
 * Le mode « dessiner sur la toile » est-il ouvert ? La couche de dessin, la barre de gauche et la toile (double-clic,
 * clavier) le lisent ici : tant qu'il est ouvert, la toile ne fait plus rien sous la couche.
 */
let ouvert = false
const ecouteurs = new Set<() => void>()

export const dessinLibreOuvert = (): boolean => ouvert

export function poserDessinLibre(valeur: boolean): void {
  if (ouvert === valeur) return
  ouvert = valeur
  for (const f of [...ecouteurs]) f()
}

const abonner = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}

export const useDessinLibreOuvert = (): boolean => useSyncExternalStore(abonner, dessinLibreOuvert, () => false)

/** La toile doit-elle laisser passer ce geste ? Non dès que la couche de dessin est ouverte (état ou présence dans le DOM). */
export const toileSuspendue = (racine?: Element | null): boolean => ouvert || !!racine?.querySelector('.notak-dessin-libre')

/**
 * L'Apple Pencil (ou tout stylet) a-t-il déjà servi sur cet appareil ? Tant que non, un doigt dessine dans la couche,
 * comme une souris ; dès qu'un stylet s'est montré, c'est lui qui dessine et les doigts déplacent et zooment la vue,
 * comme dans Notes ou Freeform. Gardé d'une session à l'autre.
 */
const CLE_CRAYON = 'notak.crayon.vu'
let crayon: boolean | null = null

export function crayonVu(): boolean {
  if (crayon === null) {
    try {
      crayon = localStorage.getItem(CLE_CRAYON) === '1'
    } catch {
      crayon = false
    }
  }
  return crayon
}

export function noterCrayon(e: { pointerType: string }): void {
  if (e.pointerType !== 'pen' || crayonVu()) return
  crayon = true
  try {
    localStorage.setItem(CLE_CRAYON, '1')
  } catch {
    // Sans stockage, le stylet ne sera reconnu que pour cette session.
  }
}

/**
 * Le double toucher de l'Apple Pencil (`AppareilPlugin.swift` → `apps/web/src/ios/crayon.ts`) arrive sur la fenêtre
 * sous ce nom, avec l'action que la personne a choisie dans les réglages d'iOS : `gomme` (passer à la gomme et
 * revenir), `precedent` (l'outil d'avant), `couleurs`, `epaisseur`, ou rien.
 */
export const EVENEMENT_DOUBLE_TOUCHER = 'notak:crayon-double-toucher'
export type ActionDoubleToucher = 'gomme' | 'precedent' | 'couleurs' | 'epaisseur'

/**
 * Ouvrir la couche de dessin depuis un appui de stylet sur la toile : la couche le reprend et le trait commence là.
 * La toile ne connaît pas la couche (elle passe par le registre) : la couche se déclare ici en se chargeant.
 */
type OuvrirAuCrayon = (contexte: ContexteToile, appui: PointerEvent) => void
let ouvrirAuCrayon: OuvrirAuCrayon | null = null
export function reglerOuvertureAuCrayon(f: OuvrirAuCrayon): void {
  ouvrirAuCrayon = f
}
/** Rend `true` si la couche s'est ouverte et a pris l'appui. */
export function dessinerAuCrayon(contexte: ContexteToile, appui: PointerEvent): boolean {
  if (!ouvrirAuCrayon || ouvert) return false
  ouvrirAuCrayon(contexte, appui)
  return ouvert
}
