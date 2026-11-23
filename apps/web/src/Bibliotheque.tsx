import {
  BandeauAvis,
  BoutonIlot,
  type EntreeMenu,
  type EspaceNavigable,
  type FenetresNotak,
  type Fichier,
  type GenreNeuf,
  Icone,
  Ilot,
  MenuContextuel,
  type NomIcone,
  annoncer,
  auDoigt as ecranAuDoigt,
  creerDans,
  demanderAMontrer,
  FeuilleBas,
  langue,
  ModaleFichier,
  quandPretes,
  type ResultatRecherche,
  resumesDuTableau,
} from '@notak/tableau'
import { FilDAriane, type GenreNiveau, usePlaceDuFil } from '@notak/tableau'
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type BilanRangement,
  type EntreeBibliotheque,
  definirFavori as definirFavoriApi,
  lireBibliotheque,
  noterElementVu,
  noterVu as noterVuToile,
  rangerToile as rangerToileApi,
  rechercherPartout,
} from './api'
import {
  type EspaceRangement,
  type Outils,
  type Resultat,
  creerDossier,
  deplacerEntrees,
  montrerEntreeEnDossier,
  dupliquerEntrees,
  favoris,
  jeterEntrees,
  importerEntrees,
  rangerDansUneNeuve,
  rangerLesRestes,
  resteTelQuel,
  restesDe,
  renommerEntree,
} from './bibliotheque/actions'
import { type Correctif, DUREE_CORRECTIF, avecCorrectifs, corriger } from './bibliotheque/correctifs'
import { Confirmation, DeplacerVers } from './bibliotheque/Dialogues'
import {
  type Boite,
  type Direction,
  RIEN,
  type Selection,
  cadreEntre,
  cadrer,
  cleDe,
  cliquer,
  garder,
  horsDAtteinte,
  porteuseDe,
  toutChoisir,
  voisine,
} from './bibliotheque/selection'
import { FournisseurVignettes, type SourceVignettes, Vignette } from './bibliotheque/Vignettes'
import { fichiers as fichiersServeur } from './fichiers'
import { suivreAppuiLong } from './bibliotheque/appuiLong'
import { memeLecture, useRelecture } from './bibliotheque/relecture'
import {
  type Affichage,
  type Filtre,
  type NoeudDossier,
  type Portee,
  type Tri,
  type Vue,
  PLURIEL,
  RECENTS_MAX,
  TRIS,
  TYPES,
  adresseDeLaVue,
  arbreDesDossiers,
  compterParGenre,
  contenuDuDossier,
  dansLaPortee,
  duFiltre,
  parLesPuces,
  estDossier,
  filDAriane,
  genere,
  ecrireAffichage,
  adresseDuDossier,
  elementDeLAdresse,
  lireAffichage,
  lireVue,
  memeEndroit,
  neLe,
  ordonner,
  sansPlace,
  vueDeLArrivee,
} from './bibliotheque/modele'
import { BarreChoix } from './bibliotheque/BarreChoix'
import { videsAJeter } from './bibliotheque/vides'
import { PremierPas } from './bibliotheque/PremierPas'
import { preparerClavier } from './bibliotheque/clavier'
import {
  BoutonPlus,
  BoutonReglages,
  CarteBienvenue,
  ChoixCreation,
  EnteteDoigt,
  type GenreLigne,
  LigneDoigt,
  Passages,
  quand,
  useAuTelephone,
  useBienvenue,
} from './bibliotheque/AuDoigt'
import { vibrer } from './appareil'
import { ecouterImportBureau } from './importBureau'
import type { BilanImport } from './importation'
import { ouvrirDehors } from './bureau'
import { allerA, ecouterAllerA, signalerAdresse, surLien } from './chemin'
import { t, tn } from './langue'

/**
 * La bibliothèque, page d'accueil de l'édition serveur : tout ce que le compte peut ouvrir, en vignettes, comme chez
 * Xmind. Une colonne à gauche (la racine, « Mon espace », où l'on arrive ; les récents, les favoris, les partages ; puis
 * l'arbre des dossiers), la barre de l'application en haut. Chaque endroit répond à une seule question : la racine et
 * les dossiers, « où est-ce rangé ? », dans un ordre qui ne bouge pas quand on ouvre quelque chose (`ordonner`) ; les
 * récents, « qu'est-ce que je faisais ? », en lignes de texte qui disent où chaque chose est rangée ; la recherche, « où
 * est X ? », d'où qu'on soit. Au téléphone, la même page prend sa forme au doigt (ses pièces sont dans
 * `bibliotheque/AuDoigt.tsx`).
 */

export type { Tri }

const ICONE_PORTEE: Record<Portee, NomIcone> = { tout: 'maison', recents: 'horloge', favoris: 'etoile', partages: 'equipe' }
const ICONE_TRI: Record<Tri, NomIcone> = { creation: 'calendrier', nom: 'texte', manuel: 'pointeur' }
const ICONE_GENRE: Record<EntreeBibliotheque['genre'], NomIcone> = { toile: 'tableau', arbre: 'carteMentale', document: 'document', image: 'photo', lien: 'lien', fichier: 'fichier' }
/** L'icône d'une entrée : celle de son genre, celle d'un dossier pour une toile qui se montre en dossier. */
const iconeDe = (e: EntreeBibliotheque): NomIcone => (estDossier(e) ? 'dossier' : ICONE_GENRE[e.genre])
/** Le genre d'une entrée, en un mot : « Dossier » pour une toile qui se montre en dossier. */
const genreDe = (e: EntreeBibliotheque) => (estDossier(e) ? t('biblio.genre.dossier') : t(`biblio.genre.${e.genre}`))
/** Ce qui s'ouvre en grand sur sa toile ; une photo, un lien ou un fichier s'ouvrent sur leur toile, centrés sur eux. */
const EN_GRAND = new Set<EntreeBibliotheque['genre']>(['arbre', 'document'])

/** Le nom d'une tuile : son titre ; une photo sans légende se dit « Photo », un lien sans titre, son site. */
export function titreDe(e: Pick<EntreeBibliotheque, 'titre' | 'genre' | 'resume'>): string {
  if (e.titre) return e.titre
  if (e.genre === 'image') return t('biblio.genre.image')
  if (e.resume.genre === 'lien') return e.resume.site || domaineDe(e.resume.url) || t('biblio.genre.lien')
  return t('commun.sansTitre')
}
const domaineDe = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
/**
 * Ce que crée la tuile « Nouvelle… », là où l'on range (la racine, un dossier) : le genre de la puce (une toile pour
 * « Tout ») ; rien pour une photo, un lien ou un fichier, qui s'importent, ni dans les récents, les favoris et les
 * partages, qui ne rangent rien (« Nouveau » y crée à la racine).
 */
function neufDe({ filtre, dossier }: Vue): GenreNeuf | undefined {
  if (!dossier) return undefined
  if (filtre === 'tout') return 'toile'
  return filtre === 'toile' || filtre === 'document' || filtre === 'arbre' ? filtre : undefined
}

const JOUR = 86_400_000

const parTitre = (a: EntreeBibliotheque, b: EntreeBibliotheque) =>
  (a.titre || '￿').localeCompare(b.titre || '￿', undefined, { sensitivity: 'base', numeric: true })
const parOuverture = (a: EntreeBibliotheque, b: EntreeBibliotheque) => (b.vu ?? -1) - (a.vu ?? -1) || parTitre(a, b)

/** Ce qu'une vue garde avant les puces : ce que porte le dossier qu'on parcourt (la racine comprise), sinon la portée. */
const baseDe = (vue: Vue, toutes: readonly EntreeBibliotheque[], racine?: string | null) =>
  vue.dossier ? contenuDuDossier(vue.dossier, toutes, racine) : dansLaPortee(vue.portee, toutes)

/**
 * Ce que montre une vue (où, et quoi), dans son ordre. Les récents : le plus récemment ouvert d'abord, sans les dossiers
 * (on y reprend ce qu'on ouvre pour travailler), pas plus de `RECENTS_MAX`. Partout ailleurs, l'ordre de la
 * bibliothèque (`ordonner`) : les dossiers, puis le reste par `tri` ; à la main, celui que retient le dossier
 * (`ordreManuel`), hors de lui (les favoris, les partages), celui de la création.
 */
export function entreesDe(vue: Vue, toutes: readonly EntreeBibliotheque[], tri: Tri = 'creation', racine?: string | null, ordreManuel?: readonly string[]): EntreeBibliotheque[] {
  const l = parLesPuces(vue, baseDe(vue, toutes, racine))
  if (!vue.dossier && vue.portee === 'recents') return l.filter((e) => !estDossier(e)).sort(parOuverture).slice(0, RECENTS_MAX)
  return vue.dossier ? ordonner(l, tri, Date.now(), ordreManuel) : ordonner(l, tri === 'manuel' ? 'creation' : tri)
}

/** Le titre d'une vue : la portée, ou le genre quand on regarde toute la bibliothèque à travers une puce. */
export const titreDeLaVue = ({ portee, filtre }: Vue) => (portee === 'tout' && filtre !== 'tout' ? t(`biblio.rubrique.${PLURIEL[filtre]}`) : t(`biblio.rubrique.${portee}`))

/** Une suite de tuiles sous un titre : un jour des récents ; sans titre, l'endroit qu'on range, ou ce que trouve la recherche. */
export interface Section {
  cle: string
  titre: string
  entrees: EntreeBibliotheque[]
}

/** Le temps d'attente avant la recherche dans le contenu : les titres, eux, répondent à chaque lettre. */
const ATTENTE_CONTENU = 200
/** Combien de récents en lignes, quand la recherche au doigt s'ouvre sans rien encore. */
const RECENTS_AU_DOIGT = 8

/** Les récents, par jour d'ouverture : aujourd'hui, les sept derniers jours, plus tôt (puis jamais ouvertes, par sûreté). */
export function sectionsParDate(entrees: readonly EntreeBibliotheque[], maintenant = Date.now()): Section[] {
  const minuit = new Date(maintenant).setHours(0, 0, 0, 0)
  const groupes: Section[] = [
    { cle: 'aujourdhui', titre: t('biblio.groupe.aujourdhui'), entrees: [] },
    { cle: 'semaine', titre: t('biblio.groupe.semaine'), entrees: [] },
    { cle: 'avant', titre: t('biblio.groupe.avant'), entrees: [] },
    { cle: 'jamais', titre: t('biblio.groupe.jamais'), entrees: [] },
  ]
  for (const e of [...entrees].sort(parOuverture)) {
    const i = e.vu === null ? 3 : e.vu >= minuit ? 0 : e.vu >= maintenant - 7 * JOUR ? 1 : 2
    groupes[i]!.entrees.push(e)
  }
  return groupes.filter((g) => g.entrees.length > 0)
}

/**
 * Quand on l'a ouvert, dans la colonne des récents : l'heure pour aujourd'hui, le jour de la semaine dans les sept
 * derniers jours, la date au-delà (l'année si ce n'est pas celle-ci).
 */
export function quandRecent(ms: number, maintenant = Date.now()): string {
  const d = new Date(ms)
  if (ms >= new Date(maintenant).setHours(0, 0, 0, 0)) return new Intl.DateTimeFormat(langue(), { hour: '2-digit', minute: '2-digit' }).format(d)
  if (ms >= maintenant - 7 * JOUR) return new Intl.DateTimeFormat(langue(), { weekday: 'short' }).format(d)
  return dateDuJour(d, maintenant)
}

/** « 12 nov. », l'année en plus si ce n'est pas celle-ci. */
const dateDuJour = (d: Date, maintenant: number) =>
  new Intl.DateTimeFormat(langue(), { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(maintenant).getFullYear() ? { year: 'numeric' } : {}) }).format(d)

/**
 * La date de création d'une tuile, sous son titre, là où l'on range : elle rend l'ordre lisible. « Aujourd'hui », sinon
 * la date ; `null` quand l'identifiant ne la dit pas.
 */
