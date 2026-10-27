import { useSyncExternalStore } from 'react'
import type { Id } from '../../coeur/tableau'
import type { Services } from '../types'

/** Le fichier montré dans sa fenêtre, un seul à la fois : la carte qui le porte l'affiche par-dessus la page. */
let ouvert: Id | null = null
const ecouteurs = new Set<() => void>()
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

export function ouvrirFenetreFichier(id: Id | null) {
  if (ouvert === id) return
  ouvert = id
  for (const f of ecouteurs) f()
}

/**
 * Ouvre un fichier hors de la toile. L'hôte s'en charge quand il le peut (l'app de bureau le remet à l'application du
 * système, ou propose « Enregistrer sous ») ; sinon, un nouvel onglet du navigateur.
 */
export function ouvrirDehors(services: Pick<Services, 'ouvrirAilleurs'>, adresse: string, nom?: string) {
  if (services.ouvrirAilleurs) services.ouvrirAilleurs(adresse, nom)
  else window.open(adresse, '_blank', 'noopener,noreferrer')
}

export const useFichierOuvert = () => useSyncExternalStore(ecouter, () => ouvert)

/**
 * Ce que « Renommer » et « Légende » visent en ouvrant l'édition de la carte : le nom ou la légende. La carte lit
 * la cible une fois, à l'ouverture de l'édition.
 */
export type CibleEdition = 'nom' | 'legende'
let cible: CibleEdition = 'nom'

export const viserEdition = (c: CibleEdition) => {
  cible = c
}

export function prendreCible(): CibleEdition {
  const c = cible
  cible = 'nom'
  return c
}

/** Le caractère tapé sur un fichier choisi : il devient le début de sa légende (voir `surFrappe`). */
let amorce = ''
export const amorcerLegendeFichier = (caractere: string) => {
  amorce = caractere
}
export function prendreAmorce(): string {
  const a = amorce
  amorce = ''
  return a
}
