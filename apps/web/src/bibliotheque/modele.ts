import type { EntreeBibliotheque } from '../api'

/**
 * Ce que la bibliothèque montre se choisit sur deux axes, comme dans Fichiers ou Google Drive : **où** (la colonne :
 * toute la bibliothèque, les récents, les favoris, ce qu'on partage avec moi) et **quoi** (les puces : tout, ou un seul
 * genre). Les deux se combinent : les photos parmi les favoris, les pages récentes.
 */

/** Où l'on regarde. */
export const PORTEES = ['tout', 'recents', 'favoris', 'partages'] as const
export type Portee = (typeof PORTEES)[number]

/** Les genres qu'une puce isole, dans l'ordre des puces. */
export const TYPES = ['toile', 'document', 'arbre', 'image', 'lien', 'fichier'] as const satisfies readonly EntreeBibliotheque['genre'][]
export type Genre = (typeof TYPES)[number]
/** Ce que les puces gardent : tout, ou un genre. */
export type Filtre = 'tout' | Genre

/** Le nom pluriel de chaque genre, celui de sa puce (« Toiles », « Photos ») : `biblio.rubrique.<nom>`. */
export const PLURIEL: Record<Genre, string> = { toile: 'toiles', document: 'documents', arbre: 'cartes', image: 'photos', lien: 'liens', fichier: 'fichiers' }

/** Les récents s'arrêtent là : au-delà, on passe par la bibliothèque entière. */
export const RECENTS_MAX = 60

/** Ce que la portée garde, avant les puces ; les récents, seulement ce qu'on a ouvert, et pas plus de `RECENTS_MAX`. */
export function dansLaPortee(portee: Portee, entrees: readonly EntreeBibliotheque[]): EntreeBibliotheque[] {
  switch (portee) {
    case 'tout':
      return [...entrees]
    case 'recents':
      return entrees.filter((e) => e.vu !== null)
    case 'favoris':
      return entrees.filter((e) => e.favori)
    case 'partages':
      return entrees.filter((e) => e.partage)
  }
}

/** Ce que les puces gardent. */
export const duFiltre = (filtre: Filtre, entrees: readonly EntreeBibliotheque[]) => (filtre === 'tout' ? [...entrees] : entrees.filter((e) => e.genre === filtre))

/** Combien chaque puce en garderait, dans cette portée : une puce sans rien se grise. */
export function compterParGenre(entrees: readonly EntreeBibliotheque[]): Record<Filtre, number> {
  const n = { tout: entrees.length, toile: 0, document: 0, arbre: 0, image: 0, lien: 0, fichier: 0 } satisfies Record<Filtre, number>
  for (const e of entrees) n[e.genre]++
  return n
}

/** La vue qu'on regarde : où, et quoi. */
export interface Vue {
  portee: Portee
  filtre: Filtre
}

/** Les anciennes adresses (`?vue=toiles`) : une rubrique d'un seul genre, c'est toute la bibliothèque, filtrée. */
const ANCIENNES: Record<string, Genre> = Object.fromEntries(Object.entries(PLURIEL).map(([genre, pluriel]) => [pluriel, genre as Genre]))

/**
 * La vue que dit l'adresse (`?vue=favoris&type=image`), ou `null` pour la portée si elle n'en dit rien : la page choisit
 * alors (les récents, sinon tout). Une ancienne adresse d'un seul genre (`?vue=photos`) se lit encore.
 */
export function lireVue(recherche: string): { portee: Portee | null; filtre: Filtre } {
  const p = new URLSearchParams(recherche)
  const vue = p.get('vue') ?? ''
  const type = p.get('type') ?? ''
  const filtre: Filtre = (TYPES as readonly string[]).includes(type) ? (type as Genre) : 'tout'
  if (ANCIENNES[vue]) return { portee: 'tout', filtre: ANCIENNES[vue] }
  return { portee: (PORTEES as readonly string[]).includes(vue) ? (vue as Portee) : null, filtre }
}

/** L'adresse d'une vue : `/` pour les récents sans filtre, sinon ce qui la redit. */
export function adresseDeLaVue({ portee, filtre }: Vue): string {
  const p = new URLSearchParams()
  if (portee !== 'recents') p.set('vue', portee)
  if (filtre !== 'tout') p.set('type', filtre)
  const q = p.toString()
  return q ? `/?${q}` : '/'
}

/** Comment les tuiles se montrent : en grille de vignettes, ou en liste, une ligne chacune. */
export type Affichage = 'grille' | 'liste'
const CLE_AFFICHAGE = 'notak:bibliotheque-affichage'
export function lireAffichage(): Affichage {
  try {
    return localStorage.getItem(CLE_AFFICHAGE) === 'liste' ? 'liste' : 'grille'
  } catch {
    return 'grille'
  }
}
export function ecrireAffichage(a: Affichage) {
  try {
    localStorage.setItem(CLE_AFFICHAGE, a)
  } catch {
    // Sans stockage, le choix vaut pour la visite.
  }
}
