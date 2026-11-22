// Les adresses qui ouvrent une chose dans l'app, pour la porte des agents (docs/AGENTS.md, « Les adresses ») et le
// relais de l'agent (fram.ts) : les mêmes règles que « Copier le lien » de la bibliothèque (apps/web/src/Bibliotheque.tsx,
// `copierLiens`), pour qu'un lien donné par l'agent mène là où l'app mène. Rien n'est importé de l'app web : le serveur
// la lit sous Node, sans bundler.

/** Les éléments qui s'ouvrent en grand, où qu'ils soient : une page, une carte mentale (`EN_GRAND` de la bibliothèque). */
const EN_GRAND = new Set(['document', 'arbre', 'page', 'carte_mentale'])

/** Ce qu'on ouvre : une toile ou un dossier, ou un élément qu'elle porte (son type, celui de la toile ou celui de la porte). */
export interface Lieu {
  tableau: string
  element?: string | null
  type?: string
}

/** Ce que l'adresse demande de savoir des toiles. */
export interface Rangement {
  /** L'adresse publique du serveur ; absente, l'adresse commence à `/`. */
  origine?: string | undefined
  /** La toile se montre en dossier (elle s'ouvre dans la bibliothèque). */
  estDossier(tableau: string): boolean
  /** La toile est l'accueil d'un espace : ce qu'elle porte se montre aussi dans la bibliothèque. */
  estAccueil(tableau: string): boolean
}

/**
 * L'adresse d'une chose dans l'app :
 * - un dossier s'ouvre dans la bibliothèque, jamais en toile : `/?dossier=<id>` ;
 * - une toile (l'accueil compris) : `/t/<id>` ;
 * - une page ou une carte mentale s'ouvre en grand, où qu'elle soit : `/t/<toile>/e/<élément>` ;
 * - un autre élément, dans un dossier ou sur un accueil, s'y choisit dans la bibliothèque :
 *   `/?dossier=<id>&element=<élément>` ; sur une toile, la toile s'ouvre sur lui : `/t/<toile>/e/<élément>`.
 */
export function adresseDe(lieu: Lieu, r: Rangement): string {
  const debut = (r.origine ?? '').replace(/\/$/, '')
  const t = encodeURIComponent(lieu.tableau)
  if (!lieu.element) return r.estDossier(lieu.tableau) ? `${debut}/?${new URLSearchParams({ dossier: lieu.tableau })}` : `${debut}/t/${t}`
  const enGrand = lieu.type !== undefined && EN_GRAND.has(lieu.type)
  if (!enGrand && (r.estDossier(lieu.tableau) || r.estAccueil(lieu.tableau))) {
    return `${debut}/?${new URLSearchParams({ dossier: lieu.tableau, element: lieu.element })}`
  }
  return `${debut}/t/${t}/e/${encodeURIComponent(lieu.element)}`
}
