export interface Limiteur {
  /** Compte un essai pour `cle` à l'instant `maintenant` (ms). Faux si la limite de la fenêtre est atteinte. */
  autoriser(cle: string, maintenant: number): boolean
  /** Millisecondes avant le prochain essai permis pour `cle`. */
  attente(cle: string, maintenant: number): number
}

export function creerLimiteur(max: number, fenetreMs: number): Limiteur {
  const essais = new Map<string, number[]>()

  const purger = (cle: string, maintenant: number): number[] => {
    const garde = (essais.get(cle) ?? []).filter((t) => maintenant - t < fenetreMs)
    if (garde.length) essais.set(cle, garde)
    else essais.delete(cle)
    return garde
  }

  return {
    autoriser(cle, maintenant) {
      if (essais.size > 10_000) for (const k of [...essais.keys()]) purger(k, maintenant)
      const garde = purger(cle, maintenant)
      if (garde.length >= max) return false
      garde.push(maintenant)
      essais.set(cle, garde)
      return true
    },
    attente(cle, maintenant) {
      const garde = purger(cle, maintenant)
      if (garde.length < max) return 0
      return Math.max(0, garde[0]! + fenetreMs - maintenant)
    },
  }
}
