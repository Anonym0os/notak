import { useMemo, useSyncExternalStore } from 'react'
import { ecouterAdresse } from './chemin'

/**
 * D'où l'on écrit à l'agent : la vue que dit l'adresse, quelle que soit la page qui la montre. La bulle de l'agent est
 * montée une fois, au-dessus des pages (`edition/serveur.tsx`) ; elle lit ici le tableau auquel ses demandes se
 * rattachent, et le relais de Notak vérifie que la personne peut le lire.
 *
 * - `/t/<toile>` : la toile ;
 * - `/t/<toile>/e/<élément>` : sa page ou sa carte ouverte en grand (ou l'élément que l'adresse montre) ;
 * - `/?dossier=<dossier>` : le dossier qu'on parcourt dans la bibliothèque (un dossier est un tableau) ;
 * - `/` : la bibliothèque, rattachée à l'accueil du compte.
 *
 * Les autres pages (la note rapide, un partage, les espaces…) n'ont pas d'ici : la bulle n'y paraît pas.
 */
export type Vue = 'bibliotheque' | 'dossier' | 'toile' | 'element'

export interface Ici {
  /** Le tableau d'où l'on écrit. */
  tableau: string
  /** L'élément que l'adresse nomme sur la toile, s'il y en a un. */
  element: string | null
  vue: Vue
}

const decoder = (s: string): string | null => {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

export function iciDe(chemin: string, recherche: string, racine: string): Ici | null {
  if (chemin === '/' || chemin === '/bibliotheque') {
    const dossier = new URLSearchParams(recherche).get('dossier')
    return dossier ? { tableau: dossier, element: null, vue: 'dossier' } : { tableau: racine, element: null, vue: 'bibliotheque' }
  }
  const m = /^\/t\/([^/]+)(?:\/e\/([^/]+))?\/?$/.exec(chemin)
  const tableau = m ? decoder(m[1]!) : null
  if (!tableau) return null
  const element = m![2] ? decoder(m![2]) : null
  return element ? { tableau, element, vue: 'element' } : { tableau, element: null, vue: 'toile' }
}

const adresseCourante = () => location.pathname + location.search

/** D'où l'on écrit, suivi à chaque changement d'adresse : `allerA`, le retour du navigateur, une toile ou un dossier ouverts. */
export function useIci(racine: string): Ici | null {
  const adresse = useSyncExternalStore(ecouterAdresse, adresseCourante)
  return useMemo(() => {
    const q = adresse.indexOf('?')
    return iciDe(q < 0 ? adresse : adresse.slice(0, q), q < 0 ? '' : adresse.slice(q), racine)
  }, [adresse, racine])
}
