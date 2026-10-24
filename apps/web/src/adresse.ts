import type { Adresse } from '@notak/tableau'

/**
 * Chaque tableau a son adresse, `/t/<id>` ; l'accueil est `/`. Un élément ouvert en grand ajoute `/e/<élément>`.
 * Le retour du navigateur ramène au précédent (et referme l'élément).
 */
export function adressePour(racine: string): Adresse {
  const lire = () => {
    const m = /^\/t\/([^/]+)(?:\/e\/([^/]+))?\/?$/.exec(location.pathname)
    return m ? { tableau: decodeURIComponent(m[1]!), element: m[2] ? decodeURIComponent(m[2]) : null } : null
  }
  return {
    lire: () => lire()?.tableau ?? racine,
    lireElement: () => lire()?.element ?? null,
    ecrire(id) {
      history.pushState(null, '', id === racine ? '/' : `/t/${encodeURIComponent(id)}`)
    },
    ecrireElement(tableau, element) {
      if (element) history.pushState({ element }, '', `/t/${encodeURIComponent(tableau)}/e/${encodeURIComponent(element)}`)
      else if (lire()?.element) {
        // L'entrée qu'on a poussée pour l'ouvrir se dépile ; arrivé là par une adresse directe, on la remplace.
        if ((history.state as { element?: string } | null)?.element) history.back()
        else history.replaceState(null, '', tableau === racine ? '/' : `/t/${encodeURIComponent(tableau)}`)
      }
    },
    ecouter(f) {
      const surRetour = () => {
        const a = lire()
        f(a?.tableau ?? null, a?.element ?? null)
      }
      window.addEventListener('popstate', surRetour)
      return () => window.removeEventListener('popstate', surRetour)
    },
  }
}
