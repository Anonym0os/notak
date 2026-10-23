import type { Adresse } from '@notak/tableau'

/** Chaque tableau a son adresse, `/t/<id>` ; l'accueil est `/`. Le retour du navigateur ramène au précédent. */
export function adressePour(racine: string): Adresse {
  const lire = () => {
    const m = /^\/t\/([^/]+)\/?$/.exec(location.pathname)
    return m ? decodeURIComponent(m[1]!) : null
  }
  return {
    lire: () => lire() ?? racine,
    ecrire(id) {
      history.pushState(null, '', id === racine ? '/' : `/t/${encodeURIComponent(id)}`)
    },
    ecouter(f) {
      const surRetour = () => f(lire())
      window.addEventListener('popstate', surRetour)
      return () => window.removeEventListener('popstate', surRetour)
    },
  }
}