export function dateDeCreation(e: Pick<EntreeBibliotheque, 'tableau' | 'element'>, maintenant = Date.now()): string | null {
  const ms = neLe(e, maintenant)
  if (ms === null) return null
  return ms >= new Date(maintenant).setHours(0, 0, 0, 0) ? t('biblio.groupe.aujourdhui') : dateDuJour(new Date(ms), maintenant)
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Ce qui se cherche d'une entrée, en plus de son titre : l'adresse et le site d'un lien, le nom d'un fichier. */
const enPlus = (r: EntreeBibliotheque['resume']) =>
  r.genre === 'lien' ? `${r.url} ${r.site ?? ''} ${r.description ?? ''}` : r.genre === 'fichier' ? r.nom : r.genre === 'image' ? 'photo' : ''

/** Ce qui répond à une recherche : chaque mot dans le titre (l'adresse d'un lien, le nom d'un fichier) ou dans le nom de la toile qui le porte. */
export function filtrer(entrees: readonly EntreeBibliotheque[], requete: string): EntreeBibliotheque[] {
  const mots = sansAccents(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return [...entrees]
  return entrees.filter((e) => {
    const texte = sansAccents(`${titreDe(e)} ${enPlus(e.resume)} ${e.ou ?? ''}`)
    return mots.every((m) => texte.includes(m))
  })
}

/**
 * L'adresse qui ouvre une entrée : la toile, ou l'élément en grand sur sa toile. Une photo, un lien ou un fichier (le
 * `genre` le dit) n'ont pas d'adresse à eux : c'est celle de leur toile.
 */
export const adresseDe = (e: Pick<EntreeBibliotheque, 'tableau' | 'element'> & { genre?: EntreeBibliotheque['genre'] }) =>
  e.element === null || (e.genre && !EN_GRAND.has(e.genre)) ? `/t/${encodeURIComponent(e.tableau)}` : `/t/${encodeURIComponent(e.tableau)}/e/${encodeURIComponent(e.element)}`

/**
 * Ouvre une entrée : la toile, ou l'élément en grand sur la sienne. Un élément porte `{ element }` dans son entrée
 * d'historique : le refermer revient à la bibliothèque d'où on l'a ouvert, au lieu de rester sur sa toile.
 */
export const allerAEntree = (e: Pick<EntreeBibliotheque, 'tableau' | 'element'>) => allerA(adresseDe(e), e.element ? { etat: { element: e.element } } : {})


/** L'ordre choisi, le même pour tous les dossiers ; « par date » et « par dossier », d'avant, reviennent au premier. */
const CLE_TRI = 'notak:bibliotheque-tri'
function lireTri(): Tri {
  try {
    return localStorage.getItem(CLE_TRI) === 'nom' ? 'nom' : 'creation'
  } catch {
    return 'creation'
  }
}
function ecrireTri(tri: Tri) {
  try {
    localStorage.setItem(CLE_TRI, tri)
  } catch {
    // Sans stockage, le choix vaut pour la visite.
  }
}

/** Ce que la page demande à l'espace : de quoi lire l'accueil, créer, ranger, et dire où est ce qu'on ouvre. */
type EspaceBibliotheque = EspaceRangement & Pick<EspaceNavigable, 'poserChemin'>

/** Une fenêtre ouverte par-dessus la page. */
type Fenetre =
  | { type: 'deplacer'; cles: string[] }
  | { type: 'partage'; tableau: string }
  | { type: 'confirmer'; titre: string; lignes: string[]; repondre(oui: boolean): void }

/** La tuile qu'on renomme sur place. */
type Renommage = { cle: string }

/** Le menu du clic droit : sur des tuiles, ou sur le fond ; ou celui du bouton « Trier ». */
type Menu = { x: number; y: number } & ({ type: 'tuiles'; cles: string[] } | { type: 'fond' } | { type: 'tri' })

/** Où ce qu'on glisse prendrait place, dans un dossier rangé à la main : avant ou après cette tuile. */
interface Insertion {
  cle: string
  apres: boolean
}

/**
 * Le glisser de tuiles : ce qu'on glisse, où est le pointeur, la toile survolée qui le prendrait, ou, rangé à la main,
 * la place qu'il prendrait parmi les autres.
 */
interface Glisse {
  cles: string[]
  x: number
  y: number
  cible: string | null
  insertion?: Insertion | null
}

/** Une toile, une carte ou un document entre dans les récents du compte. */
const noterVuEntree = (e: Pick<EntreeBibliotheque, 'tableau' | 'element'>) => (e.element ? noterElementVu(e.tableau, e.element) : noterVuToile(e.tableau))

/**
 * Sur un serveur, les photos viennent de ses fichiers, réduites à la largeur d'une vignette (`?l=`) : l'original d'un
 * appareil photo pèse des dizaines de fois plus. Ses toiles laissent venir l'aperçu d'un lien.
 */
const VIGNETTES_SERVEUR: SourceVignettes = {
  adresse: async (f, largeur) => {
    const a = await fichiersServeur.adresse(f)
    return a && largeur ? `${a}${a.includes('?') ? '&' : '?'}l=${largeur}` : a
  },
  distant: () => true,
}

/** Le pointeur à moins de tant de pixels du haut ou du bas de la page la fait défiler, pendant un cadre ou un glisser. */
const BORD_DEFILEMENT = 48

/** Crée sur une toile de l'espace (à la racine, sans `dans`) ; rend où aller. */
const creerDansLEspace = (espace: EspaceBibliotheque | undefined) => async (genre: GenreNeuf, dans?: string) => {
  const ou = dans ?? espace!.racine
  await quandPretes(espace!, [ou])
  return creerDans(espace!, ou, genre)
}

/**
 * Ce qu'on vient de créer depuis la bibliothèque, et où : au retour (précédent, la maison, le fil d'une toile), l'endroit
 * qui le range le montre, choisi, et son anneau bat une fois. Le temps de l'onglet, et d'une demi-heure au plus.
 */
const CLE_ARRIVEE = 'notak:bibliotheque-arrivee'
const ARRIVEE_MAX = 30 * 60_000
function poserArrivee(cle: string, ou: string) {
  try {
    sessionStorage.setItem(CLE_ARRIVEE, JSON.stringify({ cle, ou, quand: Date.now() }))
  } catch {
    // Sans stockage, rien ne bat au retour : la tuile est là où elle est rangée, en tête.
  }
}
function lireArrivee(): { cle: string; ou: string } | null {
  try {
    const a = JSON.parse(sessionStorage.getItem(CLE_ARRIVEE) ?? 'null') as { cle?: unknown; ou?: unknown; quand?: unknown } | null
    if (!a || typeof a.cle !== 'string' || typeof a.ou !== 'string' || typeof a.quand !== 'number' || Date.now() - a.quand > ARRIVEE_MAX) return null
    return { cle: a.cle, ou: a.ou }
  } catch {
    return null
  }
}
function oublierArrivee() {
  try {
    sessionStorage.removeItem(CLE_ARRIVEE)
  } catch {
    // Rien à oublier.
  }
}

/** La carte de bienvenue d'un serveur au téléphone, fermée une fois pour toutes (le stockage est déjà celui de ce serveur). */
export const CLE_BIENVENUE_SERVEUR = 'notak:serveur:bienvenue'

/** La carte du premier passage, au téléphone : sous quelle clé elle se ferme, son titre, ses lignes. */
export interface Bienvenue {
  cle: string
  titre: string
  lignes: readonly { icone: NomIcone; texte: string }[]
}

/** Celle d'un serveur : les toiles, le « + », et le rond du compte quand il est là. */
const bienvenueServeur = (compte: boolean): Bienvenue => ({
  cle: CLE_BIENVENUE_SERVEUR,
  titre: t('biblio.bienvenue.serveur.titre'),
  lignes: [
    { icone: 'bibliotheque', texte: t('biblio.bienvenue.toiles') },
    { icone: 'ajouter', texte: t('biblio.bienvenue.creer') },
    ...(compte ? [{ icone: 'compte' as const, texte: t('biblio.bienvenue.serveur.compte') }] : []),
  ],
})

/**
 * La bibliothèque, partout la même : sur un serveur comme dans l'app, à la souris comme au doigt. Au téléphone, elle
 * prend sa forme au doigt (grand titre, recherche qui le replie, accueil en vedette, une rangée de filtres) ; ses
 * gestes, ses dossiers et ses genres restent ceux de toutes les largeurs.
 */
export function PageBibliotheque(proprietes: Parameters<typeof BibliothequeBureau>[0]) {
  return <BibliothequeBureau {...proprietes} />
}

function BibliothequeBureau({
  charger = lireBibliotheque,
  espace,
  fenetres,
  compte,
  creer = creerDansLEspace(espace),
  rangerToile = rangerToileApi,
  definirFavori = definirFavoriApi,
  partage,
  importer,
  noterVu = noterVuEntree,
  vignettes = VIGNETTES_SERVEUR,
  ecouter,
  partages = true,
  decouvrir,
  attente = false,
  avatar,
  bienvenue,
  chercherContenu = rechercherPartout,
  racine: racineDonnee,
}: {
  charger?: () => Promise<EntreeBibliotheque[]>
  /** La toile d'accueil qui tient la racine, où la bibliothèque s'ouvre ; par défaut, celle de l'espace. */
  racine?: string
  /** Au téléphone, la pastille du compte seule, à côté de la roue et du « + » : la barre du bureau n'y va pas. */
  avatar?: ReactNode
  /** Au téléphone, la carte du premier passage ; sans, celle d'un serveur. */
  bienvenue?: Bienvenue
  /** Cherche dans le contenu des toiles (le texte des notes, des pages, des cartes mentales) : des passages. */
  chercherContenu?: (requete: string) => Promise<ResultatRecherche[]>
  /** Prévient quand la liste a changé ailleurs (les toiles de l'appareil) : la page se relit. Un serveur ne prévient pas. */
  ecouter?: (f: () => void) => () => void
  /** « Partagés avec moi » : sur un serveur. L'app n'a pas d'autres comptes. */
  partages?: boolean
  /** « Découvrir Notak » : pose le guide, une toile qui montre les gestes, et rend son identifiant. */
  decouvrir?: () => Promise<string>
  /** Il n'y a encore rien, et l'app attend la première lecture d'iCloud avant de proposer de créer. */
  attente?: boolean
  espace?: EspaceBibliotheque
  fenetres?: FenetresNotak
  /** Les notifications et le compte, que l'application prête à la barre. */
  compte?: ReactNode
  /** Crée sur une toile (à la racine, sans `dans`) ; rend où aller. */
  creer?: (genre: GenreNeuf, dans?: string) => Promise<{ tableau: string; element: string | null }>
  rangerToile?: Outils['rangerToile']
  definirFavori?: Outils['definirFavori']
  /** Le partage d'une toile, en fenêtre. */
  partage?: (tableau: string, fermer: () => void) => ReactNode
  /** Importe des fichiers de la machine sur une toile (lâchés sur la page, ou Fichier › Importer…). */
  importer?: (fichiers: File[], dans: string) => Promise<BilanImport>
  /** Fait entrer une toile, une carte ou un document dans les récents du compte. */
  noterVu?: (e: Pick<EntreeBibliotheque, 'tableau' | 'element'>) => Promise<void>
  /** D'où viennent les photos des vignettes, et quelles toiles laissent venir les images d'autres sites. */
  vignettes?: SourceVignettes
}) {
  const [serveur, setServeur] = useState<EntreeBibliotheque[] | null>(null)
  const [correctifs, setCorrectifs] = useState<{ n: number; correctif: Correctif }[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  /** La racine (« Mon espace ») : la toile d'accueil de l'espace, qui ne se montre pas, et range tout le reste. */
  const racine = racineDonnee ?? espace?.racine ?? null
  const [depart] = useState(() => lireVue(location.search, racine))
  const [portee, setPortee] = useState<Portee>(depart.portee)
  const [filtre, setFiltre] = useState<Filtre>(depart.filtre)
  /** La toile qu'on parcourt comme un dossier, la racine comprise : elle tient lieu de portée. */
  const [dossier, setDossier] = useState<string | null>(depart.dossier ?? null)
  /** Les dossiers ouverts dans l'arbre de la colonne. */
  const [deplies, setDeplies] = useState<ReadonlySet<string>>(new Set())
  const [tri, setTri] = useState<Tri>(lireTri)
  const [affichage, setAffichage] = useState<Affichage>(lireAffichage)
  const [requete, setRequete] = useState('')
  /** Au téléphone, la page prend sa forme au doigt ; et la recherche, ouverte d'un toucher, replie le grand titre. */
  const telephone = useAuTelephone()
  const [rechercheOuverte, setRechercheOuverte] = useState(false)
  /** Au téléphone, la feuille de ce qu'on crée, qu'ouvre le « + ». */
  const [feuilleNeuf, setFeuilleNeuf] = useState(false)
  const carteBienvenue = bienvenue ?? bienvenueServeur(!!avatar)
  const [bienvenueAMontrer, fermerBienvenue] = useBienvenue(carteBienvenue.cle)
  /** Le menu « Nouveau » ouvert, et d'où : la colonne, ou la barre quand la colonne est un tiroir. */
  const [menuNeuf, setMenuNeuf] = useState<false | 'colonne' | 'tete'>(false)
  /** Dans une fenêtre moyenne (un iPad en portrait), la colonne est un tiroir, qu'on ouvre par ☰. */
  const [tiroir, setTiroir] = useState(false)
  const [sel, setSel] = useState<Selection>(RIEN)
  /** Au doigt, « Sélectionner » : toucher une tuile la choisit (ou la retire) au lieu de l'ouvrir. */
  const [modeChoix, setModeChoix] = useState(false)
  const [courante, setCourante] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const [renommage, setRenommage] = useState<Renommage | null>(null)
  const [glisse, setGlisse] = useState<Glisse | null>(null)
  /** Des fichiers de la machine qu'on glisse sur la page : la toile où ils iraient. */
  const [apport, setApport] = useState<{ cible: string } | null>(null)
  /** Combien de fichiers sont en route, le temps de l'import. */
  const [importEnCours, setImportEnCours] = useState(0)
  /** Les tuiles qui viennent d'arriver, le temps que leur anneau batte. */
  const [arrivees, setArrivees] = useState<ReadonlySet<string>>(new Set())
  const [cadre, setCadre] = useState<Boite | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const boutonTiroir = useRef<HTMLButtonElement>(null)
  const nav = useRef<HTMLElement>(null)
  const corps = useRef<HTMLElement>(null)
  const minuteurs = useRef(new Set<ReturnType<typeof setTimeout>>())
  /**
   * La racine des toiles se nomme comme l'espace, et non comme la toile d'accueil qui la tient en coulisse : on y crée et
   * on y range, comme à la racine d'un Drive, sans croire qu'elle est une toile de plus.
   */
  const nomRacine = t('biblio.racine')

  /**
   * La page est-elle encore là ? Une lecture peut finir après qu'on a ouvert une toile (le catalogue de l'appareil lit
   * les toiles en tâche de fond) : elle ne touche plus alors à rien.
   */
  const montee = useRef(true)
  useEffect(() => {
    montee.current = true
    return () => {
      montee.current = false
    }
  }, [])
  const lire = useCallback(() => {
    setErreur(null)
    charger().then(
      (l) => montee.current && setServeur(l),
      (x: Error) => montee.current && setErreur(x.message || t('commun.echec')),
    )
  }, [charger])
  useEffect(lire, [lire])
  useEffect(() => ecouter?.(lire), [ecouter, lire])
  /** Sans bruit : la même liste ne bouge pas, et une panne passagère laisse celle qu'on voit. */
  const relireEnSilence = useCallback(() => {
    charger().then(
      (l) => {
        if (!montee.current) return
        setErreur(null)
        setServeur((avant) => (avant !== null && memeLecture(avant, l) ? avant : l))
      },
      () => {},
    )
  }, [charger])
  // Un serveur ne prévient de rien (les toiles de l'appareil, si : `ecouter`) : la page se relit d'elle-même.
  useRelecture(relireEnSilence, !ecouter)
  useEffect(() => {
    const m = minuteurs.current
    return () => m.forEach(clearTimeout)
  }, [])
  const plusTard = (f: () => void, ms: number) => {
    const id = setTimeout(() => {
      minuteurs.current.delete(id)
      f()
    }, ms)
    minuteurs.current.add(id)
  }
  /** Montre ces correctifs tout de suite ; la liste se relit quand le serveur a pu suivre, et ils s'effacent. */
  const compteur = useRef(0)
  const poser = (cs: Correctif[]) => {
    if (cs.length === 0) return
    const ns = cs.map((correctif) => ({ n: ++compteur.current, correctif }))
    setCorrectifs((l) => [...l, ...ns])
    const relire = () =>
      void charger().then(
        (l) => montee.current && setServeur(l),
        () => {},
      )
    plusTard(relire, 3500)
    plusTard(() => {
      setCorrectifs((l) => l.filter((x) => !ns.includes(x)))
      relire()
    }, DUREE_CORRECTIF)
  }
  const toutes = useMemo(() => (serveur ? avecCorrectifs(serveur, correctifs) : null), [serveur, correctifs])

  // Le tiroir refermé emporte le menu « Nouveau » qu'on y avait ouvert.
  useEffect(() => {
    if (!tiroir) setMenuNeuf((m) => (m === 'colonne' ? false : m))
  }, [tiroir])
  // Le tiroir ouvert : le clavier passe à sa rubrique courante ; Échap le referme et rend la main au bouton ☰.
  useEffect(() => {
    if (!tiroir) return
    const image = requestAnimationFrame(() =>
      (nav.current?.querySelector<HTMLElement>('.biblio-rubrique[aria-current="page"]') ?? nav.current?.querySelector<HTMLElement>('.biblio-rubrique'))?.focus({ preventScroll: true }),
    )
    const touche = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setTiroir(false)
      boutonTiroir.current?.focus()
    }
    window.addEventListener('keydown', touche, true)
    return () => {
      cancelAnimationFrame(image)
      window.removeEventListener('keydown', touche, true)
    }
  }, [tiroir])

  // ⌘F cherche dans la bibliothèque ; Échap vide la recherche.
  useEffect(() => {
    const touche = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        champ.current?.focus()
        champ.current?.select()
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [])

  // Au téléphone, ni tri ni affichage à choisir : en grille, dans l'ordre choisi sur un écran plus grand.
  const affichageVu: Affichage = telephone ? 'grille' : affichage
  /**
   * L'ordre à la main du dossier qu'on parcourt (la racine comprise), lu sur sa toile, que l'espace charge et suit :
   * un autre appareil, ou une autre personne, qui le change le change ici.
   */
  const [versionDossier, setVersionDossier] = useState(0)
  useEffect(() => {
    if (!espace || !dossier || tri !== 'manuel') return
    let vivant = true
    void quandPretes(espace, [dossier]).then(
      () => vivant && setVersionDossier((v) => v + 1),
      () => {},
    )
    const arreter = espace.ecouter(() => setVersionDossier((v) => v + 1))
    return () => {
      vivant = false
      arreter()
    }
  }, [espace, dossier, tri])
  const ordreManuel = useMemo(
    () => (tri === 'manuel' && espace && dossier ? espace.tableau(dossier)?.ordre : undefined),
    // `versionDossier` n'est pas lu : il dit que la toile du dossier a changé, et qu'il faut la relire.
    [espace, dossier, tri, versionDossier],
  )
  const vue: Vue = { portee, filtre, ...(dossier ? { dossier } : {}) }
  const cherche = requete.trim() !== ''
  /** Les récents : une liste de lignes, à part du rangement, sans puces, ni tri, ni tuile qui crée. */
  const enRecents = !dossier && portee === 'recents' && !cherche
  // La recherche lit toute la bibliothèque, d'où qu'on soit ; les puces la filtrent encore (au téléphone, elles se
  // cachent pendant qu'on cherche : elles ne filtrent rien).
  const filtreDeRecherche: Filtre = telephone ? 'tout' : filtre
  const visibles = useMemo(
    () =>
      toutes
        ? cherche
          ? duFiltre(filtreDeRecherche, filtrer(toutes, requete)).sort(parOuverture)
          : entreesDe({ portee, filtre, ...(dossier ? { dossier } : {}) }, toutes, tri, racine, ordreManuel)
        : [],
    [toutes, cherche, requete, portee, filtre, filtreDeRecherche, dossier, tri, racine, ordreManuel],
  )
  /** Ce que chaque puce garderait, là où l'on est. */
  const parGenre = useMemo(
    () => compterParGenre(toutes ? (cherche ? filtrer(toutes, requete) : baseDe({ portee, filtre: 'tout', ...(dossier ? { dossier } : {}) }, toutes, racine)) : []),
    [toutes, cherche, requete, portee, dossier, racine],
  )
  /** Les genres présents là où l'on est : les puces ne montrent qu'eux, et s'effacent toutes s'il n'y en a qu'un. */
  const genresIci = TYPES.filter((g) => parGenre[g] > 0)
  // Les récents, par jour ; ailleurs, une seule suite, dans l'ordre de la bibliothèque (ou, cherchant, du plus récent).
  const sections: Section[] = enRecents ? sectionsParDate(visibles) : [{ cle: cherche ? 'resultats' : 'ici', titre: '', entrees: visibles }]
  // Au téléphone, on crée par le « + » du haut : pas de tuile qui crée.
  const neuf = cherche || telephone ? undefined : neufDe(vue)

  // La recherche dans le contenu, décalée : les titres répondent à chaque lettre, le contenu un instant après.
  const chercheur = useRef(chercherContenu)
  chercheur.current = chercherContenu
  const [passages, setPassages] = useState<{ requete: string; resultats: ResultatRecherche[] }>({ requete: '', resultats: [] })
  const [tousPassages, setTousPassages] = useState(false)
  useEffect(() => {
    const r = requete.trim()
    setTousPassages(false)
    if (!r) return setPassages({ requete: '', resultats: [] })
    let fini = false
    const minuteur = setTimeout(() => {
      // Seulement ce qu'un élément contient : le titre d'une toile, c'est la recherche des titres qui le trouve.
      chercheur.current(r).then(
        (l) => !fini && setPassages({ requete: r, resultats: l.filter((x) => x.element) }),
        () => {},
      )
    }, ATTENTE_CONTENU)
    return () => {
      fini = true
      clearTimeout(minuteur)
    }
  }, [requete])
  // Les tuiles dans l'ordre où on les lit, de section en section : celui de ⇧ et des flèches.
  const ordre = useMemo(() => sections.flatMap((s) => s.entrees.map(cleDe)), [sections])
  const parCle = useMemo(() => new Map((toutes ?? []).map((e) => [cleDe(e), e])), [toutes])
  const entreesDes = (cles: Iterable<string>) => [...cles].flatMap((c) => parCle.get(c) ?? [])
  const choisies = ordre.filter((c) => sel.choisies.has(c))
  const cleOrdre = ordre.join('|')
  useEffect(() => setSel((s) => garder(s, cleOrdre ? cleOrdre.split('|') : [])), [cleOrdre])

  const outils: Outils | null = espace ? { espace, rangerToile, definirFavori } : null
  const titreToile = (id: string) => (id === racine ? nomRacine : parCle.get(`${id}/`)?.titre || t('commun.sansTitre'))
  /** Combien chaque toile porte directement (ce que montre son dossier ouvert) : sous la tuile d'un dossier. */
  const nombreDans = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of toutes ?? []) if (e.dans && !(e.element === null && e.tableau === e.dans)) n.set(e.dans, (n.get(e.dans) ?? 0) + 1)
    return n
  }, [toutes])
  /**
   * Ce qu'on ouvre d'ici arrive avec le chemin des dossiers où il est rangé (`parent` : pour une toile qu'on vient d'y
   * créer) : la barre de la toile le redit, et chaque maillon mène à sa liste, au lieu de croire qu'on vient de l'accueil
   * ou de la dernière toile parcourue.
   */
  const tenirLeChemin = (tableau: string, parent?: string) => {
    if (!espace || !toutes) return
    const c = parent ? [...filDAriane(parent, toutes, racine), tableau] : filDAriane(tableau, toutes, racine)
    if (espace.poserChemin) return espace.poserChemin(tableau, c.slice(0, -1))
    for (let i = 1; i < c.length; i++) espace.entrer?.(c[i]!, c[i - 1]!)
  }
  /**
   * Une toile qui se montre en dossier : elle ne s'ouvre jamais en toile, ni ce qu'elle porte sur la sienne. La racine en
   * est une : la toile d'accueil qui la tient ne s'ouvre que par la ligne de ce qu'elle seule montre (`ligneDeLaRacine`).
   */
  const enDossier = (id: string | null | undefined): boolean => {
    if (!id) return false
    if (id === racine) return true
    const e = parCle.get(`${id}/`)
    return !!e && estDossier(e)
  }

  /**
   * Change de vue : la portée (la colonne), le filtre (les puces), le dossier qu'on parcourt ; l'adresse la redit.
   * Choisir une portée quitte le dossier (`tout`, c'est la racine) ; changer de puce le garde. Changer d'endroit (un
   * dossier, une rubrique de la colonne) fait un pas d'historique, que « précédent » défait (`memeEndroit`) ; une puce
   * ne fait que réécrire l'adresse. `pas` en décide autrement.
   */
  const choisirVue = (v: Partial<Omit<Vue, 'dossier'>> & { dossier?: string | null }, pas?: boolean) => {
    const d = v.dossier !== undefined ? v.dossier : v.portee ? (v.portee === 'tout' ? racine : null) : dossier
    const apres: Vue = { portee: d ? 'tout' : (v.portee ?? portee), filtre: v.filtre ?? filtre, ...(d ? { dossier: d } : {}) }
    setPortee(apres.portee)
    setFiltre(apres.filtre)
    setDossier(d)
    const adresse = adresseDeLaVue(apres, racine)
    if ((pas ?? !memeEndroit(vue, apres)) && adresse !== location.pathname + location.search) history.pushState(null, '', adresse)
    else history.replaceState(history.state, '', adresse)
    signalerAdresse()
  }
  /**
   * Une rubrique de la colonne : on quitte la recherche, et le tiroir se referme sur la vue choisie. Changer d'endroit
   * remet la puce à « Tout » : les récents n'en ont pas, et une puce restée d'avant cacherait sans le dire.
   */
  const choisir = (r: Portee) => {
    setRequete('')
    setTiroir(false)
    setSel(RIEN)
    choisirVue({ portee: r, filtre: 'tout' })
    corps.current?.scrollTo?.({ top: 0 })
  }
  /**
   * Parcourt une toile comme un dossier : tout ce qu'elle porte (une puce restée d'avant y cacherait ses pages sans le
   * dire), son fil d'Ariane ; ses parents se déplient dans la colonne.
   */
  const parcourir = (id: string) => {
    setRequete('')
    setTiroir(false)
    setSel(RIEN)
    choisirVue({ dossier: id, filtre: 'tout' })
    setDeplies((d) => new Set([...d, ...(toutes ? filDAriane(id, toutes, racine) : [])]))
    corps.current?.scrollTo?.({ top: 0 })
  }
  /**
   * Précédent et suivant (les boutons de la souris, ⌘[, ceux du navigateur, le geste du bord sur l'iPhone) : la vue que
   * redit l'adresse, sans recharger, et ce qui s'y rattache (ses parents dépliés dans la colonne, rien de cherché ni de
   * choisi d'avant). Le dossier d'où l'on revient y est choisi, là où il se montre, comme dans le Finder. `avance` : on
   * y est mené (`allerA`, un lien), et rien de ce qu'on quitte n'y est à choisir.
   */
  const retablir = useRef((_avance?: boolean) => {})
  retablir.current = (avance = false) => {
    const lue = lireVue(location.search, racine)
    const quitte = dossier
    setRequete('')
    setRechercheOuverte(false)
    setTiroir(false)
    setMenu(null)
    setMenuNeuf(false)
    setRenommage(null)
    setPortee(lue.portee)
    setFiltre(lue.filtre)
    setDossier(lue.dossier ?? null)
    if (lue.dossier && toutes) setDeplies((d) => new Set([...d, ...filDAriane(lue.dossier!, toutes, racine)]))
    // Au téléphone, une tuile ne se choisit pas d'un toucher : rien n'y reste surligné.
    const cle = quitte && !telephone && !avance ? `${quitte}/` : null
    setSel(cle ? { choisies: new Set([cle]), ancre: cle } : RIEN)
    setCourante(cle)
    corps.current?.scrollTo?.({ top: 0 })
    if (cle) plusTard(() => tuileDe(cle)?.scrollIntoView?.({ block: 'nearest' }), 60)
  }
  useEffect(() => {
    // Un retour qui mène hors de la bibliothèque (une toile) la démonte : il n'a pas de vue à y rétablir. Ses adresses
    // sont celles de `adresseDeLaVue`, ou celle où elle s'est ouverte (`/bibliotheque`, que l'application récrit).
    const ici = location.pathname
    const chezElle = () => location.pathname === '/' || location.pathname === ici
    const surRetour = () => chezElle() && retablir.current()
    // `allerA` vers la bibliothèque déjà ouverte (le lien d'un dossier qu'écrit l'agent, ⌥⌘O) : la vue que dit l'adresse,
    // comme au retour, et ce qu'elle demande d'ouvrir dans son dossier (`&element=`). Sans cela, l'adresse changeait
    // sous la page, qui restait où elle était.
    const surAllerA = () => {
      if (!chezElle()) return
      demande.current = elementDeLAdresse(location.search)
      retablir.current(true)
      setDemandes((n) => n + 1)
    }
    window.addEventListener('popstate', surRetour)
    const finAllerA = ecouterAllerA(surAllerA)
    return () => {
      window.removeEventListener('popstate', surRetour)
      finAllerA()
    }
  }, [])
  // Arrivé dans un dossier (par son adresse, ou de retour d'une toile), la colonne le montre, ses parents dépliés.
  const deplieALArrivee = useRef(false)
  useEffect(() => {
    if (!toutes || deplieALArrivee.current) return
    deplieALArrivee.current = true
    if (dossier) setDeplies((d) => new Set([...d, ...filDAriane(dossier, toutes, racine)]))
  }, [toutes]) // une fois, à l'arrivée de la liste
  const afficher = (a: Affichage) => {
    setAffichage(a)
    ecrireAffichage(a)
  }
  const trier = (x: Tri) => {
    setTri(x)
    ecrireTri(x)
  }
  const [creation, setCreation] = useState(false)
  const creerPuisOuvrir = async (genre: GenreNeuf, dans?: string, titre?: string) => {
    setMenuNeuf(false)
    setFeuilleNeuf(false)
    if (creation) return
    setCreation(true)
    try {
      // Sans toile dite, ce qu'on crée va dans le dossier qu'on parcourt, sinon à la racine : des récents, d'une
      // recherche ou des favoris, on ne range nulle part ailleurs.
      const ou = dans ?? dossier ?? undefined
      const neuve = await creer(genre, ou)
      // « Créer la toile « … » », quand la recherche n'a rien trouvé : elle porte ce qu'on cherchait.
      if (titre && neuve.element === null && espace) espace.renommer(neuve.tableau, titre)
      // Ce qu'on vient de créer compte parmi les récents.
      void noterVu(neuve)
      tenirLeChemin(neuve.tableau, neuve.element === null ? ou : undefined)
      // Le retour mène là où c'est rangé, et sa tuile y bat : la page qu'on quitte devient cet endroit (précédent y
      // ramène, même parti des récents), et l'onglet retient ce qu'on vient de créer.
      const range = ou ?? racine
      if (range) {
        poserArrivee(neuve.element === null ? `${neuve.tableau}/` : `${neuve.tableau}/${neuve.element}`, range)
        history.replaceState(history.state, '', adresseDeLaVue({ portee: 'tout', filtre: 'tout', dossier: range }, racine))
      }
      allerAEntree(neuve)
    } finally {
      // Ce qu'on a créé s'est ouvert : la page a pu partir.
      if (montee.current) setCreation(false)
    }
  }
  /**
   * Où une entrée est rangée : le dossier ou la toile qui la porte (pour une toile, celle qui porte sa carte ; la racine
   * pour une toile à soi que rien ne range), son nom, son icône et son chemin depuis la racine ; `id` nul pour une toile
   * qu'on nous partage sans ce qui la range.
   */
  const rangeDans = (e: EntreeBibliotheque): { id: string | null; nom: string; icone: NomIcone; chemin: string } => {
    const p = sansPlace(e) ? racine : porteuseDe(e)
    if (!p) return { id: null, nom: t('biblio.partageAvecMoi'), icone: 'equipe', chemin: t('biblio.partageAvecMoi') }
    const icone: NomIcone = p === racine ? 'maison' : enDossier(p) ? 'dossier' : 'tableau'
    const chemin = (toutes ? filDAriane(p, toutes, racine) : [p]).map(titreToile).join(' › ')
    return { id: p, nom: titreToile(p), icone, chemin }
  }
  /**
   * Mène à l'endroit qui range cette entrée : le dossier (la racine comprise) où sa tuile se montre, choisie, son anneau
   * battant une fois ; la toile qui la porte, ouverte sur elle ; « Partagés avec moi » pour ce dont on ne lit pas le haut.
   */
  const montrerOuElleEst = (e: EntreeBibliotheque) => {
    const { id } = rangeDans(e)
    const cle = cleDe(e)
    if (id && !enDossier(id)) return afficherDansSaToile(e, id)
    if (id) parcourir(id)
    else choisir('partages')
    if (!telephone) {
      setSel({ choisies: new Set([cle]), ancre: cle })
      setCourante(cle)
    }
    setArrivees(new Set([cle]))
    plusTard(() => setArrivees(new Set()), 1200)
    plusTard(() => tuileDe(cle)?.scrollIntoView?.({ block: 'nearest' }), 60)
  }
  /**
   * Rangé à la main, là où on peut écrire : le dossier qu'on parcourt (la racine comprise), sans recherche, dont on écrit
   * la toile. Les tuiles s'y glissent entre les autres, et « Avancer » et « Reculer » les déplacent d'une place.
   */
  const aLaMain = tri === 'manuel' && !!dossier && !cherche && !!outils && !espace?.lectureSeule?.(dossier)
  /** Tout ce que le dossier range, dans son ordre à la main (les puces n'y font rien : elles ne font que cacher). */
  const ordreIci = () => (toutes && dossier ? entreesDe({ portee: 'tout', filtre: 'tout', dossier }, toutes, 'manuel', racine, ordreManuel).map(cleDe) : [])
  /**
   * Écrit l'ordre à la main du dossier qu'on parcourt, sur sa toile, une fois arrivée du serveur ; ⌘Z le défait. Il
   * vaut pour tous ceux qui le parcourent à la main.
   */
  const ecrireOrdre = async (ordre: string[]) => {
    if (!espace || !dossier) return
    const ici = dossier
    await quandPretes(espace, [ici])
    if (espace.lectureSeule?.(ici)) return
    const m = espace.magasin(ici)
    const avant = m.lire().ordre
    m.remplacer({ ...m.lire(), ordre })
    annulable.current = {
      texte: '',
      correctifs: [],
      async annuler() {
        const { ordre: _o, ...sans } = m.lire()
        m.remplacer(avant ? { ...sans, ordre: avant } : sans)
        return []
      },
    }
  }
  /** Pose ces tuiles avant ou après une autre, dans l'ordre à la main ; elles gardent entre elles l'ordre qu'elles avaient. */
  const placerA = (cles: readonly string[], cible: Insertion) => {
    const ici = ordreIci()
    const partent = ici.filter((c) => cles.includes(c))
    const reste = ici.filter((c) => !cles.includes(c))
    const i = reste.indexOf(cible.cle)
    if (partent.length === 0 || i < 0) return
    const j = cible.apres ? i + 1 : i
    void ecrireOrdre([...reste.slice(0, j), ...partent, ...reste.slice(j)])
  }
  /** Avance (ou recule) une tuile d'une place, dans l'ordre à la main : le geste du clavier et du doigt. */
  const decaler = (cle: string, sens: -1 | 1) => {
    const ici = ordreIci()
    const i = ici.indexOf(cle)
    const j = i + sens
    if (i < 0 || j < 0 || j >= ici.length) return
    const ordre = [...ici]
    ;[ordre[i], ordre[j]] = [ordre[j]!, ordre[i]!]
    void ecrireOrdre(ordre)
    plusTard(() => tuileDe(cle)?.scrollIntoView?.({ block: 'nearest' }), 60)
  }
  /** Ouvre la toile qui la porte, la vue centrée sur elle, choisie (pour une toile : sa carte). */
  const afficherDansSaToile = (e: Pick<EntreeBibliotheque, 'tableau' | 'element'>, porteuse: string) => {
    tenirLeChemin(porteuse)
    demanderAMontrer(e.element ?? e.tableau)
    allerA(`/t/${encodeURIComponent(porteuse)}`)
  }
  /**
   * Une toile s'ouvre, une page ou une carte mentale en grand ; une photo, un lien ou un fichier, sur leur toile, ou
   * seuls quand c'est un dossier qui les range.
   */
  const ouvrir = (e: EntreeBibliotheque) => {
    // Un dossier s'ouvre ici, en liste de ce qu'il porte : il n'a pas de toile à montrer.
    if (estDossier(e)) return parcourir(e.tableau)
    if (e.element === null || EN_GRAND.has(e.genre)) {
      tenirLeChemin(e.tableau)
      return allerAEntree(e)
    }
    // Rien ne les ouvre en grand, qui le noterait : on le dit ici.
    void noterVu(e)
    // Rangés dans un dossier, ils s'ouvrent seuls ; posés sur une toile, sur elle.
    if (enDossier(e.tableau)) return ouvrirSeul(e)
    afficherDansSaToile(e, e.tableau)
  }
  /** La photo ou le fichier qu'un dossier range, ouvert seul dans la fenêtre des fichiers. */
  const [seul, setSeul] = useState<{ contenu: Fichier; adresse: string } | null>(null)
  /** Les dossiers dont on vient de ranger les restes : la ligne s'en va sans attendre que le serveur relise leur toile. */
  const [restesRanges, setRestesRanges] = useState<ReadonlySet<string>>(new Set())
  const ouvrirSeul = (e: EntreeBibliotheque) => {
    const r = e.resume
    if (r.genre === 'lien') return ouvrirDehors(r.url)
    const contenu: Fichier | null =
      r.genre === 'image'
        ? { type: 'fichier', fichier: r.fichier, nom: titreDe(e), typeMime: 'image/*', taille: 0 }
        : r.genre === 'fichier'
          ? { type: 'fichier', fichier: r.fichier, nom: r.nom, typeMime: r.typeMime, taille: r.taille, ...(r.titre && r.titre !== r.nom ? { titre: r.titre } : {}) }
          : null
    if (!contenu) return
    vignettes.adresse(contenu.fichier).then(
      (adresse) => {
        if (!montee.current) return
        if (adresse) setSeul({ contenu, adresse })
        else annoncer({ texte: t('commun.echec') })
      },
      () => annoncer({ texte: t('commun.echec') }),
    )
  }

  // ---- Les gestes ----

  /** Le dernier geste qui se défait (⌘Z, ou le bouton de l'avis). */
  const annulable = useRef<Resultat | null>(null)
  const defaire = async (r: Resultat) => {
    if (annulable.current === r) annulable.current = null
    poser((await r.annuler?.()) ?? [])
  }
  const executer = async <R extends Resultat>(p: Promise<R | null>): Promise<R | null> => {
    try {
      const r = await p
      if (!r) return null
      poser(r.correctifs)
      annulable.current = r.annuler ? r : null
      annoncer({
        texte: r.texte,
        ...(r.actions ? { actions: r.actions } : {}),
        ...(r.annuler ? { action: { libelle: t('biblio.annuler'), faire: () => void defaire(r) } } : {}),
      })
      return r
    } catch (x) {
      annoncer({ texte: (x as Error).message || t('commun.echec') })
      return null
    }
  }
  /** Ce que dit la question avant un rangement qui change qui voit quoi : une ligne par changement. */
  const lignesDuBilan = (b: BilanRangement, vers: string) => {
    const toile = titreToile(vers)
    return [
      // La toile privée d'abord : elle la ferme à tout l'espace, hors ses invités.
      b.membresPerdus > 0 && tn('biblio.confirmer.membresPerdus', b.membresPerdus, { toile }),
      b.membresNouveaux > 0 && tn('biblio.confirmer.membresNouveaux', b.membresNouveaux),
      b.nouveaux > 0 && tn('biblio.confirmer.nouveaux', b.nouveaux, { toile }),
      b.perdus > 0 && tn('biblio.confirmer.perdus', b.perdus),
      b.permanents > 0 && tn('biblio.confirmer.permanents', b.permanents),
      b.liensOuverts > 0 && tn('biblio.confirmer.liensOuverts', b.liensOuverts, { toile }),
      b.liensEteints > 0 && tn('biblio.confirmer.liensEteints', b.liensEteints),
    ].filter((x): x is string => typeof x === 'string')
  }
  const confirmerOuverture = (titre: string, vers: string) => (bilan: BilanRangement) =>
    new Promise<boolean>((repondre) =>
      setFenetre({
        type: 'confirmer',
        titre: t('biblio.confirmer.titre', { titre }),
        lignes: lignesDuBilan(bilan, vers),
        repondre: (oui) => {
          setFenetre(null)
          repondre(oui)
        },
      }),
    )
  const nomDe = (es: EntreeBibliotheque[]) => (es.length === 1 ? titreDe(es[0]!) : tn('biblio.deplacer.titre', es.length).replace(/^\S+\s/, ''))
  const deplacerVers = (es: EntreeBibliotheque[], vers: string) => {
    if (!outils || es.length === 0) return
    void executer(deplacerEntrees(outils, es, { id: vers, titre: titreToile(vers) }, confirmerOuverture(nomDe(es), vers)))
  }
  const jeterCes = (es: EntreeBibliotheque[]) => outils && es.length > 0 && void executer(jeterEntrees(outils, es, toutes ?? []))
  const dupliquerCes = (es: EntreeBibliotheque[]) => outils && es.length > 0 && void executer(dupliquerEntrees(outils, es))
  const rangerDansNeuveCes = (es: EntreeBibliotheque[]) => {
    if (!outils || es.length === 0) return
    // Le nom de la toile neuve se tape aussitôt : au doigt, le clavier doit monter dans le geste.
    preparerClavier()
    // La toile neuve va là où tout ce qui part était (ce qu'un outil a généré reste), sinon à la racine.
    const partent = es.filter((e) => !genere(e))
    const ou = partent.length > 0 && partent.every((e) => porteuseDe(e) === porteuseDe(partent[0]!)) ? (porteuseDe(partent[0]!) ?? outils.espace.racine) : outils.espace.racine
    // Comme le « nouveau dossier avec la sélection » du Finder : la toile neuve est choisie, son nom prêt à changer.
    void executer(rangerDansUneNeuve(outils, es, { id: ou, titre: titreToile(ou) }, confirmerOuverture(nomDe(es), ou))).then((r) => {
      if (!r) return
      const cle = `${r.toile}/`
      setSel({ choisies: new Set([cle]), ancre: cle })
      setCourante(cle)
      setRenommage({ cle })
    })
  }
  /** Un dossier neuf, là où l'on est (le dossier qu'on parcourt, sinon la racine) : on l'y voit choisi, son nom prêt à changer. */
  const nouveauDossier = (dans?: string) => {
    if (!outils) return
    preparerClavier()
    const ou = dans ?? dossier ?? outils.espace.racine
    setMenuNeuf(false)
    // Il naît là où on le voit : l'endroit qui le range, sans puce qui le cacherait ni recherche.
    if (dossier !== ou || cherche || (filtre !== 'tout' && filtre !== 'toile')) {
      setRequete('')
      choisirVue({ dossier: ou, filtre: 'tout' })
    }
    void executer(creerDossier(outils, { id: ou, titre: titreToile(ou) })).then((r) => {
      if (!r) return
      const cle = `${r.toile}/`
      setSel({ choisies: new Set([cle]), ancre: cle })
      setCourante(cle)
      setRenommage({ cle })
    })
  }
  /**
   * Renomme dans sa tuile. Le menu peut venir de l'arbre de la colonne, la tuile n'étant pas à l'écran : on va d'abord
   * dans le dossier qui la range, où elle se montre, choisie.
   */
  const renommerSurPlace = (e: EntreeBibliotheque) => {
    preparerClavier()
    const cle = cleDe(e)
    if (!tuileDe(cle) && e.dans) {
      parcourir(e.dans)
      setSel({ choisies: new Set([cle]), ancre: cle })
      setCourante(cle)
    }
    setRenommage({ cle })
  }
  const renommerCe = async (cible: Pick<EntreeBibliotheque, 'tableau' | 'element' | 'titre'>, titre: string) => {
    setRenommage(null)
    if (!outils || !titre.trim()) return
    try {
      poser(await renommerEntree(outils, cible, titre, toutes ?? []))
    } catch (x) {
      annoncer({ texte: (x as Error).message || t('commun.echec') })
    }
  }
  /** Montre une toile en dossier, ou de nouveau en toile. */
  const montrerEnDossierCe = (e: EntreeBibliotheque, oui: boolean) => outils && void executer(montrerEntreeEnDossier(outils, e, oui))
  const favoriCes = async (es: EntreeBibliotheque[], oui: boolean) => {
    try {
      const cs = await favoris({ espace: espace!, rangerToile, definirFavori }, es, oui)
      // Le serveur a déjà suivi : on corrige la liste qu'on a, sans attendre.
      if (montee.current) setServeur((l) => l && cs.reduce((x, c) => corriger(x, c), l))
    } catch (x) {
      annoncer({ texte: (x as Error).message || t('commun.echec') })
    }
  }
  const copierLiens = (es: EntreeBibliotheque[]) => {
    // Un dossier et ce qu'il range n'ont d'adresse que dans la bibliothèque ; une page ou une carte, la leur, en grand.
    const adresse = (e: EntreeBibliotheque) =>
      estDossier(e) ? adresseDuDossier(e.tableau) : e.element && !EN_GRAND.has(e.genre) && enDossier(e.tableau) ? adresseDuDossier(e.tableau, e.element) : adresseDe(e)
    void navigator.clipboard?.writeText(es.map((e) => (e.resume.genre === 'lien' ? e.resume.url : `${location.origin}${adresse(e)}`)).join('\n')).then(
      () => annoncer({ texte: t(es.length > 1 ? 'biblio.annonce.liens' : 'biblio.annonce.lien') }),
      () => {},
    )
  }

  // ---- Le menu du clic droit ----

  const menuDesTuiles = (cles: string[]): EntreeMenu[] => {
    const es = entreesDes(cles)
    const une = es.length === 1 ? es[0]! : null
    const tousFavoris = es.length > 0 && es.every((e) => e.favori)
    const porteuse = une && porteuseDe(une)
    const ecrit = outils !== null
    const l: EntreeMenu[] = []
    if (une && (une.element === null || EN_GRAND.has(une.genre))) l.push({ libelle: t('biblio.menu.ouvrir'), icone: 'ouvrir', raccourci: '↩', faire: () => ouvrir(une) })
    // Une toile s'ouvre en toile et se parcourt aussi ici ; un dossier ne fait que se parcourir (« Ouvrir »).
    if (une?.element === null && !estDossier(une)) l.push({ libelle: t('biblio.menu.parcourir'), icone: 'dossier', faire: () => parcourir(une.tableau) })
    // Une tuile de là où les endroits se mêlent (récents, favoris, partages, recherche) : mener à celui qui la range.
    const ici = une && rangeDans(une)
    if (une && ici && (cherche || !dossier) && ordre.includes(cleDe(une)) && (ici.id === null || enDossier(ici.id)))
      l.push({ libelle: t('biblio.menu.afficherDans', { endroit: ici.nom }), icone: ici.icone, faire: () => montrerOuElleEst(une) })
    if (une?.resume.genre === 'lien') {
      const url = une.resume.url
      l.push({ libelle: t('biblio.menu.ouvrirLien'), icone: 'ouvrir', faire: () => ouvrirDehors(url) })
    }
    if (porteuse && !enDossier(porteuse)) l.push({ libelle: t('biblio.menu.afficher'), icone: 'tableau', faire: () => afficherDansSaToile(une!, porteuse) })
    // Rangé à la main : une place plus tôt, ou plus tard ; ce n'est pas changer la chose, même générée par un outil.
    if (une && aLaMain && ordre.includes(cleDe(une))) {
      const ici = ordreIci()
      const i = ici.indexOf(cleDe(une))
      l.push(
        null,
        { libelle: t('biblio.menu.avancer'), icone: 'precedent', desactive: i <= 0, faire: () => decaler(cleDe(une), -1) },
        { libelle: t('biblio.menu.reculer'), icone: 'suivant', desactive: i < 0 || i >= ici.length - 1, faire: () => decaler(cleDe(une), 1) },
      )
    }
    // Au doigt, l'appui long mène aussi au choix de plusieurs, comme dans Fichiers : la tuile tenue y est déjà.
    if (ecranAuDoigt() && !modeChoix) l.push({ libelle: t('biblio.choisir'), icone: 'menuSelectionner', faire: () => setModeChoix(true) })
    l.push(null)
    // Un dossier qu'un outil a généré ne change pas : ses gestes restent au menu, éteints, et sa tuile nomme l'outil.
    const fige = une !== null && genere(une)
    const tousFiges = es.length > 0 && es.every(genere)
    if (une && ecrit)
      l.push({
        libelle: t('biblio.menu.renommer'),
        icone: 'renommer',
        raccourci: 'F2',
        desactive: fige,
        faire: () => renommerSurPlace(une),
      })
    if (ecrit) l.push({ libelle: t('biblio.menu.dupliquer'), icone: 'menuDupliquer', raccourci: '⌘D', faire: () => dupliquerCes(es) })
    if (es.length > 0)
      l.push({
        libelle: t(tousFavoris ? 'biblio.menu.plusFavori' : 'biblio.menu.favori'),
        icone: tousFavoris ? 'favoriPlein' : 'favori',
        faire: () => void favoriCes(es, !tousFavoris),
      })
    if (une?.element === null && ecrit)
      l.push(
        estDossier(une)
          ? { libelle: t('biblio.menu.enToile'), icone: 'tableau', desactive: fige, faire: () => montrerEnDossierCe(une, false) }
          : { libelle: t('biblio.menu.enDossier'), icone: 'dossier', desactive: fige, faire: () => montrerEnDossierCe(une, true) },
      )
    l.push(null)
    // Choisis avec d'autres, ils restent tels quels, et l'avis le dit ; seuls, le geste s'éteint.
    if (ecrit) l.push({ libelle: t('biblio.menu.deplacer'), icone: 'dossier', desactive: tousFiges, faire: () => setFenetre({ type: 'deplacer', cles }) })
    if (ecrit && es.length > 1) l.push({ libelle: t('biblio.menu.neuveAvec'), icone: 'ajouter', desactive: tousFiges, faire: () => rangerDansNeuveCes(es) })
    l.push({ libelle: t(es.length > 1 ? 'biblio.menu.liens' : 'biblio.menu.lien'), icone: 'lien', faire: () => copierLiens(es) })
    if (une?.element === null && partage) l.push({ libelle: t('biblio.menu.partager'), icone: 'partager', faire: () => setFenetre({ type: 'partage', tableau: une.tableau }) })
    l.push(null)
    if (ecrit) l.push({ libelle: t('biblio.menu.corbeille'), icone: 'corbeille', raccourci: '⌫', danger: true, desactive: tousFiges, faire: () => jeterCes(es) })
    return l
  }
  const sousMenuCreer = (dans?: string): EntreeMenu[] =>
    (['toile', 'document', 'arbre'] as const).map((g) => ({ libelle: t(`biblio.genre.${g}`), icone: ICONE_GENRE[g], faire: () => void creerPuisOuvrir(g, dans) }))
  /** Les trois façons d'ordonner la racine et les dossiers, la choisie cochée : le bouton « Trier », et le clic droit du fond. */
  const menuDuTri = (): EntreeMenu[] => TRIS.map((x) => ({ libelle: t(`biblio.tri.${x}`), icone: ICONE_TRI[x], coche: tri === x, faire: () => trier(x) }))
  /** Le clic droit du fond : créer là où l'on range, l'ordre de la bibliothèque (pas dans les récents), tout choisir. */
  const menuDuFond = (): EntreeMenu[] => [
    ...(espace
      ? [
          { libelle: t('biblio.menu.nouveau'), icone: 'ajouter' as const, sous: sousMenuCreer(), faire: () => {} },
          { libelle: t('biblio.menu.nouveauDossier'), icone: 'dossier' as const, raccourci: '⇧⌘N', faire: () => nouveauDossier() },
          null,
        ]
      : []),
    ...(enRecents ? [] : [...menuDuTri(), null]),
    { libelle: t('biblio.menu.toutChoisir'), icone: 'menuSelectionner', raccourci: '⌘A', desactive: ordre.length === 0, faire: () => setSel(toutChoisir(ordre)) },
  ]
  /** Au doigt, sans clavier sous la main, le menu ne parle pas de raccourcis (la feuille du téléphone non plus). */
  const sansRaccourcis = (l: EntreeMenu[]): EntreeMenu[] => (ecranAuDoigt() ? l.map((e) => (e && e.raccourci ? (({ raccourci: _r, ...reste }) => reste)(e) : e)) : l)
  const entreesDuMenu = (m: Menu) => sansRaccourcis(m.type === 'tuiles' ? menuDesTuiles(m.cles) : m.type === 'tri' ? menuDuTri() : menuDuFond())

  /** Le menu de ce qui est sous `el` : la tuile (et les autres choisies avec elle), ou le fond. */
  const ouvrirMenuSur = (el: HTMLElement, x: number, y: number) => {
    const { sel: s, choisies: ch, ordre: o } = etat.current
    const tuile = el.closest<HTMLElement>('[data-cle]')
    if (tuile) {
      const cle = tuile.dataset.cle!
      const cles = s.choisies.has(cle) ? ch : [cle]
      if (!s.choisies.has(cle)) setSel(cliquer(s, cle, o))
      setCourante(cle)
      setMenu({ x, y, type: 'tuiles', cles })
    } else setMenu({ x, y, type: 'fond' })
  }
  const surMenu = (ev: ReactMouseEvent) => {
    const el = ev.target as HTMLElement
    if (el.closest('input')) return
    ev.preventDefault()
    ouvrirMenuSur(el, ev.clientX, ev.clientY)
  }
  /** Le « ••• » d'une tuile : son menu, posé sous le bouton, comme le clic droit. */
  const menuDuBouton = (bouton: HTMLElement) => {
    const r = bouton.getBoundingClientRect()
    ouvrirMenuSur(bouton, r.left, r.bottom + 4)
  }

  // ---- Le pointeur : choisir, tracer un cadre, glisser ----

  const etat = useRef({ sel, ordre, choisies, parCle, toutes, aLaMain, affichage: affichageVu })
  etat.current = { sel, ordre, choisies, parCle, toutes, aLaMain, affichage: affichageVu }
  /** Les boîtes des tuiles, dans le repère du contenu de la page (qui défile). */
  const boitesTuiles = () => {
    const c = corps.current
    const boites = new Map<string, Boite>()
    if (!c) return boites
    const r = c.getBoundingClientRect()
    for (const el of c.querySelectorAll<HTMLElement>('[data-cle]')) {
      const b = el.getBoundingClientRect()
      boites.set(el.dataset.cle!, { gauche: b.left - r.left + c.scrollLeft, haut: b.top - r.top + c.scrollTop, droite: b.right - r.left + c.scrollLeft, bas: b.bottom - r.top + c.scrollTop })
    }
    return boites
  }
  /** Fait défiler la page tant que le pointeur reste près de son bord ; `apres` suit chaque pas. */
  const defilement = (pointeur: { y: number }, apres: () => void) => {
    let image = 0
    const pas = () => {
      const c = corps.current
      if (c) {
        const r = c.getBoundingClientRect()
        const d = pointeur.y < r.top + BORD_DEFILEMENT ? -1 : pointeur.y > r.bottom - BORD_DEFILEMENT ? 1 : 0
        if (d !== 0) {
          c.scrollTop += d * 14
          apres()
        }
      }
      image = requestAnimationFrame(pas)
    }
    image = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(image)
  }
  /** Une toile où l'on peut lâcher ces tuiles : ni l'une d'elles ni ce qu'elles contiennent, ni là où tout est déjà. */
  const depotPossible = (id: string, cles: string[]) => {
    if (!outils) return false
    const es = cles.flatMap((c) => etat.current.parCle.get(c) ?? [])
    return !horsDAtteinte(etat.current.toutes ?? [], es).has(id) && !es.every((e) => porteuseDe(e) === id)
  }

  /** Le dernier appui venait-il d'un doigt ou du Pencil : le clic qui suit n'en dit rien partout. */
  const auDoigt = useRef(false)
  const surAppui = (ev: ReactPointerEvent) => {
    // Le Pencil touche comme un doigt : un toucher ouvre (la webview d'iOS ne rend pas les doubles clics sûrs).
    auDoigt.current = ev.pointerType === 'touch' || ev.pointerType === 'pen'
    const el = ev.target as HTMLElement
    if (ev.button !== 0 || el.closest('input')) return
    // Le « ••• » d'une tuile ouvre son menu, « rangé dans » d'une ligne des récents (un bouton au bureau, du texte au
    // doigt) mène à l'endroit : ni choix, ni glisser.
    if (el.closest('.biblio-tuile-plus, button.biblio-recent-ou')) return
    const tuile = el.closest<HTMLElement>('[data-cle]')
    // Au doigt et au Pencil, on fait défiler et on touche pour ouvrir ; un appui long ouvre le menu de ce qui est
    // dessous (une tuile, le titre d'un dossier, le fond), comme le clic droit, que la webview d'iOS n'envoie pas.
    if (auDoigt.current) {
      if (!tuile && el.closest('a, button')) return
      suivreAppuiLong(ev, {
        tenu: ({ x, y }) => {
          vibrer()
          ouvrirMenuSur(el, x, y)
        },
      })
      return
    }
    const touches = { ajout: ev.metaKey || ev.ctrlKey, suite: ev.shiftKey }
    if (tuile) {
      const cle = tuile.dataset.cle!
      const { sel: avant, ordre: o } = etat.current
      const garderLesAutres = avant.choisies.has(cle) && !touches.ajout && !touches.suite
      if (!garderLesAutres) setSel(cliquer(avant, cle, o, touches))
      setCourante(cle)
      ev.preventDefault()
      tuile.focus({ preventScroll: true })
      glisser(ev, cle, garderLesAutres)
      return
    }
    if (el.closest('a, button')) return
    tracerCadre(ev, touches)
  }

  const glisser = (ev: ReactPointerEvent, cle: string, reduireAuRelache: boolean) => {
    const depart = { x: ev.clientX, y: ev.clientY }
    const pointeur = { y: ev.clientY }
    let courant: Glisse | null = null
    /** Les dossiers qu'un outil a générés, choisis avec ce qu'on glisse : ils restent, et l'avis le dira. */
    let laisses: string[] = []
    let arretDefilement = () => {}
    const viser = (x: number, y: number) => {
      if (!courant) return
      const dessous = document.elementFromPoint?.(x, y)
      let id = dessous?.closest<HTMLElement>('[data-depot]')?.dataset.depot ?? null
      let insertion: Insertion | null = null
      // Rangé à la main, une tuile se pose entre les autres : sur le bord d'une tuile, avant ou après elle ; au milieu
      // d'une toile ou d'un dossier, elle y entre, comme ailleurs. En liste, les bords sont le haut et le bas.
      const tuile = etat.current.aLaMain ? dessous?.closest<HTMLElement>('[data-cle]') : null
      const sur = tuile?.dataset.cle
      if (tuile && sur && !courant.cles.includes(sur) && corps.current?.contains(tuile)) {
        const r = tuile.getBoundingClientRect()
        const enLigne = etat.current.affichage !== 'grille'
        const part = enLigne ? (y - r.top) / (r.height || 1) : (x - r.left) / (r.width || 1)
        if (!(tuile.dataset.depot && part > 0.25 && part < 0.75)) {
          insertion = { cle: sur, apres: part >= 0.5 }
          id = null
        }
      }
      courant = { ...courant, x, y, cible: id && depotPossible(id, courant.cles) ? id : null, insertion }
      setGlisse(courant)
    }
    const bouger = (e: PointerEvent) => {
      pointeur.y = e.clientY
      if (!courant) {
        if (Math.hypot(e.clientX - depart.x, e.clientY - depart.y) < 5) return
        const { sel: s, ordre: o, parCle: p } = etat.current
        const prises = s.choisies.has(cle) ? o.filter((c) => s.choisies.has(c)) : [cle]
        const estPose = (c: string) => {
          const x = p.get(c)
          return x !== undefined && genere(x)
        }
        laisses = prises.filter(estPose)
        // Rien ne se décolle qui ne puisse partir : on le dit tout de suite, au lieu d'un glisser qui ne mène nulle part.
        if (laisses.length === prises.length) {
          fin()
          annoncer({ texte: resteTelQuel(laisses.flatMap((c) => p.get(c) ?? [])) })
          return
        }
        courant = { cles: prises.filter((c) => !estPose(c)), x: e.clientX, y: e.clientY, cible: null }
        setMenu(null)
        arretDefilement = defilement(pointeur, () => {})
      }
      viser(e.clientX, e.clientY)
    }
    const fin = () => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', lacher)
      window.removeEventListener('pointercancel', abandon)
      window.removeEventListener('keydown', echap, true)
      arretDefilement()
      setGlisse(null)
    }
    const lacher = () => {
      const g = courant
      fin()
      if (!g) {
        if (reduireAuRelache) setSel(cliquer(RIEN, cle, etat.current.ordre))
        return
      }
      // Le clic qui suit le lâcher n'ouvre pas le lien survolé (un dossier, l'accueil).
      const bloquer = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
      }
      window.addEventListener('click', bloquer, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', bloquer, true), 0)
      // Prendre place, à la main, ne change pas la chose : ce qu'un outil a généré se range aussi.
      if (g.insertion) placerA([...g.cles, ...laisses], g.insertion)
      else if (g.cible) deplacerVers([...g.cles, ...laisses].flatMap((c) => etat.current.parCle.get(c) ?? []), g.cible)
    }
    const abandon = () => {
      courant = null
      fin()
    }
    const echap = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !courant) return
      e.preventDefault()
      e.stopPropagation()
      abandon()
    }
    window.addEventListener('pointermove', bouger)
    window.addEventListener('pointerup', lacher)
    window.addEventListener('pointercancel', abandon)
    window.addEventListener('keydown', echap, true)
  }

  const tracerCadre = (ev: ReactPointerEvent, touches: { ajout: boolean; suite: boolean }) => {
    const c = corps.current
    if (!c) return
    const r = c.getBoundingClientRect()
    const dans = (x: number, y: number) => ({ x: x - r.left + c.scrollLeft, y: y - r.top + c.scrollTop })
    const p0 = dans(ev.clientX, ev.clientY)
    const avant = touches.ajout || touches.suite ? etat.current.sel : RIEN
    if (!touches.ajout && !touches.suite) setSel(RIEN)
    setMenu(null)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const boites = boitesTuiles()
    const pointeur = { x: ev.clientX, y: ev.clientY }
    let lance = false
    const suivre = () => {
      const p1 = dans(pointeur.x, pointeur.y)
      const b = cadreEntre(p0.x, p0.y, p1.x, p1.y)
      setCadre(b)
      setSel(cadrer(avant, boites, b, touches))
    }
    let arretDefilement = () => {}
    const bouger = (e: PointerEvent) => {
      pointeur.x = e.clientX
      pointeur.y = e.clientY
      if (!lance) {
        if (Math.hypot(e.clientX - ev.clientX, e.clientY - ev.clientY) < 4) return
        lance = true
        arretDefilement = defilement(pointeur, suivre)
      }
      suivre()
    }
    const fin = () => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', fin)
      window.removeEventListener('pointercancel', fin)
      arretDefilement()
      setCadre(null)
    }
    window.addEventListener('pointermove', bouger)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
  }

  const surDoubleClic = (ev: ReactMouseEvent) => {
    const el = ev.target as HTMLElement
    if (el.closest('input, .biblio-tuile-plus, button.biblio-recent-ou')) return
    const cle = el.closest<HTMLElement>('[data-cle]')?.dataset.cle
    const e = cle ? parCle.get(cle) : undefined
    if (e) ouvrir(e)
  }
  // Au doigt et au Pencil, une tuile touchée s'ouvre ; en « Sélectionner », elle se choisit ou se retire.
  const surClic = (ev: ReactMouseEvent) => {
    if (!auDoigt.current) return
    const el = ev.target as HTMLElement
    if (el.closest('.biblio-tuile-plus, button.biblio-recent-ou')) return
    const cle = el.closest<HTMLElement>('[data-cle]')?.dataset.cle
    if (!cle) return
    if (modeChoix) {
      setSel((s) => cliquer(s, cle, ordre, { ajout: true }))
      setCourante(cle)
      return
    }
    const e = parCle.get(cle)
    if (e) ouvrir(e)
  }

  // ---- Le clavier ----

  const aller = (cle: string | null, etendre: boolean) => {
    if (!cle) return
    setSel((s) => (etendre ? cliquer(s, cle, ordre, { suite: true }) : cliquer(RIEN, cle, ordre)))
    setCourante(cle)
    const el = tuileDe(cle)
    el?.focus({ preventScroll: true })
    el?.scrollIntoView?.({ block: 'nearest' })
  }
  /** La tuile de cette clé, dans la page. */
  const tuileDe = (cle: string) => [...(corps.current?.querySelectorAll<HTMLElement>('[data-cle]') ?? [])].find((x) => x.dataset.cle === cle)
  /** Le renommage fini, le clavier revient à la tuile. */
  const rendreFocus = (cle: string) =>
    requestAnimationFrame(() => tuileDe(cle)?.focus({ preventScroll: true }))
  const touche = useRef<(e: globalThis.KeyboardEvent) => void>(() => {})
  touche.current = (e) => {
    const cible = e.target as HTMLElement
    if (e.defaultPrevented || menu || fenetre || renommage || glisse) return
    if (cible.closest?.('input, textarea, select, [contenteditable="true"], dialog, .notak-par-dessus')) return
    const cmd = e.metaKey || e.ctrlKey
    const es = entreesDes(choisies)
    const une = es.length === 1 ? es[0]! : null
    const fleches: Record<string, Direction> = { ArrowLeft: 'gauche', ArrowRight: 'droite', ArrowUp: 'haut', ArrowDown: 'bas' }
    // Les flèches de la colonne restent à la colonne, celles des puces aux puces.
    if (fleches[e.key] && !cmd && !nav.current?.contains(cible) && !cible.closest?.('.biblio-puces')) {
      e.preventDefault()
      aller(voisine(boitesTuiles(), ordre, courante ?? sel.ancre, fleches[e.key]!), e.shiftKey)
    } else if (cmd && !e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSel(toutChoisir(ordre))
    } else if (cmd && !e.shiftKey && e.key.toLowerCase() === 'z' && annulable.current) {
      e.preventDefault()
      void defaire(annulable.current)
    } else if (cmd && e.shiftKey && e.key.toLowerCase() === 'n' && outils) {
      e.preventDefault()
      nouveauDossier()
    } else if (cmd && e.key.toLowerCase() === 'd' && es.length > 0) {
      e.preventDefault()
      dupliquerCes(es)
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && es.length > 0) {
      e.preventDefault()
      jeterCes(es)
    } else if (e.key === 'Enter' && une && !cible.closest('a, button')) {
      e.preventDefault()
      ouvrir(une)
    } else if (e.key === 'F2' && une && outils && !genere(une)) {
      e.preventDefault()
      setRenommage({ cle: cleDe(une) })
    } else if (e.key === 'Escape' && (sel.choisies.size > 0 || modeChoix)) {
      setSel(RIEN)
      setModeChoix(false)
    } else if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && choisies.length > 0) {
      e.preventDefault()
      const b = tuileDe(courante ?? choisies[0]!)?.getBoundingClientRect()
      setMenu({ x: b ? b.left + 24 : 200, y: b ? b.top + 24 : 200, type: 'tuiles', cles: choisies })
    }
  }
  useEffect(() => {
    const f = (e: globalThis.KeyboardEvent) => touche.current(e)
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  // Les flèches passent d'une rubrique à l'autre dans la colonne, comme dans une liste.
  const surToucheColonne = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const boutons = [...(nav.current?.querySelectorAll<HTMLButtonElement>('[data-rubrique]') ?? [])]
    const i = boutons.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    boutons[(i + (e.key === 'ArrowDown' ? 1 : -1) + boutons.length) % boutons.length]?.focus()
  }

  // ---- Des fichiers de la machine ----

  /**
   * « Voir », après un import : la toile qui l'a pris, centrée sur lui ; dans un dossier (la racine comprise), qui n'a pas
   * de toile à montrer, il s'ouvre seul, comme sa tuile.
   */
  const voirImporte = (dans: string) => (element: string) => {
    const e = etat.current.parCle.get(`${dans}/${element}`)
    if (e && enDossier(dans)) return ouvrir(e)
    afficherDansSaToile({ tableau: dans, element }, dans)
  }
  /** Importe ces fichiers sur la toile `dans` : la racine, ou la toile (tuile, dossier) sur laquelle on les lâche. */
  const importerIci = (fichiers: File[], dans: string) => {
    if (!outils || !importer || fichiers.length === 0) return
    setImportEnCours(fichiers.length)
    void executer(importerEntrees(outils, importer, fichiers, { id: dans, titre: titreToile(dans) }, voirImporte(dans)))
      .then((r) => r && montrerArrivee(r.entrees, dans))
      .finally(() => setImportEnCours(0))
  }
  /**
   * Ce qu'on vient d'importer se voit là où l'on est, s'il y a sa place ; sinon là où c'est rangé, la racine, le dossier
   * ou la toile qui l'a pris (`vueDeLArrivee`). Une recherche qui le cacherait se vide. Les tuiles sont choisies, la
   * première vient à l'écran, et leur anneau bat une fois. Rien de neuf à montrer (des fichiers joints seuls) : c'est la
   * toile qui les a pris qui bat.
   */
  const montrerArrivee = (entrees: readonly EntreeBibliotheque[], dans: string) => {
    // Importer, c'est toucher : ce qui arrive entre dans les récents. Le serveur ne le note qu'une fois l'élément lu,
    // quelques secondes après : on le redit le temps qu'il suive.
    for (const e of entrees) {
      void noterVu(e)
      plusTard(() => void noterVu(e), 4000)
      plusTard(() => void noterVu(e), DUREE_CORRECTIF + 1000)
    }
    const cles = entrees.map(cleDe)
    const battre = (c: string[]) => {
      setArrivees(new Set(c))
      plusTard(() => setArrivees(new Set()), 1200)
    }
    if (cles.length === 0) return battre([`${dans}/`])
    const icite = entrees.every((e) => entreesDe(vue, [e], tri, racine).length > 0)
    if (cherche || !icite) {
      setRequete('')
      if (!icite) choisirVue({ ...vueDeLArrivee(dans) })
    }
    setSel({ choisies: new Set(cles), ancre: cles[0]! })
    setCourante(cles[0]!)
    battre(cles)
    plusTard(() => tuileDe(cles[0]!)?.scrollIntoView?.({ block: 'nearest' }), 60)
  }
  // L'élément que l'adresse demande dans son dossier (« Copier le lien », la fiche d'un autre outil) : choisi, et
  // ouvert seul, une fois la liste arrivée. Un lien n'est que choisi : un onglet ouvert sans clic serait bloqué.
  const demande = useRef(elementDeLAdresse(location.search))
  /** Chaque `allerA` vers la bibliothèque déjà ouverte : il peut redemander un élément dans le dossier où l'on est. */
  const [demandes, setDemandes] = useState(0)
  useEffect(() => {
    const el = demande.current
    if (!el || !dossier || !toutes) return
    demande.current = null
    const e = parCle.get(`${dossier}/${el}`)
    // L'adresse ne garde que le dossier : y revenir (le retour du navigateur) ne rouvre pas l'élément.
    history.replaceState(history.state, '', adresseDeLaVue({ portee: 'tout', filtre: 'tout', dossier }, racine))
    signalerAdresse()
    if (!e) return
    const cle = cleDe(e)
    setSel({ choisies: new Set([cle]), ancre: cle })
    setCourante(cle)
    plusTard(() => tuileDe(cle)?.scrollIntoView?.({ block: 'nearest' }), 60)
    if (e.resume.genre !== 'lien') ouvrir(e)
  }, [toutes, dossier, demandes]) // à l’arrivée de la liste, puis à chaque `allerA` qui demande un élément
  // Ce qu'on vient de créer d'ici, au retour, dans l'endroit qui le range : choisi, à l'écran, son anneau bat une fois.
  // Tant que la liste ne le porte pas encore (le serveur suit), il attend la relecture suivante.
  useEffect(() => {
    if (!toutes || !dossier || cherche) return
    const a = lireArrivee()
    if (!a || a.ou !== dossier || !parCle.has(a.cle)) return
    oublierArrivee()
    if (!telephone) {
      setSel({ choisies: new Set([a.cle]), ancre: a.cle })
      setCourante(a.cle)
    }
    setArrivees(new Set([a.cle]))
    plusTard(() => setArrivees(new Set()), 1200)
    plusTard(() => tuileDe(a.cle)?.scrollIntoView?.({ block: 'nearest' }), 60)
  }, [toutes, dossier, cherche]) // à chaque lecture de la liste, et en arrivant dans un endroit
  // Ce qui est resté vide, sous son nom d'origine, sans jamais rien porter (`videsAJeter`), part à la corbeille quand on
  // arrive : une fois par visite, avec un avis qui le dit et « Annuler » qui le reprend.
  const videsVus = useRef(false)
  useEffect(() => {
    if (!toutes || !outils || videsVus.current) return
    videsVus.current = true
    const vides = videsAJeter(toutes)
    if (vides.length === 0) return
    void executer(
      jeterEntrees(outils, vides, toutes).then((r) => ({
        ...r,
        texte: vides.length === 1 ? t('biblio.annonce.vide', { titre: titreDe(vides[0]!) }) : tn('biblio.annonce.vides', vides.length),
      })),
    )
  }, [toutes]) // une fois, à l'arrivée de la liste
  const importerCourant = useRef(importerIci)
  importerCourant.current = importerIci
  // Fichier › Importer… dans Notak de bureau : dans le dossier qu'on parcourt, sinon à la racine, comme un fichier lâché sur le fond.
  const ciblePage = useRef<string | null>(null)
  ciblePage.current = dossier
  useEffect(() => (espace ? ecouterImportBureau((f) => importerCourant.current(f, ciblePage.current ?? espace.racine)) : undefined), [espace])
  const apporteDesFichiers = (e: DragEvent) => !!importer && !!espace && e.dataTransfer.types.includes('Files')
  const surApport = (e: DragEvent<HTMLDivElement>) => {
    if (!apporteDesFichiers(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const cible = (e.target as HTMLElement).closest?.<HTMLElement>('[data-depot]')?.dataset.depot ?? dossier ?? espace!.racine
    if (apport?.cible !== cible) setApport({ cible })
  }
  // Sorti de la page, et non d'une tuile vers sa voisine.
  const surDepart = (e: DragEvent<HTMLDivElement>) => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setApport(null)
  }
  const surLacher = (e: DragEvent<HTMLDivElement>) => {
    if (!apporteDesFichiers(e)) return
    e.preventDefault()
    setApport(null)
    importerIci([...e.dataTransfer.files], apport?.cible ?? dossier ?? espace!.racine)
  }
  /** La toile qui prendrait ce qu'on glisse : des tuiles, ou des fichiers de la machine. */
  const survolDepot = glisse?.cible ?? apport?.cible ?? null

  /** Ce que la rubrique montre sous « Tout » : les récents ne se comptent pas. */
  const combien = (r: Portee) => (toutes && r !== 'recents' ? parLesPuces({ portee: r, filtre: 'tout' }, dansLaPortee(r, toutes)).length : 0)
  const bouton = (r: Portee) => (
    <button key={r} type="button" className="biblio-rubrique" data-rubrique={r} aria-current={!cherche && !dossier && portee === r ? 'page' : undefined} onClick={() => choisir(r)}>
      <Icone nom={ICONE_PORTEE[r]} taille={18} />
      <span>{t(`biblio.rubrique.${r}`)}</span>
      {combien(r) > 0 && <small>{combien(r)}</small>}
    </button>
  )
  /** Ce que dit une vue vide : le genre de la puce s'il y en a une, sinon la racine ou le dossier qu'on parcourt, sinon la portée. */
  const vide = (): { texte: string; aide: string } =>
    filtre !== 'tout'
      ? { texte: t(`biblio.vide.${PLURIEL[filtre]}`), aide: dossier === racine ? t(`biblio.vide.${PLURIEL[filtre]}.aide`, { espace: nomRacine }) : t('biblio.vide.filtre.aide') }
      : dossier && dossier === racine
        ? { texte: t('biblio.vide.tout'), aide: t('biblio.vide.tout.aide') }
        : dossier
          ? { texte: t('biblio.vide.dossier'), aide: t('biblio.vide.dossier.aide') }
          : { texte: t(`biblio.vide.${portee}`), aide: t(`biblio.vide.${portee}.aide`) }
  const accueil = racine ? `/t/${encodeURIComponent(racine)}` : '/'
  const arbre = useMemo(() => (toutes && racine ? arbreDesDossiers(toutes, racine) : []), [toutes, racine])
  /** Le dossier qu'on parcourt est celui d'une fiche d'un autre outil (un CRM…) : un lien y mène, à côté de « Ouvrir la toile ». */
  const fiche = dossier ? parCle.get(`${dossier}/`)?.fiche : undefined
  const lienFiche = (className: string, icone: boolean) =>
    fiche?.adresse ? (
      <a
        className={className}
        href={fiche.adresse}
        target="_blank"
        rel="noopener noreferrer"
        title={t('biblio.fiche.aide', { nom: fiche.nom })}
        onClick={(e) => {
          e.preventDefault()
          ouvrirDehors(fiche.adresse!)
        }}
      >
        {icone && <Icone nom="ouvrir" taille={16} />}
        <span>{t('biblio.fiche', { nom: fiche.nom })}</span>
      </a>
    ) : null
  /** Le chemin du dossier qu'on parcourt, depuis l'accueil, sans lui. */
  const fil = dossier && toutes ? filDAriane(dossier, toutes, espace?.racine ?? null).slice(0, -1) : []
  /** Ce qu'est un niveau du chemin, pour son icône : l'accueil, un dossier, ou une toile qu'on parcourt comme un dossier. */
  const genreDuNiveau = (id: string): GenreNiveau => (id === espace?.racine ? 'accueil' : enDossier(id) ? 'dossier' : 'toile')
  /** Une toile privée du chemin : son cadenas la suit dans le fil, comme sur sa tuile. */
  const estPrivee = (id: string) => parCle.get(`${id}/`)?.prive === true
  // Le fil prend la place que lui laissent les îlots de droite : ce qui ne tient pas passe dans « … ».
  const [placeDuFil, filDuDossier] = usePlaceDuFil('parent')
  /** Pendant qu'on glisse dans un dossier, son parent : la tuile qui crée devient celle qui y remonte. */
  const remonter = glisse && dossier && !cherche ? (fil[fil.length - 1] ?? null) : null
  const glissees = new Set(glisse?.cles)
  const premiereFocalisable = courante && ordre.includes(courante) ? courante : (choisies[0] ?? ordre[0])

  const enChoix = modeChoix || choisies.length > 1
  const barreChoix = (
    <BarreChoix
      choisies={entreesDes(choisies)}
      ecrit={outils !== null}
      deplacer={() => setFenetre({ type: 'deplacer', cles: choisies })}
      favori={(oui) => void favoriCes(entreesDes(choisies), oui)}
      dupliquer={() => dupliquerCes(entreesDes(choisies))}
      jeter={() => jeterCes(entreesDes(choisies))}
      fermer={() => {
        setSel(RIEN)
        setModeChoix(false)
      }}
      auDoigt={modeChoix}
    />
  )

  // ---- Au téléphone ----

  /** La racine, sans puce : là où l'on arrive. */
  const aLaRacine = dossier !== null && dossier === racine && filtre === 'tout'
  /** Le plan de la toile d'accueil, lu sur elle (la bibliothèque ne la compte pas parmi ses entrées). */
  const [versionAccueil, setVersionAccueil] = useState(0)
  useEffect(() => {
    if (!espace) return
    let vivant = true
    void quandPretes(espace, [espace.racine]).then(
      () => vivant && setVersionAccueil((v) => v + 1),
      () => {},
    )
    const arreter = espace.ecouter(() => setVersionAccueil((v) => v + 1))
    return () => {
      vivant = false
      arreter()
    }
  }, [espace])
  const resumeAccueil = useMemo(() => {
    const tb = espace ? espace.tableau(espace.racine) : undefined
    // Pas encore lu (ou lu en partie) : pas de plan.
    const r = tb && Array.isArray(tb.elements) ? resumesDuTableau(tb as never)[0] : undefined
    return r?.genre === 'toile' ? r : undefined
    // `versionAccueil` n'est pas lu : il dit que l'accueil a changé, et qu'il faut le relire.
  }, [espace, versionAccueil])
  /**
   * Ce que la toile d'accueil porte d'à elle et qu'aucune tuile ne montre : des notes, des formes, ce qu'envoie le
   * téléphone dans ses non triés. Ses toiles, pages, cartes mentales et pièces ont leurs tuiles, à la racine.
   */
  const restesAccueil = resumeAccueil ? restesDe({ resume: resumeAccueil }) + (resumeAccueil.nonTries ?? 0) : 0
  /** Sous une ligne trouvée au doigt : où elle est rangée, sauf à la racine, qui porte tout ; sinon quand on l'a ouverte. */
  const detailAuDoigt = (e: EntreeBibliotheque) => {
    const r = rangeDans(e)
    return r.id !== racine ? t('biblio.dans', { toile: r.nom }) : quand(e.vu)
  }
  /**
   * Ce que dit une tuile sous son titre. Là où l'on range (la racine, un dossier) : la date de sa création, qui rend
   * l'ordre lisible, et pour un dossier ce qu'il contient ; le titre de la page et le fil disent déjà où l'on est. Là où
   * les endroits se mêlent (favoris, partages, recherche) : où elle est rangée.
   */
  const detailDe = (e: EntreeBibliotheque): string => {
    if (dossier && !cherche) {
      if (estDossier(e)) {
        const n = nombreDans.get(e.tableau) ?? 0
        return n === 0 ? t('biblio.dossierVide') : tn('biblio.elements', n)
      }
      return dateDeCreation(e) ?? genreDe(e)
    }
    // Une toile qu'on nous partage sans ce qui la range : la rubrique le dit déjà ; cherchant, on le dit.
    const r = rangeDans(e)
    if (r.id === null) return cherche ? r.nom : genreDe(e)
    return t('biblio.dans', { toile: r.nom })
  }
  const genreLigne = (e: EntreeBibliotheque): GenreLigne => (estDossier(e) ? 'dossier' : e.genre)
  /**
   * Rien encore : de quoi commencer, au lieu d'une toile déjà remplie. Un accueil où l'on a déjà posé des notes n'est
   * pas un premier pas : la ligne de la racine les dit.
   */
  const premierPas = !!toutes && toutes.length === 0 && !cherche && restesAccueil === 0

  /**
   * Sous le titre de la racine, au doigt : les récents, les favoris et les partages, chacun sa page, où l'on va et d'où
   * l'on revient (le geste du bord y ramène). Pas de puces de genre : la racine montre ce qui y est rangé, en grille.
   */
  const portesAuDoigt = () => (
    <nav className="biblio-portes" aria-label={t('biblio.telephone.portes')}>
      {(partages ? (['recents', 'favoris', 'partages'] as const) : (['recents', 'favoris'] as const)).map((r) => (
        <button key={r} type="button" className="biblio-porte" data-rubrique={r} onClick={() => choisir(r)}>
          <Icone nom={ICONE_PORTEE[r]} taille={18} />
          <span>{t(`biblio.porte.${r}`)}</span>
          {combien(r) > 0 && <small>{combien(r)}</small>}
        </button>
      ))}
    </nav>
  )

  /** Les passages trouvés dans le contenu, sans ce que la recherche des titres a déjà trouvé. */
  const clesVisibles = useMemo(() => new Set(visibles.map(cleDe)), [visibles])
  const passagesVus = passages.requete && passages.requete === requete.trim() ? passages.resultats.filter((p) => !clesVisibles.has(`${p.tableau}/${p.element ?? ''}`)) : []
  const genreDuPassage = (p: ResultatRecherche): GenreLigne | undefined => {
    const e = parCle.get(`${p.tableau}/${p.element ?? ''}`)
    return e ? genreLigne(e) : undefined
  }
  /** Ce qui a sa tuile s'ouvre comme elle ; une note, une liste… se montrent sur leur toile. */
  const ouvrirPassage = (p: ResultatRecherche) => {
    const e = parCle.get(`${p.tableau}/${p.element ?? ''}`)
    if (e) return ouvrir(e)
    if (p.element) demanderAMontrer(p.element)
    allerA(`/t/${encodeURIComponent(p.tableau)}`)
  }

  /**
   * La recherche au doigt, à la façon des Notes d'iOS : sans requête, les récents en lignes ; en tapant, les titres
   * répondent à chaque lettre, les mots trouvés en gras, puis ce que contient le contenu ; rien trouvé propose de créer
   * la toile de ce nom.
   */
  const rechercheAuDoigt = () => {
    const r = requete.trim()
    if (!r) {
      const recents = toutes ? entreesDe({ portee: 'recents', filtre: 'tout' }, toutes, tri, racine).slice(0, RECENTS_AU_DOIGT) : []
      return (
        <section className="biblio-locale-resultats" aria-label={t('biblio.rubrique.recents')}>
          {recents.length > 0 && <h2>{t('biblio.rubrique.recents')}</h2>}
          <ul>
            {recents.map((e) => (
              <LigneDoigt key={cleDe(e)} genre={genreLigne(e)} titre={titreDe(e)} detail={detailAuDoigt(e)} requete="" onClick={() => ouvrir(e)} />
            ))}
          </ul>
        </section>
      )
    }
    return (
      <>
        <section className="biblio-locale-resultats" aria-live="polite">
          {visibles.length > 0 && (
            <>
              <h2>{t('biblio.resultats.titres')}</h2>
              <ul>
                {visibles.map((e) => (
                  <LigneDoigt key={cleDe(e)} genre={genreLigne(e)} titre={titreDe(e)} detail={detailAuDoigt(e)} requete={r} onClick={() => ouvrir(e)} />
                ))}
              </ul>
            </>
          )}
          {toutes && visibles.length === 0 && passagesVus.length === 0 && (
            <div className="biblio-locale-vide">
              <Icone nom="recherche" taille={28} />
              <p>{t('biblio.aucunResultatPour', { requete: r })}</p>
              {espace && (
                <button type="button" className="biblio-locale-voir" disabled={creation} onClick={() => void creerPuisOuvrir('toile', undefined, r)}>
                  {t('biblio.creerToileNommee', { titre: r })}
                </button>
              )}
            </div>
          )}
        </section>
        <Passages passages={passagesVus} requete={r} tous={tousPassages} voirTout={() => setTousPassages(true)} genreDe={genreDuPassage} ouvrir={ouvrirPassage} />
      </>
    )
  }

  // La toile d'un dossier qui porte encore ce qu'aucune tuile ne montre (des notes d'avant qu'il soit un dossier) : on
  // le dit, et on propose de le mettre dans une toile du dossier, plutôt que de le laisser invisible.
  const entreeDuDossier = dossier ? parCle.get(`${dossier}/`) : undefined
  const restes = dossier && entreeDuDossier && enDossier(dossier) && !cherche && outils && !restesRanges.has(dossier) ? restesDe(entreeDuDossier) : 0
  const rangerCesRestes = (d: string) => {
    if (!outils) return
    setRestesRanges((x) => new Set([...x, d]))
    void executer(rangerLesRestes(outils, { id: d, titre: titreToile(d) }))
  }
  const ligneDesRestes = restes > 0 && dossier && (
    <div className="biblio-restes" role="note">
      <Icone nom="tableau" taille={16} />
      <p>{tn('biblio.restes.texte', restes)}</p>
      <button type="button" className="bouton" onClick={() => rangerCesRestes(dossier)}>
        {t('biblio.restes.ranger')}
      </button>
    </div>
  )
  // La toile d'accueil ne se montre plus : vide, elle n'a rien à montrer. Si elle porte encore ce qu'aucune tuile ne
  // montre, une ligne le dit en tête de la racine et de la bibliothèque, et mène à elle.
  const ligneDeLaRacine = restesAccueil > 0 && espace && !cherche && dossier === racine && (
    <div className="biblio-restes" role="note">
      <Icone nom="tableau" taille={16} />
      <p>{tn('biblio.restes.racine', restesAccueil, { espace: nomRacine })}</p>
      <a className="bouton" href={accueil} onClick={(e) => surLien(e, accueil)}>
        {t('biblio.menu.ouvrirToile')}
      </a>
    </div>
  )

  /** Le nom de l'endroit qu'on regarde : la racine ou le dossier, la portée, ou ce que trouve la recherche. */
  const nomDeLaVue = cherche ? t('biblio.resultats') : dossier ? titreToile(dossier) : titreDeLaVue(vue)
  /** Une tuile du rangement (la racine, un dossier, les favoris, les partages, la recherche). */
  const uneTuile = (e: EntreeBibliotheque) => {
    const cle = cleDe(e)
    return (
      <Tuile
        key={cle}
        entree={e}
        menu={menuDuBouton}
        coche={modeChoix}
        choisie={sel.choisies.has(cle)}
        focalisable={cle === premiereFocalisable}
        glissee={glissees.has(cle)}
        survolee={e.element === null && survolDepot === e.tableau}
        arrivee={arrivees.has(cle)}
        {...(glisse?.insertion?.cle === cle ? { insertion: glisse.insertion.apres ? ('apres' as const) : ('avant' as const) } : {})}
        detail={detailDe(e)}
        renommer={renommage?.cle === cle}
        valider={(titre) => {
          void renommerCe(e, titre)
          rendreFocus(cle)
        }}
        annuler={() => {
          setRenommage(null)
          rendreFocus(cle)
        }}
      />
    )
  }
  /** Une ligne des récents : où c'est rangé, et quand on l'a ouvert. */
  const uneLigne = (e: EntreeBibliotheque) => {
    const cle = cleDe(e)
    return (
      <LigneRecente
        key={cle}
        entree={e}
        ou={rangeDans(e)}
        quand={e.vu !== null ? quandRecent(e.vu) : ''}
        aller={() => montrerOuElleEst(e)}
        auDoigt={telephone}
        menu={menuDuBouton}
        coche={modeChoix}
        choisie={sel.choisies.has(cle)}
        focalisable={cle === premiereFocalisable}
        glissee={glissees.has(cle)}
        arrivee={arrivees.has(cle)}
        renommer={renommage?.cle === cle}
        valider={(titre) => {
          void renommerCe(e, titre)
          rendreFocus(cle)
        }}
        annuler={() => {
          setRenommage(null)
          rendreFocus(cle)
        }}
      />
    )
  }
  const corpsDeLaPage = (
      <main
        className="biblio-corps"
        ref={corps}
        aria-busy={!toutes && !erreur}
        data-glisse={glisse ? '' : undefined}
        onPointerDown={surAppui}
        onDoubleClick={surDoubleClic}
        onClick={surClic}
        onContextMenu={surMenu}
      >
        {ligneDesRestes}
        {ligneDeLaRacine}
        {erreur ? (
          <div className="biblio-vide" role="alert">
            <p>{erreur}</p>
            <button type="button" className="bouton" onClick={lire}>
              {t('bandeau.reessayer')}
            </button>
          </div>
        ) : !toutes ? (
          // L'attente a déjà la forme de ce qui vient : des lignes pour les récents, des tuiles ailleurs.
          <ul className="biblio-grille" data-affichage={enRecents ? 'recents' : affichageVu} aria-hidden>
            {Array.from({ length: enRecents ? 8 : 10 }, (_, i) => (
              <li key={i} className="biblio-attente">
                <span />
                <span />
              </li>
            ))}
          </ul>
        ) : premierPas ? (
          <PremierPas
            creer={(g) => void creerPuisOuvrir(g)}
            occupe={creation}
            attente={attente}
            {...(importer && espace ? { importer: (f: File[]) => importerIci(f, espace.racine) } : {})}
            {...(decouvrir ? { decouvrir: () => void decouvrir().then((id) => allerA(`/t/${encodeURIComponent(id)}`)) } : {})}
          />
        ) : visibles.length === 0 && !neuf && !(cherche && passagesVus.length > 0) ? (
          <div className="biblio-vide">
            <Icone nom={cherche ? 'recherche' : filtre !== 'tout' ? ICONE_GENRE[filtre] : dossier && dossier !== racine ? 'dossier' : ICONE_PORTEE[portee]} taille={28} trait={1.5} />
            <p>{cherche ? t('biblio.aucunResultat', { requete: requete.trim() }) : vide().texte}</p>
            {!cherche && <small>{vide().aide}</small>}
            {cherche && espace && (
              <button type="button" className="bouton" disabled={creation} onClick={() => void creerPuisOuvrir('toile', undefined, requete.trim())}>
                {t('biblio.creerToileNommee', { titre: requete.trim() })}
              </button>
            )}
          </div>
        ) : (
          <>
            {sections.map((s) => {
              // La tuile « Nouvelle… » se pose là où arrive ce qu'on crée : après les dossiers de tête, avant le reste.
              const premier = s.cle === 'ici' ? s.entrees.findIndex((e) => !estDossier(e)) : 0
              const coupe = premier < 0 ? s.entrees.length : premier
              return (
                <section key={s.cle} className="biblio-section" aria-label={s.titre || undefined}>
                  {s.titre && <h2>{s.titre}</h2>}
                  <ul className="biblio-grille" data-affichage={enRecents ? 'recents' : affichageVu} role="listbox" aria-multiselectable aria-label={s.titre || nomDeLaVue}>
                    {enRecents ? (
                      s.entrees.map(uneLigne)
                    ) : (
                      <>
                        {s.entrees.slice(0, coupe).map(uneTuile)}
                        {s.cle === 'ici' && neuf && (
                          <li role="presentation">
                            {remonter ? (
                              // À la même place, sans que rien ne bouge sous le pointeur : y lâcher range dans le dossier du dessus.
                              <div className="biblio-tuile biblio-tuile-neuve" data-remonter data-depot={remonter} data-survol-depot={survolDepot === remonter || undefined}>
                                <span className="biblio-vignette" aria-hidden>
                                  <Icone nom="haut" taille={36} trait={1.2} />
                                </span>
                                <span className="biblio-tuile-titre">{t('biblio.remonter')}</span>
                                <span className="biblio-tuile-ou">{t('biblio.remonter.vers', { toile: titreToile(remonter) })}</span>
                              </div>
                            ) : (
                              <button type="button" className="biblio-tuile biblio-tuile-neuve" disabled={creation} onClick={() => void creerPuisOuvrir(neuf)}>
                                <span className="biblio-vignette" aria-hidden>
                                  <Icone nom="ajouter" taille={36} trait={1.2} />
                                </span>
                                <span className="biblio-tuile-titre">{t(`biblio.neuf.${neuf}`)}</span>
                                <span className="biblio-tuile-ou">{t('biblio.neuf.aideDans', { toile: dossier ? titreToile(dossier) : nomRacine })}</span>
                              </button>
                            )}
                          </li>
                        )}
                        {s.entrees.slice(coupe).map(uneTuile)}
                      </>
                    )}
                  </ul>
                </section>
              )
            })}
            {visibles.length === 0 && !cherche && (
              <div className="biblio-vide biblio-vide-bas">
                <p>{vide().texte}</p>
                <small>{vide().aide}</small>
              </div>
            )}
          </>
        )}
        {cherche && !telephone && toutes && (
          <Passages passages={passagesVus} requete={requete.trim()} tous={tousPassages} voirTout={() => setTousPassages(true)} genreDe={genreDuPassage} ouvrir={ouvrirPassage} />
        )}
        {cadre && <div className="biblio-cadre" style={{ left: cadre.gauche, top: cadre.haut, width: cadre.droite - cadre.gauche, height: cadre.bas - cadre.haut }} />}
      </main>
  )
  const parDessus = (
    <>
      {glisse && <Fantome entrees={entreesDes(glisse.cles)} x={glisse.x} y={glisse.y} />}
      {(apport || importEnCours > 0) && (
        <div className="biblio-apport" role="status">
          <Icone nom="importer" taille={16} />
          <span>{apport ? t('biblio.import.deposer', { toile: titreToile(apport.cible) }) : tn('biblio.import.encours', importEnCours)}</span>
        </div>
      )}
      {menu && (
        <div className="biblio-calque-menu">
          <MenuContextuel x={menu.x} y={menu.y} entrees={entreesDuMenu(menu)} fermer={() => setMenu(null)} />
        </div>
      )}
      {fenetre?.type === 'deplacer' && espace && toutes && (
        <DeplacerVers
          // Ce qu'un outil a généré reste : ni compté, ni exclu des toiles où ranger le reste ; l'avis le dira.
          entrees={entreesDes(fenetre.cles).filter((e) => !genere(e))}
          toutes={toutes}
          accueil={{ id: espace.racine, titre: nomRacine }}
          fermer={() => setFenetre(null)}
          choisir={(vers) => {
            const es = entreesDes(fenetre.cles)
            setFenetre(null)
            deplacerVers(es, vers.id)
          }}
        />
      )}
      {fenetre?.type === 'confirmer' && <Confirmation titre={fenetre.titre} lignes={fenetre.lignes} oui={t('biblio.confirmer.oui')} repondre={fenetre.repondre} />}
      {fenetre?.type === 'partage' && partage?.(fenetre.tableau, () => setFenetre(null))}
      {seul && <ModaleFichier contenu={seul.contenu} adresse={seul.adresse} fermer={() => setSeul(null)} />}
      <BandeauAvis />
    </>
  )

  if (telephone)
    return (
      <FournisseurVignettes value={vignettes}>
        <div className="biblio-locale biblio-telephone biblio-unie" data-cherche={rechercheOuverte || undefined} data-choix={enChoix || undefined}>
          <EnteteDoigt
            titre={dossier ? titreToile(dossier) : titreDeLaVue(vue)}
            actions={
              <>
                {fenetres && <BoutonReglages onClick={fenetres.reglages} />}
                {avatar && <span className="biblio-locale-avatar">{avatar}</span>}
                {espace && <BoutonPlus onClick={() => setFeuilleNeuf(true)} />}
              </>
            }
            requete={requete}
            changer={setRequete}
            cherche={rechercheOuverte}
            chercher={setRechercheOuverte}
          />
          {rechercheOuverte ? (
            rechercheAuDoigt()
          ) : (
            <>
              {bienvenueAMontrer && aLaRacine && espace && toutes && !premierPas && (
                <CarteBienvenue titre={carteBienvenue.titre} lignes={carteBienvenue.lignes} fermer={fermerBienvenue} />
              )}
              {toutes && !premierPas && aLaRacine && portesAuDoigt()}
              {/* Hors de la racine, d'où l'on vient, à gauche, comme le retour d'iOS : le dossier du dessus, sinon la racine. */}
              {(dossier ? dossier !== racine : racine !== null) && (
                <div className="biblio-locale-dossier">
                  <button type="button" className="biblio-locale-retour" onClick={() => (dossier && fil.length > 0 ? parcourir(fil[fil.length - 1]!) : choisirVue({ portee: 'tout', filtre: 'tout' }, true))}>
                    <Icone nom="precedent" taille={16} trait={2} />
                    <span>{dossier && fil.length > 0 ? titreToile(fil[fil.length - 1]!) : nomRacine}</span>
                  </button>
                  {dossier && !enDossier(dossier) && (
                    <a className="biblio-locale-voir" href={`/t/${encodeURIComponent(dossier)}`} onClick={(e) => surLien(e, `/t/${encodeURIComponent(dossier)}`)}>
                      {t('biblio.menu.ouvrirToile')}
                    </a>
                  )}
                </div>
              )}
              {/* Sur sa ligne : à côté du retour et de « Ouvrir la toile », elle ne tiendrait pas dans la largeur d'un téléphone. */}
              {dossier && lienFiche('biblio-locale-fiche', true)}
              {corpsDeLaPage}
            </>
          )}
          {enChoix && <div className="biblio-locale-choix">{barreChoix}</div>}
          {parDessus}
          {feuilleNeuf && (
            <FeuilleBas titre={t('biblio.nouveau')} fermer={() => setFeuilleNeuf(false)} className="biblio-locale-feuille">
              <ChoixCreation
                creer={(g) => void creerPuisOuvrir(g)}
                {...(outils
                  ? {
                      dossier: () => {
                        setFeuilleNeuf(false)
                        nouveauDossier()
                      },
                    }
                  : {})}
                occupe={creation}
              />
            </FeuilleBas>
          )}
        </div>
      </FournisseurVignettes>
    )

  return (
    <FournisseurVignettes value={vignettes}>
    <div className="biblio" data-tiroir={tiroir || undefined} data-apport={apport ? (apport.cible === espace?.racine ? 'accueil' : 'toile') : undefined} onDragEnter={surApport} onDragOver={surApport} onDragLeave={surDepart} onDrop={surLacher}>
      {tiroir && <div className="biblio-voile" aria-hidden onPointerDown={() => setTiroir(false)} />}
      <nav
        className="biblio-colonne"
        id="biblio-colonne"
        aria-label={t('biblio.titre')}
        ref={nav}
        onKeyDown={surToucheColonne}
        // Ce qu'on y choisit (une rubrique, l'accueil, l'aide, les réglages) referme le tiroir.
        onClick={(e) => (e.target as HTMLElement).closest('.biblio-rubrique') && setTiroir(false)}
        data-tauri-drag-region="deep"
      >
        <div className="biblio-nouveau">
          <button
            type="button"
            className="biblio-nouveau-bouton"
            aria-expanded={menuNeuf === 'colonne'}
            aria-haspopup="menu"
            disabled={creation}
            onClick={() => setMenuNeuf((o) => (o === 'colonne' ? false : 'colonne'))}
          >
            <Icone nom="ajouter" taille={18} trait={2} />
            {t('biblio.nouveau')}
            <Icone nom="chevronBas" taille={14} trait={2} />
          </button>
          {menuNeuf === 'colonne' && <MenuNeuf creer={(g) => void creerPuisOuvrir(g)} dossier={outils ? () => nouveauDossier() : undefined} fermer={() => setMenuNeuf(false)} />}
        </div>
        {/* La racine, une seule entrée, où l'on arrive : ce qui y est rangé, et rien d'autre. */}
        {racine && (
          <button
            type="button"
            className="biblio-rubrique"
            data-rubrique="tout"
            data-depot={outils ? racine : undefined}
            data-survol-depot={survolDepot === racine || undefined}
            aria-current={!cherche && dossier === racine ? 'page' : undefined}
            onClick={() => parcourir(racine)}
          >
            <span className="biblio-maison" aria-hidden>
              <Icone nom="maison" taille={12} trait={2.4} />
            </span>
            <span>{nomRacine}</span>
          </button>
        )}
        {bouton('recents')}
        {bouton('favoris')}
        {partages && bouton('partages')}
        {/* L'arbre des dossiers, en dernier : c'est lui qui s'allonge. */}
        {racine && arbre.length > 0 && (
          <>
            <p className="biblio-groupe">{t('biblio.dossiers')}</p>
            <ArbreDossiers
              noeuds={arbre}
              courant={cherche ? null : dossier}
              deplies={deplies}
              survol={survolDepot}
              parcourir={parcourir}
              basculer={(id) => setDeplies((d) => (d.has(id) ? new Set([...d].filter((x) => x !== id)) : new Set([...d, id])))}
              // Le menu de sa tuile, comme dans la grille, sans toucher à ce qu'on y a choisi.
              menu={(id, x, y) => parCle.has(`${id}/`) && setMenu({ x, y, type: 'tuiles', cles: [`${id}/`] })}
              profondeur={0}
            />
          </>
        )}
        <div className="biblio-bas">
          {fenetres && (
            <>
              <button type="button" className="biblio-rubrique" onClick={fenetres.aide}>
                <Icone nom="aide" taille={18} />
                <span>{t('biblio.aide')}</span>
              </button>
              <button type="button" className="biblio-rubrique" onClick={fenetres.reglages}>
                <Icone nom="reglages" taille={18} />
                <span>{t('reglages.titre')}</span>
              </button>
            </>
          )}
        </div>
      </nav>

      <header className="biblio-tete" data-tauri-drag-region="deep">
        {/* Quand la colonne est un tiroir : de quoi l'ouvrir, et « Nouveau », qui sinon s'y cacherait. */}
        <div className="biblio-tete-tiroir">
          <Ilot>
            <button
              type="button"
              className="notak-ilot-bouton"
              ref={boutonTiroir}
              aria-label={t('biblio.colonne')}
              title={t('biblio.colonne')}
              aria-expanded={tiroir}
              aria-controls="biblio-colonne"
              onClick={() => setTiroir((o) => !o)}
            >
              <Icone nom="tiroir" taille={20} trait={1.5} />
            </button>
          </Ilot>
          <div className="biblio-nouveau biblio-nouveau-tete">
            <button
              type="button"
              className="biblio-nouveau-bouton"
              aria-label={t('biblio.nouveau')}
              title={t('biblio.nouveau')}
              aria-expanded={menuNeuf === 'tete'}
              aria-haspopup="menu"
              disabled={creation}
              onClick={() => setMenuNeuf((o) => (o === 'tete' ? false : 'tete'))}
            >
              <Icone nom="ajouter" taille={18} trait={2} />
            </button>
            {menuNeuf === 'tete' && <MenuNeuf creer={(g) => void creerPuisOuvrir(g)} dossier={outils ? () => nouveauDossier() : undefined} fermer={() => setMenuNeuf(false)} />}
          </div>
        </div>
        {enChoix ? (
          barreChoix
        ) : dossier && !cherche ? (
          // Le fil d'une toile (FilDAriane) : le chemin sur sa ligne, le dossier qu'on parcourt en titre dessous ; chaque
          // dossier du chemin y mène, et prend ce qu'on y lâche (`data-depot`).
          <div className="biblio-titre">
            <FilDAriane
              ref={filDuDossier}
              titreDessous
              className="biblio-fil"
              etiquette={t('biblio.fil')}
              niveaux={fil.map((id) => ({ id, titre: titreToile(id), genre: genreDuNiveau(id), prive: estPrivee(id) }))}
              ici={{ genre: genreDuNiveau(dossier), titre: titreToile(dossier), prive: estPrivee(dossier), contenu: <h1>{titreToile(dossier)}</h1> }}
              aller={parcourir}
              place={placeDuFil}
              attributs={(n) => ({ 'data-depot': n.id, 'data-survol-depot': survolDepot === n.id || undefined })}
            />
          </div>
        ) : (
          <h1>{cherche ? t('biblio.resultats') : titreDeLaVue(vue)}</h1>
        )}
        <div className="biblio-tete-droite">
          {dossier && !cherche && !(modeChoix || choisies.length > 1) && fiche?.adresse && <Ilot className="biblio-ouvrir-toile">{lienFiche('biblio-ouvrir-toile-lien', true)}</Ilot>}
          {dossier && !enDossier(dossier) && !cherche && !(modeChoix || choisies.length > 1) && (
            <Ilot className="biblio-ouvrir-toile">
              <a className="biblio-ouvrir-toile-lien" href={`/t/${encodeURIComponent(dossier)}`} onClick={(e) => surLien(e, `/t/${encodeURIComponent(dossier)}`)}>
                <Icone nom="tableau" taille={16} />
                <span>{t('biblio.menu.ouvrirToile')}</span>
              </a>
            </Ilot>
          )}
          {/* Au doigt, pas de ⌘ ni de ⇧ pour choisir plusieurs tuiles : « Sélectionner », comme dans Fichiers. */}
          {ecranAuDoigt() && !modeChoix && toutes && toutes.length > 0 && (
            <Ilot className="biblio-choisir">
              <button
                type="button"
                className="biblio-choisir-bouton"
                onClick={() => {
                  setModeChoix(true)
                  setMenu(null)
                }}
              >
                {t('biblio.choisir')}
              </button>
            </Ilot>
          )}
          {/* L'ordre et l'affichage sont ceux du rangement : les récents ont les leurs, une liste par jour. Un seul bouton
              dit l'ordre choisi et ouvre les trois façons d'ordonner. */}
          {!enRecents && (
            <Ilot className="biblio-tri" etiquette={t('biblio.tri')}>
              <button
                type="button"
                className="biblio-tri-choix biblio-tri-bouton"
                aria-haspopup="menu"
                aria-expanded={menu?.type === 'tri'}
                aria-label={t('biblio.tri.bouton', { tri: t(`biblio.tri.${tri}`) })}
                title={t('biblio.tri')}
                onClick={(ev) => {
                  const r = ev.currentTarget.getBoundingClientRect()
                  setMenu((m) => (m?.type === 'tri' ? null : { x: r.left, y: r.bottom + 6, type: 'tri' }))
                }}
              >
                <Icone nom={ICONE_TRI[tri]} taille={16} />
                <span className="biblio-tri-libelle">{t(`biblio.tri.${tri}`)}</span>
                <Icone nom="chevronBas" taille={12} trait={2} />
              </button>
            </Ilot>
          )}
          {!enRecents && (
            <Ilot className="biblio-tri biblio-affichage" etiquette={t('biblio.affichage')}>
              {(['grille', 'liste'] as const).map((a) => (
                <button key={a} type="button" className="biblio-tri-choix" aria-pressed={affichage === a} aria-label={t(`biblio.affichage.${a}`)} title={t(`biblio.affichage.${a}`)} onClick={() => afficher(a)}>
                  <Icone nom={a === 'grille' ? 'vueGrille' : 'vueListe'} taille={16} />
                </button>
              ))}
            </Ilot>
          )}
          <Ilot className="biblio-recherche">
            <label className="biblio-recherche-champ">
              <Icone nom="recherche" taille={17} />
              <input
                ref={champ}
                type="search"
                placeholder={t('biblio.chercher')}
                aria-label={t('biblio.chercher')}
                value={requete}
                onChange={(e) => setRequete(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setRequete(''), e.currentTarget.blur())}
              />
              {!cherche && <kbd>⌘F</kbd>}
            </label>
          </Ilot>
          {(compte || fenetres) && (
            <Ilot className="notak-ilot-compte">
              {compte}
              {fenetres && <BoutonIlot icone="reglages" libelle={t('reglages.titre')} raccourci="⌘," onClick={fenetres.reglages} />}
            </Ilot>
          )}
        </div>
        {toutes && toutes.length > 0 && !enRecents && (genresIci.length > 1 || filtre !== 'tout') && (
          <div className="biblio-puces" role="group" aria-label={t('biblio.puces')}>
            {(['tout', ...TYPES.filter((g) => parGenre[g] > 0 || g === filtre)] as const).map((f) => (
              <button key={f} type="button" className="biblio-puce" data-puce={f} aria-pressed={filtre === f} onClick={() => choisirVue({ filtre: f })}>
                {f !== 'tout' && <Icone nom={ICONE_GENRE[f]} taille={15} />}
                <span>{f === 'tout' ? t('biblio.puce.tout') : t(`biblio.rubrique.${PLURIEL[f]}`)}</span>
                {f !== 'tout' && parGenre[f] > 0 && <small>{parGenre[f]}</small>}
              </button>
            ))}
          </div>
        )}
      </header>

      {corpsDeLaPage}

      {parDessus}
    </div>
    </FournisseurVignettes>
  )
}

/** Le menu du bouton « Nouveau » : une toile, une carte mentale ou un document, à la racine ou dans le dossier qu'on parcourt. */
function MenuNeuf({ creer, dossier, fermer }: { creer(genre: GenreNeuf): void; dossier?: () => void; fermer(): void }) {
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    menu.current?.querySelector('button')?.focus()
    const dehors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.biblio-nouveau') && fermer()
    const touche = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('pointerdown', dehors)
      document.removeEventListener('keydown', touche)
    }
  }, [fermer])
  return (
    <div className="biblio-menu" role="menu" ref={menu}>
      {(['toile', 'document', 'arbre'] as const).map((g) => (
        <button key={g} type="button" role="menuitem" onClick={() => creer(g)}>
          <Icone nom={ICONE_GENRE[g]} taille={18} />
          <span>
            {t(`biblio.genre.${g}`)}
            <small>{t(`biblio.neuf.${g}.aide`)}</small>
          </span>
        </button>
      ))}
      {dossier && (
        <button type="button" role="menuitem" onClick={dossier}>
          <Icone nom="dossier" taille={18} />
          <span>
            {t('biblio.dossier.titre')}
            <small>{t('biblio.dossier.aide')}</small>
          </span>
        </button>
      )}
    </div>
  )
}

