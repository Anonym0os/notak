import type { Hocuspocus } from '@hocuspocus/server'
import type { Autorisation } from './autorisation.ts'
import type { Base } from './base.ts'
import { nomDuDocument } from './synchro.ts'

// Un accès donné à un compte peut avoir une échéance (table `echeances`). Passée, le rôle est retiré de la base,
// donc d'OpenFGA, et les connexions en direct se ferment : chacun relit son droit. Le serveur passe à chaque requête
// qui lit un droit si une échéance est atteinte, et toutes les trente secondes pour fermer les connexions ouvertes.

/** Le passage qui fait tomber les accès échus ; un seul à la fois. Rend les tableaux touchés. */
export function creerExpiration(base: Base, autorisation: Autorisation, synchro: () => Hocuspocus | null, maintenant: () => number): () => Promise<string[]> {
  let enCours: Promise<string[]> | null = null
  const passer = async (): Promise<string[]> => {
    const tableaux = base.expirerAcces(maintenant())
    if (tableaux.length === 0) return []
    await autorisation.vider().catch((e: unknown) => console.warn(`Notak : envoi des accès échus à OpenFGA différé (${(e as Error).message})`))
    for (const t of tableaux) {
      for (const d of [t, ...base.descendants(t)]) synchro()?.closeConnections(nomDuDocument(d))
    }
    return tableaux
  }
  return () => {
    enCours ??= passer().finally(() => (enCours = null))
    return enCours
  }
}
