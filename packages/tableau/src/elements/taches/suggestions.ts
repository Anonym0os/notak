/**
 * Les suggestions sous une liste de tâches, comme chez Milanote : « Ajouter un titre ? » quand la liste gagne une
 * deuxième tâche sans titre, « Supprimer les tâches terminées ? » dès deux tâches faites. Chacune se propose
 * une fois par liste : un « Non merci » la fait taire (`Taches.refus`) ; trois refus du titre, et on ne le propose plus
 * à personne sur cet appareil.
 */
import type { Taches } from '../../coeur/tableau'
import { compter, docTaches, sousTaches } from './liste'

export type Suggestion = 'titre' | 'faites'

/** Après combien de refus la suggestion du titre est éteinte pour de bon. */
export const REFUS_TITRE_MAX = 3
const CLE = 'notak.suggestion.titre.refus'

/** Combien de fois le titre a été refusé sur cet appareil. */
export function refusDuTitre(): number {
  try {
    return Number(localStorage.getItem(CLE)) || 0
  } catch {
    return 0
  }
}

/** Note un refus du titre. */
export function noterRefusDuTitre(): void {
  try {
    localStorage.setItem(CLE, String(refusDuTitre() + 1))
  } catch {
    // Le stockage manque (fenêtre privée) : la suggestion reviendra, sans gravité.
  }
}

/** Les tâches de premier niveau. */
export const nombreEnHaut = (c: Taches): number => sousTaches(docTaches(c.texte)).length

/**
 * La suggestion à faire pour cette liste, s'il y en a une. `gagne` : la liste vient de gagner sa deuxième tâche
 * (le titre ne se propose pas à l'ouverture d'une liste qui en avait déjà deux).
 */
export function suggestionA(c: Taches, gagne: boolean, refusTitre = refusDuTitre()): Suggestion | null {
  const refus = c.refus ?? []
  if (gagne && c.titre === undefined && nombreEnHaut(c) >= 2 && !refus.includes('titre') && refusTitre < REFUS_TITRE_MAX) return 'titre'
  if (!refus.includes('faites') && compter(c.texte).faites >= 2) return 'faites'
  return null
}

/** Le contenu après un « Non merci » : la suggestion est écartée pour cette liste. */
export const ecartee = (c: Taches, s: Suggestion): Taches => ({ ...c, refus: [...new Set([...(c.refus ?? []), s])] })
