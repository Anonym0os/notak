/**
 * Appelle `envoyer` au plus une fois par `delai` ms, avec la dernière valeur reçue : la première part tout
 * de suite, les suivantes sont regroupées. `maintenant` et `minuterie` sont prêtés pour les essais.
 */
export function creerLimiteur<T>(
  envoyer: (v: T) => void,
  delai: number,
  maintenant: () => number = Date.now,
  minuterie: (f: () => void, ms: number) => unknown = setTimeout,
) {
  let dernierEnvoi = Number.NEGATIVE_INFINITY
  let attente: { v: T } | null = null
  let armee = false

  const partir = (v: T) => {
    dernierEnvoi = maintenant()
    envoyer(v)
  }
  const armer = () => {
    armee = true
    minuterie(() => {
      armee = false
      if (!attente) return
      const { v } = attente
      attente = null
      partir(v)
    }, Math.max(0, delai - (maintenant() - dernierEnvoi)))
  }

  return {
    pousser(v: T) {
      if (!armee && maintenant() - dernierEnvoi >= delai) return partir(v)
      attente = { v }
      if (!armee) armer()
    },
    /** Envoie tout de suite, et oublie ce qui attendait. */
    forcer(v: T) {
      attente = null
      partir(v)
    },
  }
}
