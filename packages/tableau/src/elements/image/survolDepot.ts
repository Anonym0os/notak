import { useSyncExternalStore } from 'react'
import type { Id } from '../../coeur/tableau'
import { TYPES_ACCEPTES } from './geometrie'

/**
 * Le dépôt d'une image sur une image : à peine au-dessus, un filet de 2 px ; après 500 ms de survol sans bouger de
 * carte, un voile « Remplacer l'image ». Lâchée avant, l'image est une image de plus ; lâchée sous le voile, elle prend
 * la place de l'autre (position, largeur et légende gardées).
 */
export const DELAI_VOILE_MS = 500

export type EtatDepot = 'filet' | 'voile'
let cible: { id: Id; etat: EtatDepot } | null = null
/** La cible du voile au moment du dépôt : la toile la garde le temps que les récepteurs aient lu. */
let figee: Id | null = null
let minuterie: ReturnType<typeof setTimeout> | null = null
const ecouteurs = new Set<() => void>()
const ecouter = (f: () => void) => {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}
const prevenir = () => ecouteurs.forEach((f) => f())

/** Ce qu'on glisse est une seule image du bureau (ou on ne sait pas encore : certains navigateurs cachent le type). */
export function glisseUneImage(d: Pick<DataTransfer, 'types' | 'items'>): boolean {
  if (![...d.types].includes('Files')) return false
  const items = [...d.items].filter((i) => i.kind === 'file')
  if (items.length > 1) return false
  return items.length === 0 || items[0]!.type === '' || TYPES_ACCEPTES.includes(items[0]!.type)
}

/** L'image survolée par un dépôt (`null` : aucune). Le voile apparaît quand 500 ms ont passé sur la même. */
export function survolerImage(id: Id | null) {
  if (cible?.id === id) return
  if (minuterie) clearTimeout(minuterie)
  minuterie = null
  cible = id ? { id, etat: 'filet' } : null
  if (id) {
    minuterie = setTimeout(() => {
      minuterie = null
      if (cible?.id === id) {
        cible = { id, etat: 'voile' }
        prevenir()
      }
    }, DELAI_VOILE_MS)
  }
  prevenir()
}

/** À la dépose : la cible du voile, s'il y en a un, est gardée pour les récepteurs ; le survol s'arrête. */
export function figerDepot() {
  figee = cible?.etat === 'voile' ? cible.id : null
  survolerImage(null)
}

/** L'image que le dépôt en cours remplace, ou `null` : on en pose une de plus. */
export const imageARemplacer = (): Id | null => figee

/** Une fois les récepteurs passés. */
export function libererDepot() {
  figee = null
}

export const useDepotSurImage = (id: Id): EtatDepot | null =>
  useSyncExternalStore(ecouter, () => (cible?.id === id ? cible.etat : null))
