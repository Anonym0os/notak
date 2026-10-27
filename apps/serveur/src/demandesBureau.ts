import { DUREE_CODE_APPAREIL_MS } from './auth.ts'

// D'où et quand chaque app de bureau a demandé son code de connexion. La page qui fait confirmer le code le montre à
// côté de l'adresse de celui qui confirme : un code reçu d'un inconnu (« entrez ce code pour… ») vient d'ailleurs, et
// cela se voit avant d'ouvrir son compte à son app. En mémoire seulement : un code ne vit que dix minutes.

export interface Demande {
  ip: string
  /** L'instant de la demande (ms). */
  quand: number
}

export interface Demandes {
  noter(code: string, ip: string, quand: number): void
  lire(code: string, maintenant: number): Demande | null
}

/** Le code tel que Better Auth le cherche : sans tirets ni espaces, en majuscules (son alphabet par défaut). */
export const normaliserCode = (code: string): string => code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 64)

export function creerDemandes(dureeMs = DUREE_CODE_APPAREIL_MS, max = 10_000): Demandes {
  // L'ordre d'insertion d'une Map est celui des demandes : la plus ancienne part la première.
  const demandes = new Map<string, Demande>()
  const purger = (maintenant: number) => {
    for (const [code, d] of demandes) {
      if (maintenant - d.quand < dureeMs) break
      demandes.delete(code)
    }
  }
  return {
    noter(code, ip, quand) {
      const cle = normaliserCode(code)
      if (!cle) return
      purger(quand)
      demandes.delete(cle)
      // Une rafale de demandes ne fait pas grossir la mémoire : au-delà, les plus anciennes s'oublient.
      while (demandes.size >= max) demandes.delete(demandes.keys().next().value!)
      demandes.set(cle, { ip: ip.slice(0, 64), quand })
    },
    lire(code, maintenant) {
      const d = demandes.get(normaliserCode(code))
      return d && maintenant - d.quand < dureeMs ? { ...d } : null
    },
  }
}