/**
 * Une tuile : sa vignette, son titre, et ce qu'en dit l'endroit (sa date de création, ou où elle est rangée). Un clic la
 * choisit, un double-clic l'ouvre ; une toile prend ce qu'on lâche sur elle.
 */
function Tuile({
  entree: e,
  menu,
  coche,
  choisie,
  focalisable,
  glissee,
  survolee,
  arrivee,
  insertion,
  detail,
  renommer,
  valider,
  annuler,
}: {
  entree: EntreeBibliotheque
  /** Le « ••• » : le menu de la tuile, que la souris trouve au clic droit et le doigt à l'appui long. */
  menu(bouton: HTMLElement): void
  /** En « Sélectionner », la tuile porte sa case. */
  coche: boolean
  choisie: boolean
  focalisable: boolean
  glissee: boolean
  survolee: boolean
  /** Vient d'arriver (un import) : son anneau bat une fois. */
  arrivee?: boolean
  /** Rangé à la main : ce qu'on glisse se posera avant ou après elle. */
  insertion?: 'avant' | 'apres'
  /** Ce qu'on dit sous son titre, à côté de l'icône de son genre. */
  detail: string
  renommer: boolean
  valider(titre: string): void
  annuler(): void
}) {
  return (
    <li
      className="biblio-tuile"
      role="option"
      aria-selected={choisie}
      tabIndex={focalisable ? 0 : -1}
      data-cle={cleDe(e)}
      data-depot={e.element === null ? e.tableau : undefined}
      data-survol-depot={survolee || undefined}
      data-arrivee={arrivee || undefined}
      data-insertion={insertion}
      data-glissee={glissee || undefined}
      aria-label={[titreDe(e), e.outil ? t('biblio.genere', { outil: e.outil }) : null, e.prive && e.element === null ? t('partage.privee') : null].filter(Boolean).join(', ')}
      data-coche={coche || undefined}
      data-genre={e.genre}
    >
      <Vignette resume={e.resume} tableau={e.tableau} />
      {coche && (
        <span className="biblio-tuile-case" aria-hidden>
          {choisie && <Icone nom="coche" taille={14} trait={2.4} />}
        </span>
      )}
      {!coche && (
        <button type="button" className="biblio-tuile-plus" aria-label={t('biblio.actions')} aria-haspopup="menu" tabIndex={-1} onClick={(ev) => menu(ev.currentTarget)}>
          <Icone nom="plus" taille={16} trait={2} />
        </button>
      )}
      {renommer ? (
        <ChampRenommer valeur={e.titre} valider={valider} annuler={annuler} />
      ) : e.outil ? (
        <span className="biblio-tuile-titre" data-genere>
          <span className="biblio-tuile-nom">{titreDe(e)}</span>
          <MarqueOutil outil={e.outil} />
        </span>
      ) : (
        <span className="biblio-tuile-titre">
          {/* Une toile privée : un cadenas discret devant son nom ; le nom de la tuile le dit au lecteur d'écran. */}
          {e.prive && e.element === null && (
            <span className="biblio-tuile-privee" title={t('partage.privee')}>
              <Icone nom="verrou" taille={13} />
            </span>
          )}
          {titreDe(e)}
        </span>
      )}
      <span className="biblio-tuile-ou">
        <Icone nom={iconeDe(e)} taille={13} />
        <span>{detail}</span>
      </span>
    </li>
  )
}

