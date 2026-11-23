import type { EntreeBibliotheque } from '../api'

/**
 * Ce que la bibliothèque montre se choisit sur deux axes, comme dans Fichiers ou Google Drive : **où** (la colonne : la
 * bibliothèque rangée, sa racine ou un de ses dossiers, puis les récents, les favoris, ce qu'on partage avec moi) et
 * **quoi** (les puces : tout, ou un seul genre). Les deux se combinent : les photos parmi les favoris, les pages d'un
 * dossier.
 *
 * La bibliothèque s'ouvre sur sa racine (« Mon espace ») : ce qui y est rangé, et rien d'autre. Ce qu'on crée sans
 * dossier y va, ce qu'on crée dans un dossier y reste ; les récents ne sont qu'un raccourci vers ce qu'on a touché, qui
 * dit où chaque chose est rangée.
 */

/** Où l'on regarde : `tout`, la bibliothèque rangée (sa racine, ou le dossier que dit `Vue.dossier`). */
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

/**
 * Ce que la portée garde, avant les puces : `tout`, toute la bibliothèque à plat (ce que lit la recherche) ; les
 * récents, seulement ce qu'on a ouvert.
 */
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
 * Ce que les puces gardent, là où l'on est. Dans les récents se mêle ce que portent toutes les toiles : « Tout » y garde
 * ce qui s'ouvre (toiles, dossiers, pages, cartes mentales), et les photos, liens et fichiers restent sous leur puce,
 * comme les pièces jointes d'un message. Dans la racine, un dossier ou parmi les favoris, ils ont été rangés ou choisis
 * un à un : « Tout » les montre, comme le Finder tout ce qu'un dossier contient.
 */
export function parLesPuces(vue: Vue, entrees: readonly EntreeBibliotheque[]): EntreeBibliotheque[] {
  if (vue.filtre !== 'tout') return duFiltre(vue.filtre, entrees)
  const melees = !vue.dossier && (vue.portee === 'tout' || vue.portee === 'recents')
  return melees ? entrees.filter((e) => !PIECES.has(e.genre)) : [...entrees]
}

/**
 * Où montrer ce qui vient d'arriver (un import) quand la vue ne le montre pas : là où c'est rangé, la racine, le dossier
 * ou la toile qui l'a pris (parcourue comme un dossier, qui montre tout ce qu'elle porte), et non les récents, qui ne
 * diraient pas où le retrouver.
 */
export const vueDeLArrivee = (dans: string): Vue => ({ portee: 'tout', filtre: 'tout', dossier: dans })

/** Combien chaque puce en garderait, dans cette portée : une puce sans rien se grise. */
export function compterParGenre(entrees: readonly EntreeBibliotheque[]): Record<Filtre, number> {
  const n = { tout: entrees.length, toile: 0, document: 0, arbre: 0, image: 0, lien: 0, fichier: 0 } satisfies Record<Filtre, number>
  for (const e of entrees) n[e.genre]++
  return n
}

/**
 * La vue qu'on regarde : où, et quoi ; `dossier`, une toile qu'on parcourt (la racine comprise), tient lieu de portée.
 * La bibliothèque rangée, c'est `{ portee: 'tout', dossier }` : sans `dossier`, il n'y a que la recherche à plat.
 */
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

/**
 * Une toile à soi que rien ne range : sans carte sur une toile qu'on lit, ni parent en base qu'on lise. La racine la
 * montre, comme la toile ouverte la met sous « Mon espace » dans son fil : rien ne doit se trouver seulement par les
 * récents. Une toile qu'on nous partage sans ce qui la range reste dans « Partagés avec moi ».
 */
export const sansPlace = (e: Pick<EntreeBibliotheque, 'element' | 'dans' | 'partage'>) => e.element === null && e.dans === null && !e.partage

/**
 * Ce qu'une toile porte directement : les toiles qu'elle range, et ses pages, cartes, photos, liens et fichiers. La
 * racine (`racine`) porte aussi les toiles à soi que rien ne range (`sansPlace`).
 */
export const contenuDuDossier = (id: string, entrees: readonly EntreeBibliotheque[], racine?: string | null) =>
  entrees.filter((e) => (e.dans === id || (id === racine && sansPlace(e))) && !(e.element === null && e.tableau === id))

// ---- L'ordre de la bibliothèque ----

/**
 * Comment la racine et les dossiers s'ordonnent, les dossiers toujours d'abord (par nom, comme l'arbre de la colonne) :
 * le reste par date de création, la plus récente d'abord (ce qu'on vient de créer arrive en tête, juste après les
 * dossiers), ou par nom. Jamais par dernière ouverture : ouvrir ou changer quelque chose ne le déplace pas, c'est
 * l'affaire des récents. Le choix vaut pour tous les dossiers.
 */
export const TRIS = ['creation', 'nom'] as const
export type Tri = (typeof TRIS)[number]

/** L'alphabet des identifiants (`nouvelId`) : la base 32 de Crockford. */
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ID_DATE = /^[0-9A-HJKMNP-TV-Z]{26}$/
/** Avant, ce n'est pas une date de Notak : un identifiant venu d'ailleurs qui ressemblerait à l'un des siens. */
const DEPUIS = Date.UTC(2020, 0, 1)

