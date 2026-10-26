/**
 * Un serveur mis à jour sous une fenêtre qui reste ouverte. Dans le navigateur, c'est le service worker qui l'apprend
 * (`pwa.ts`) ; dans l'app de bureau il est désactivé, et la page du serveur reste sur l'ancienne version jusqu'à ce
 * qu'on la recharge. Elle demande donc au serveur sa version (`/api/sante`, sans compte, sans base) quand la fenêtre
 * reprend la main, quand la synchronisation se rétablit, et au moins toutes les trente minutes ; si elle a changé
 * depuis le chargement, elle le signale (« Recharger »).
 */

/** Au moins trente minutes entre deux demandes sans rien d'autre pour les provoquer. */
export const INTERVALLE_MS = 30 * 60_000
/** Reprendre la main sur la fenêtre, ou une synchronisation qui se rétablit, ne redemande pas plus d'une fois par minute. */
export const ENTRE_DEUX_DEMANDES_MS = 60_000

export interface OptionsVersion {
  /** La version du serveur quand la page s'est chargée (`/api/instance`) ; absente, la première réponse fait référence. */
  depart: string | null
  /** À appeler une fois : le serveur n'a plus la version de la page. */
  signaler(): void
  fenetre?: Window
  maintenant?: () => number
}

export interface SurveillanceVersion {
  /** Demande la version tout de suite, sauf si on vient de la demander. */
  verifier(): void
  arreter(): void
}

/** La version que dit `/api/sante`, ou `null` : un serveur qui ne répond pas, ou qui n'est pas un Notak, ne dit rien. */
export async function lireVersionDuServeur(): Promise<string | null> {
  try {
    const r = await fetch('/api/sante', { cache: 'no-store', credentials: 'same-origin' })
    if (!r.ok) return null
    const lu = (await r.json()) as { produit?: unknown; version?: unknown }
    return lu.produit === 'notak' && typeof lu.version === 'string' && lu.version.length > 0 && lu.version.length <= 64 ? lu.version : null
  } catch {
    return null
  }
}

export function surveillerVersionDuServeur({ depart, signaler, fenetre = window, maintenant = Date.now }: OptionsVersion): SurveillanceVersion {
  let reference = depart
  let derniere = -Infinity
  let enCours = false
  let arrete = false
  let signale = false

  const verifier = () => {
    if (arrete || signale || enCours || maintenant() - derniere < ENTRE_DEUX_DEMANDES_MS) return
    enCours = true
    derniere = maintenant()
    void lireVersionDuServeur().then((version) => {
      enCours = false
      if (arrete || !version) return
      if (reference === null) reference = version
      else if (version !== reference) {
        signale = true
        signaler()
      }
    })
  }
  const auFocus = () => verifier()
  fenetre.addEventListener('focus', auFocus)
  // L'intervalle passe outre la limite d'une minute : une fenêtre qui n'a jamais perdu la main se renseigne quand même.
  const minuteur = fenetre.setInterval(() => {
    derniere = -Infinity
    verifier()
  }, INTERVALLE_MS)
  return {
    verifier,
    arreter() {
      arrete = true
      fenetre.removeEventListener('focus', auFocus)
      fenetre.clearInterval(minuteur)
    },
  }
}