/**
 * Une ligne des récents, sans vignette : on y reprend ce qu'on faisait, on n'y range pas. La pastille du genre, le
 * titre, où c'est rangé (le dossier du dessus, le chemin entier en bulle) et quand on l'a ouvert. Elle se choisit, se
 * glisse et s'ouvre comme une tuile ; « rangé dans » mène à l'endroit, où sa tuile se montre. Au doigt, deux lignes
 * comme celles de la recherche, « Clients · 14:32 », et l'endroit est au menu de l'appui long : pas de petite cible.
 */
function LigneRecente({
  entree: e,
  ou,
  quand,
  aller,
  auDoigt,
  menu,
  coche,
  choisie,
  focalisable,
  glissee,
  arrivee,
  renommer,
  valider,
  annuler,
}: {
  entree: EntreeBibliotheque
  ou: { nom: string; icone: NomIcone; chemin: string }
  quand: string
  aller(): void
  auDoigt: boolean
  menu(bouton: HTMLElement): void
  coche: boolean
  choisie: boolean
  focalisable: boolean
  glissee: boolean
  arrivee: boolean
  renommer: boolean
  valider(titre: string): void
  annuler(): void
}) {
  return (
    <li
      className="biblio-tuile biblio-recent"
      role="option"
      aria-selected={choisie}
      tabIndex={focalisable ? 0 : -1}
      data-cle={cleDe(e)}
      data-arrivee={arrivee || undefined}
      data-glissee={glissee || undefined}
      data-coche={coche || undefined}
      data-genre={e.genre}
      aria-label={[titreDe(e), e.prive && e.element === null ? t('partage.privee') : null, t('biblio.rangeDans', { endroit: ou.chemin }), quand].filter(Boolean).join(', ')}
    >
      <span className="biblio-locale-pastille biblio-recent-pastille" data-genre={estDossier(e) ? 'dossier' : e.genre} aria-hidden>
        <Icone nom={iconeDe(e)} taille={16} />
      </span>
      {renommer ? (
        <ChampRenommer valeur={e.titre} valider={valider} annuler={annuler} />
      ) : (
        <span className="biblio-tuile-titre">
          {e.prive && e.element === null && (
            <span className="biblio-tuile-privee" title={t('partage.privee')}>
              <Icone nom="verrou" taille={13} />
            </span>
          )}
          {titreDe(e)}
        </span>
      )}
      <span className="biblio-recent-detail">
        {auDoigt ? (
          <span className="biblio-recent-ou">
            <span>{ou.nom}</span>
          </span>
        ) : (
          <button type="button" className="biblio-recent-ou" title={ou.chemin} aria-label={t('biblio.menu.afficherDans', { endroit: ou.nom })} tabIndex={-1} onClick={aller}>
            <Icone nom={ou.icone} taille={13} />
            <span>{ou.nom}</span>
          </button>
        )}
        <span className="biblio-recent-quand">{quand}</span>
      </span>
      {coche ? (
        <span className="biblio-tuile-case" aria-hidden>
          {choisie && <Icone nom="coche" taille={14} trait={2.4} />}
        </span>
      ) : (
        <button type="button" className="biblio-tuile-plus" aria-label={t('biblio.actions')} aria-haspopup="menu" tabIndex={-1} onClick={(ev) => menu(ev.currentTarget)}>
          <Icone nom="plus" taille={16} trait={2} />
        </button>
      )}
    </li>
  )
}

