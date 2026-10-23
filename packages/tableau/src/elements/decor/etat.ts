import { useSyncExternalStore } from 'react'
import type { Id } from '../../coeur/tableau'
import type { ContexteToile } from '../types'

/**
 * Ce que la toile ne garde pas pour nous : le filtre par étiquettes (un état de vue, propre à chacun, qui ne
 * s'écrit pas dans le tableau), le fil ouvert, et le contexte de la toile affichée — les boutons de la barre de
 * gauche, hors des cartes, n'ont que lui pour atteindre le tableau.
 */
let filtre: ReadonlySet<Id> = new Set()
let fil: Id | null = null
let contexte: ContexteToile | null = null
/** La pastille d'étiquette choisie sur une carte (un seul clic dessus), ou rien. */
export interface PuceChoisie {
  element: Id
  etiquette: Id
  /** La barre de gauche vient de demander « Renommer » : la pastille passe en édition, puis efface la demande. */
  renommer?: boolean
}
let puce: PuceChoisie | null = null
const ecouteurs = new Set<() => void>()

const souscrire = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}
const notifier = () => {
  for (const f of ecouteurs) f()
}

export function basculerFiltre(id: Id) {
  const suite = new Set(filtre)
  if (!suite.delete(id)) suite.add(id)
  filtre = suite
  notifier()
}

export function viderFiltre() {
  if (filtre.size === 0) return
  filtre = new Set()
  notifier()
}

/** Ouvre (ou ferme, avec `null`) le fil accroché à cet élément. */
export function ouvrirFil(id: Id | null) {
  if (fil === id) return
  fil = id
  notifier()
}

/** Retient la toile affichée ; changer de tableau remet le filtre et le fil à zéro. */
export function retenirContexte(c: ContexteToile) {
  if (contexte === c) return
  const autreTableau = contexte !== null && contexte.magasin !== c.magasin
  contexte = c
  if (autreTableau) {
    filtre = new Set()
    fil = null
    puce = null
  }
  notifier()
}

export function choisirPuce(p: PuceChoisie | null) {
  if (puce?.element === p?.element && puce?.etiquette === p?.etiquette && puce?.renommer === p?.renommer) return
  puce = p
  notifier()
}

export const usePuce = () => useSyncExternalStore(souscrire, () => puce)
export const useFiltre = () => useSyncExternalStore(souscrire, () => filtre)
export const useFilOuvert = () => useSyncExternalStore(souscrire, () => fil)
export const useContexteRetenu = () => useSyncExternalStore(souscrire, () => contexte)
