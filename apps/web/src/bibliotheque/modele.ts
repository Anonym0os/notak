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

/** Ce que portent les toiles, et qui ne s'ouvre pas en soi : une photo, un lien, un fichier. */
export const PIECES: ReadonlySet<Genre> = new Set<Genre>(['image', 'lien', 'fichier'])

/**
 * Ce que les puces gardent, là où l'on est. Dans toute la bibliothèque et dans les récents se mêle ce que portent toutes
 * les toiles : « Tout » y garde ce qui s'ouvre (toiles, dossiers, pages, cartes mentales), et les photos, liens et
 * fichiers restent sous leur puce, comme les pièces jointes d'un message. Dans un dossier ou parmi les favoris, ils
 * ont été rangés ou choisis un à un : « Tout » les montre, comme le Finder tout ce qu'un dossier contient.
 */
export function parLesPuces(vue: Vue, entrees: readonly EntreeBibliotheque[]): EntreeBibliotheque[] {
  if (vue.filtre !== 'tout') return duFiltre(vue.filtre, entrees)
  const melees = !vue.dossier && (vue.portee === 'tout' || vue.portee === 'recents')
  return melees ? entrees.filter((e) => !PIECES.has(e.genre)) : [...entrees]
}

/**
 * Où montrer ce qui vient d'arriver (un import) quand la vue ne le montre pas : les récents, qui prennent ce qu'on
 * touche, sous la puce de leur genre si ce sont des pièces d'un même genre ; des pièces mêlées, dans la toile où elles
 * sont posées, parcourue comme un dossier, qui montre tout ce qu'elle porte.
 */
export function vueDeLArrivee(entrees: readonly Pick<EntreeBibliotheque, 'genre'>[], dans: string): Vue {
  const genres = new Set(entrees.map((e) => e.genre))
  const pieces = [...genres].filter((g) => PIECES.has(g))
  if (pieces.length === 0) return { portee: 'recents', filtre: 'tout' }
  if (genres.size === 1) return { portee: 'recents', filtre: pieces[0]! }
  return { portee: 'tout', filtre: 'tout', dossier: dans }
}

/** Combien chaque puce en garderait, dans cette portée : une puce sans rien se grise. */
export function compterParGenre(entrees: readonly EntreeBibliotheque[]): Record<Filtre, number> {
  const n = { tout: entrees.length, toile: 0, document: 0, arbre: 0, image: 0, lien: 0, fichier: 0 } satisfies Record<Filtre, number>
  for (const e of entrees) n[e.genre]++
  return n
}

/** La vue qu'on regarde : où, et quoi ; `dossier`, une toile qu'on parcourt, tient lieu de portée. */
export interface Vue {
  portee: Portee
  filtre: Filtre
  dossier?: string
}

// ---- Les dossiers : une toile, parcourue comme un dossier ----

/** Une toile qui se montre en dossier (`Tableau.dossier`) : elle s'ouvre d'abord ici, en liste de ce qu'elle porte. */
export const estDossier = (e: Pick<EntreeBibliotheque, 'element' | 'resume'>) => e.element === null && e.resume.genre === 'toile' && e.resume.dossier === true

/**
 * Un dossier qu'un outil rattaché a généré (celui d'une de ses fiches, ou celui qui les range, « Clients ») : il reste
 * tel que l'outil l'a fait, là où il l'a mis, comme les fiches chez lui. Ni déplacé, ni renommé, ni jeté, ni montré en
 * toile : le serveur le refuse aussi. On range dedans ce qu'on veut.
 */
export const genere = (e: Pick<EntreeBibliotheque, 'element' | 'outil'>) => e.element === null && e.outil !== undefined

/** Ce qu'une toile porte directement : les toiles qu'elle range, et ses pages, cartes, photos, liens et fichiers. */
export const contenuDuDossier = (id: string, entrees: readonly EntreeBibliotheque[]) => entrees.filter((e) => e.dans === id && !(e.element === null && e.tableau === id))

/** Au plus tant d'entrées dans l'aperçu d'un dossier : quatre petites vignettes, comme le Finder ou Drive. */
export const APERCU_MAX = 4

/**
 * Les entrées, chaque dossier portant l'aperçu de ce qu'il range (`resume.apercu`) : ses premières entrées dans l'ordre
 * où il les montre ouvert, la plus récente d'abord, puis par titre. Sa vignette le distingue ainsi des autres ; vide, il
 * n'en a pas. Un dossier rangé dans un autre s'y montre par son icône : pas d'aperçu dans l'aperçu.
 */
export function avecApercus(entrees: EntreeBibliotheque[]): EntreeBibliotheque[] {
  const contenus = new Map(entrees.filter(estDossier).map((e) => [e.tableau, [] as EntreeBibliotheque[]]))
  if (contenus.size === 0) return entrees
  for (const e of entrees) if (e.dans && !(e.element === null && e.tableau === e.dans)) contenus.get(e.dans)?.push(e)
  const ordre = (a: EntreeBibliotheque, b: EntreeBibliotheque) =>
    (b.vu ?? -1) - (a.vu ?? -1) || (a.titre || '\uffff').localeCompare(b.titre || '\uffff', undefined, { sensitivity: 'base', numeric: true })
  return entrees.map((e) => {
    const contenu = estDossier(e) ? contenus.get(e.tableau)!.sort(ordre).slice(0, APERCU_MAX) : []
    if (contenu.length === 0) return e
    const apercu = contenu.map(({ tableau, resume: { apercu: _, ...resume } }) => ({ tableau, resume }))
    return { ...e, resume: { ...e.resume, apercu } }
  })
}