/**
 * Quand une toile ou un élément est né, d'après son identifiant : ses dix premiers signes disent l'instant de sa création
 * (`nouvelId`). Un élément qu'on déplace renaît dans la toile qui le prend ; une toile garde sa date. `null` pour un
 * identifiant d'une autre forme (une racine, un import d'ailleurs).
 */
export function neLe(e: Pick<EntreeBibliotheque, 'tableau' | 'element'>, maintenant = Date.now()): number | null {
  const id = e.element ?? e.tableau
  if (!ID_DATE.test(id)) return null
  let t = 0
  for (const c of id.slice(0, 10)) t = t * 32 + BASE32.indexOf(c)
  return t >= DEPUIS && t <= maintenant + 86_400_000 ? t : null
}

const parNom = (a: EntreeBibliotheque, b: EntreeBibliotheque) =>
  (a.titre || '\uffff').localeCompare(b.titre || '\uffff', undefined, { sensitivity: 'base', numeric: true })
const parCle = (a: EntreeBibliotheque, b: EntreeBibliotheque) => {
  const x = `${a.tableau}/${a.element ?? ''}`
  const y = `${b.tableau}/${b.element ?? ''}`
  return x < y ? -1 : x > y ? 1 : 0
}

/** Les entrées d'un endroit, dans l'ordre où il les montre : les dossiers par nom, puis le reste selon `tri`. */
export function ordonner(entrees: readonly EntreeBibliotheque[], tri: Tri, maintenant = Date.now()): EntreeBibliotheque[] {
  const date = new Map(entrees.map((e) => [e, neLe(e, maintenant) ?? -1]))
  return [...entrees].sort((a, b) => {
    const da = estDossier(a)
    const db = estDossier(b)
    if (da !== db) return da ? -1 : 1
    if (da || tri === 'nom') return parNom(a, b) || date.get(b)! - date.get(a)! || parCle(a, b)
    return date.get(b)! - date.get(a)! || parNom(a, b) || parCle(a, b)
  })
}

/** Au plus tant d'entrées dans l'aperçu d'un dossier : quatre petites vignettes, comme le Finder ou Drive. */
export const APERCU_MAX = 4

/**
 * Les entrées, chaque dossier portant l'aperçu de ce qu'il range (`resume.apercu`) : ses premières entrées dans l'ordre
 * où il les montre ouvert, par défaut (`ordonner`, par date de création). Sa vignette le distingue ainsi des autres ;
 * vide, il n'en a pas. Un dossier rangé dans un autre s'y montre par son icône : pas d'aperçu dans l'aperçu.
 */
export function avecApercus(entrees: EntreeBibliotheque[]): EntreeBibliotheque[] {
  const contenus = new Map(entrees.filter(estDossier).map((e) => [e.tableau, [] as EntreeBibliotheque[]]))
  if (contenus.size === 0) return entrees
  for (const e of entrees) if (e.dans && !(e.element === null && e.tableau === e.dans)) contenus.get(e.dans)?.push(e)
  return entrees.map((e) => {
    const contenu = estDossier(e) ? ordonner(contenus.get(e.tableau)!, 'creation').slice(0, APERCU_MAX) : []
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
 * La vue que dit l'adresse (`?vue=favoris&type=image`, `?dossier=…`). Sans portée ni dossier, c'est la racine (`/`), où
 * la bibliothèque s'ouvre ; `?vue=tout`, d'avant, et une ancienne adresse d'un seul genre (`?vue=photos`) y mènent aussi.
 * `racine` : la toile d'accueil de l'espace, qui tient la racine ; sans elle, la vue reste à plat.
 */
export function lireVue(recherche: string, racine: string | null): Vue {
  const p = new URLSearchParams(recherche)
  const dossier = p.get('dossier')
  const vue = p.get('vue') ?? ''
  const type = p.get('type') ?? ''
  const filtre: Filtre = ANCIENNES[vue] ?? ((TYPES as readonly string[]).includes(type) ? (type as Genre) : 'tout')
  const ou = dossier ?? racine
  const portee = !dossier && (PORTEES as readonly string[]).includes(vue) ? (vue as Portee) : 'tout'
  return portee === 'tout' && ou ? { portee, filtre, dossier: ou } : { portee, filtre }
}

/**
 * Deux vues au même endroit : le même dossier, ou, hors des dossiers, la même portée. Changer d'endroit (entrer dans un
 * dossier, en sortir par le fil ou la colonne) fait un pas d'historique, que « précédent » défait, comme dans le Finder ;
 * changer de puce au même endroit ne fait que régler la vue, et l'historique ne s'en encombre pas.
 */
export const memeEndroit = (a: Vue, b: Vue): boolean => (a.dossier || b.dossier ? a.dossier === b.dossier : a.portee === b.portee)

/** L'adresse d'une vue : `/` pour la racine (`racine`) sans filtre, sinon ce qui la redit ; un dossier, `?dossier=<id>`. */
export function adresseDeLaVue({ portee, filtre, dossier }: Vue, racine?: string | null): string {
  const p = new URLSearchParams()
  if (dossier && dossier !== racine) p.set('dossier', dossier)
  else if (!dossier && portee !== 'tout') p.set('vue', portee)
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