/**
 * La marque d'un dossier qu'un outil rattaché a généré, à la suite de son titre : le nom de l'outil. Elle dit d'un coup
 * d'œil qu'il ne se modifie pas d'ici, et qui l'a fait ; un verrou se lirait, dans Notak, « protégé par un mot de passe ».
 */
function MarqueOutil({ outil }: { outil: string }) {
  return (
    <span className="biblio-genere" title={t('biblio.genere', { outil })}>
      {outil}
    </span>
  )
}

/**
 * L'arbre des dossiers de la colonne, sous l'accueil : chaque dossier se parcourt d'un toucher, prend ce qu'on lui
 * lâche, se déplie s'il en contient d'autres, et ouvre au clic droit le menu de sa tuile (celui de la webview, ses
 * « Recherche » et « Traduire » sur le nom qu'il choisit, n'a rien à faire ici). Les parents du dossier qu'on parcourt
 * sont dépliés.
 */
function ArbreDossiers({
  noeuds,
  courant,
  deplies,
  survol,
  parcourir,
  basculer,
  menu,
  profondeur = 1,
}: {
  noeuds: NoeudDossier[]
  courant: string | null
  deplies: ReadonlySet<string>
  survol: string | null
  parcourir(id: string): void
  basculer(id: string): void
  menu(id: string, x: number, y: number): void
  profondeur?: number
}) {
  return (
    <ul className="biblio-arbre" role="list">
      {noeuds.map((n) => {
        const ouvert = deplies.has(n.id)
        return (
          <li key={n.id}>
            <div className="biblio-arbre-ligne" style={{ paddingLeft: profondeur * 14 }}>
              {n.enfants.length > 0 ? (
                <button type="button" className="biblio-arbre-chevron" aria-expanded={ouvert} aria-label={t(ouvert ? 'biblio.arbre.replier' : 'biblio.arbre.deplier', { dossier: n.titre })} onClick={() => basculer(n.id)}>
                  <Icone nom={ouvert ? 'chevronBas' : 'chevronDroite'} taille={12} trait={2} />
                </button>
              ) : (
                <span className="biblio-arbre-chevron" aria-hidden />
              )}
              <button
                type="button"
                className="biblio-rubrique"
                data-depot={n.id}
                data-survol-depot={survol === n.id || undefined}
                aria-current={courant === n.id ? 'page' : undefined}
                onClick={() => parcourir(n.id)}
                onContextMenu={(ev) => {
                  ev.preventDefault()
                  menu(n.id, ev.clientX, ev.clientY)
                }}
              >
                <Icone nom="dossier" taille={18} />
                <span>{n.titre || t('commun.sansTitre')}</span>
                {n.outil && <MarqueOutil outil={n.outil} />}
              </button>
            </div>
            {ouvert && n.enfants.length > 0 && (
              <ArbreDossiers noeuds={n.enfants} courant={courant} deplies={deplies} survol={survol} parcourir={parcourir} basculer={basculer} menu={menu} profondeur={profondeur + 1} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Le nom qu'on change sur place : Entrée le garde, Échap y renonce, cliquer ailleurs le garde aussi. */
function ChampRenommer({ valeur, valider, annuler }: { valeur: string; valider(titre: string): void; annuler(): void }) {
  const [texte, setTexte] = useState(valeur)
  const fini = useRef(false)
  const finir = (garder: boolean) => {
    if (fini.current) return
    fini.current = true
    if (garder && texte.trim() && texte.trim() !== valeur) valider(texte)
    else annuler()
  }
  return (
    <input
      className="biblio-renommer"
      aria-label={t('biblio.renommer.champ')}
      value={texte}
      // La sélection du texte entier, comme le Finder.
      ref={(el) => {
        if (el && document.activeElement !== el && !fini.current) {
          el.focus()
          el.select()
        }
      }}
      onChange={(e) => setTexte(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finir(true)
        else if (e.key === 'Escape') finir(false)
      }}
      onBlur={() => finir(true)}
    />
  )
}

/** Ce qu'on glisse, sous le pointeur : la première vignette, et combien on en emporte. */
function Fantome({ entrees, x, y }: { entrees: EntreeBibliotheque[]; x: number; y: number }) {
  const e = entrees[0]
  if (!e) return null
  return (
    <div className="biblio-fantome" style={{ transform: `translate(${x + 14}px, ${y + 10}px)` }} aria-hidden>
      {entrees.length > 1 && <span className="biblio-fantome-pile" />}
      <Vignette resume={e.resume} tableau={e.tableau} />
      <span className="biblio-fantome-titre">{titreDe(e)}</span>
      {entrees.length > 1 && <span className="biblio-fantome-nombre">{entrees.length}</span>}
    </div>
  )
}
