/** Le nombre de pas qu'on garde pour défaire. */
export const PAS_MAX = 100

/** Les états d'avant (le plus récent en dernier) et ceux qu'on a défaits. */
export interface Historique<T> {
  passe: T[]
  futur: T[]
}

export const historiqueVide = <T>(): Historique<T> => ({ passe: [], futur: [] })

/** Un nouveau pas : l'état d'avant se range, et ce qu'on avait défait est perdu. */
export const noter = <T>(h: Historique<T>, avant: T): Historique<T> => ({ passe: [...h.passe.slice(-(PAS_MAX - 1)), avant], futur: [] })

/** Défaire : l'état à reprendre, et l'historique d'après. `null` s'il n'y a rien à défaire. */
export function defaire<T>(h: Historique<T>, courant: T): { etat: T; historique: Historique<T> } | null {
  const etat = h.passe.at(-1)
  if (etat === undefined) return null
  return { etat, historique: { passe: h.passe.slice(0, -1), futur: [...h.futur, courant] } }
}

/** Refaire : l'inverse. */
export function refaire<T>(h: Historique<T>, courant: T): { etat: T; historique: Historique<T> } | null {
  const etat = h.futur.at(-1)
  if (etat === undefined) return null
  return { etat, historique: { passe: [...h.passe, courant], futur: h.futur.slice(0, -1) } }
}