/**
 * Le chemin d'une toile depuis l'accueil, elle comprise : `[accueil, …, id]`. Une toile dont on ne lit pas le haut (un
 * partage) commence là où l'on ne sait plus ; un cycle (une carte posée dans sa propre descendante) s'arrête.
 */
export function filDAriane(id: string, entrees: readonly EntreeBibliotheque[], racine: string | null): string[] {
  const dansDe = new Map(entrees.flatMap((e) => (e.element === null ? [[e.tableau, e.dans] as const] : [])))
  const fil = [id]
  for (let ici = id; ici !== racine; ) {
    const haut = dansDe.get(ici)
    if (!haut || fil.includes(haut)) break
    fil.unshift(haut)
    ici = haut
  }
  return fil
}

/** Un nœud de l'arbre des dossiers de la colonne ; `outil` : celui qui l'a généré, que la ligne nomme. */
export interface NoeudDossier {
  id: string
  titre: string
  outil?: string
  enfants: NoeudDossier[]
}

/** L'arbre des dossiers sous `racine` (l'accueil), par titre : les toiles montrées en dossier, à leur place. */
export function arbreDesDossiers(entrees: readonly EntreeBibliotheque[], racine: string): NoeudDossier[] {
  const dossiers = entrees.filter(estDossier)
  const ids = new Set(dossiers.map((e) => e.tableau))
  const sous = new Map<string, EntreeBibliotheque[]>()
  for (const e of dossiers) {
    // Un dossier rangé dans une toile ordinaire remonte au premier dossier au-dessus d'elle, sinon à l'accueil.
    const fil = filDAriane(e.tableau, entrees, racine).slice(0, -1)
    const haut = [...fil].reverse().find((x) => ids.has(x)) ?? racine
    sous.set(haut, [...(sous.get(haut) ?? []), e])
  }
  const parTitre = (a: EntreeBibliotheque, b: EntreeBibliotheque) => a.titre.localeCompare(b.titre, undefined, { sensitivity: 'base', numeric: true })
  const batir = (haut: string, vus: Set<string>): NoeudDossier[] =>
    (sous.get(haut) ?? [])
      .filter((e) => !vus.has(e.tableau))
      .sort(parTitre)
      .map((e) => ({ id: e.tableau, titre: e.titre, ...(e.outil ? { outil: e.outil } : {}), enfants: batir(e.tableau, new Set([...vus, e.tableau])) }))
  return batir(racine, new Set([racine]))
}

/** Les anciennes adresses (`?vue=toiles`) : une rubrique d'un seul genre, c'est toute la bibliothèque, filtrée. */
const ANCIENNES: Record<string, Genre> = Object.fromEntries(Object.entries(PLURIEL).map(([genre, pluriel]) => [pluriel, genre as Genre]))

/**
 * La vue que dit l'adresse (`?vue=favoris&type=image`), ou `null` pour la portée si elle n'en dit rien : la page choisit
 * alors (les récents, sinon tout). Une ancienne adresse d'un seul genre (`?vue=photos`) se lit encore.
 */
export function lireVue(recherche: string): { portee: Portee | null; filtre: Filtre; dossier?: string } {
  const p = new URLSearchParams(recherche)
  const dossier = p.get('dossier')
  const vue = p.get('vue') ?? ''
  const type = p.get('type') ?? ''
  const filtre: Filtre = (TYPES as readonly string[]).includes(type) ? (type as Genre) : 'tout'
  if (ANCIENNES[vue]) return { portee: 'tout', filtre: ANCIENNES[vue] }
  return { portee: (PORTEES as readonly string[]).includes(vue) ? (vue as Portee) : null, filtre, ...(dossier ? { dossier } : {}) }
}

/** L'adresse d'une vue : `/` pour les récents sans filtre, sinon ce qui la redit ; un dossier, `?dossier=<id>`. */
export function adresseDeLaVue({ portee, filtre, dossier }: Vue): string {
  const p = new URLSearchParams()
  if (dossier) p.set('dossier', dossier)
  else if (portee !== 'recents') p.set('vue', portee)
  if (filtre !== 'tout') p.set('type', filtre)
  const q = p.toString()
  return q ? `/?${q}` : '/'
}

/**
 * L'adresse d'un dossier dans la bibliothèque : il ne s'ouvre jamais en toile. Avec `element`, ce qu'il porte s'y
 * choisit à l'arrivée, et s'ouvre seul (une photo, un fichier, une page) ; c'est ce que donnent « Copier le lien » et
 * les fiches d'un autre outil.
 */
export function adresseDuDossier(dossier: string, element?: string | null): string {
  const p = new URLSearchParams({ dossier })
  if (element) p.set('element', element)
  return `/?${p.toString()}`
}

/** L'élément que l'adresse demande d'ouvrir dans son dossier (`?dossier=…&element=…`), ou `null`. */
export const elementDeLAdresse = (recherche: string): string | null => {
  const p = new URLSearchParams(recherche)
  return (p.get('dossier') && p.get('element')) || null
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
