import {
  BandeauAvis,
  BoutonIlot,
  type EntreeMenu,
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
  useSyncExternalStore,
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
  type Vue,
  PIECES,
  PLURIEL,
  RECENTS_MAX,
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
  ecrireAffichage,
  adresseDuDossier,
  elementDeLAdresse,
  lireAffichage,
  lireVue,
  vueDeLArrivee,
} from './bibliotheque/modele'
import { BarreChoix } from './bibliotheque/BarreChoix'
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
  VedetteAccueil,
  quand,
  useAuTelephone,
  useBienvenue,
} from './bibliotheque/AuDoigt'
import { vibrer } from './appareil'
import { ecouterImportBureau } from './importBureau'
import type { BilanImport } from './importation'
import { ouvrirDehors } from './bureau'
import { allerA, surLien } from './chemin'
import { t, tn } from './langue'

/**
 * La bibliothèque, page d'accueil de l'édition serveur : tout ce que le compte peut ouvrir, en vignettes, comme chez
 * Xmind. Une colonne de rubriques à gauche, la barre de l'application en haut, et des tuiles rangées par date
 * d'ouverture ou par dossier (la toile qui les porte). Les toiles restent la façon de ranger ; ici, on parcourt. Au
 * téléphone, la même page prend sa forme au doigt (ses pièces sont dans `bibliotheque/AuDoigt.tsx`).
 */

export type Tri = 'date' | 'dossier'

const ICONE_PORTEE: Record<Portee, NomIcone> = { tout: 'bibliotheque', recents: 'horloge', favoris: 'etoile', partages: 'equipe' }
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
 * Ce que crée la première tuile : dans la bibliothèque et les récents, le genre de la puce (une toile pour « Tout ») ;
 * rien pour une photo, un lien ou un fichier, qui s'importent, ni dans les favoris et les partages.
 */
function neufDe({ portee, filtre, dossier }: Vue): GenreNeuf | undefined {
  if (!dossier && portee !== 'tout' && portee !== 'recents') return undefined
  if (filtre === 'tout') return 'toile'
  return filtre === 'toile' || filtre === 'document' || filtre === 'arbre' ? filtre : undefined
}

const JOUR = 86_400_000

const parTitre = (a: EntreeBibliotheque, b: EntreeBibliotheque) =>
  (a.titre || '￿').localeCompare(b.titre || '￿', undefined, { sensitivity: 'base', numeric: true })
const parOuverture = (a: EntreeBibliotheque, b: EntreeBibliotheque) => (b.vu ?? -1) - (a.vu ?? -1) || parTitre(a, b)

/** Ce qu'une vue garde avant les puces : ce que porte le dossier qu'on parcourt, sinon la portée. */
const baseDe = (vue: Vue, toutes: readonly EntreeBibliotheque[]) => (vue.dossier ? contenuDuDossier(vue.dossier, toutes) : dansLaPortee(vue.portee, toutes))

/** Ce que montre une vue (où, et quoi), le plus récemment ouvert d'abord, puis par titre. */
export function entreesDe(vue: Vue, toutes: readonly EntreeBibliotheque[]): EntreeBibliotheque[] {
  const l = parLesPuces(vue, baseDe(vue, toutes)).sort(parOuverture)
  return !vue.dossier && vue.portee === 'recents' ? l.slice(0, RECENTS_MAX) : l
}

/** Le titre d'une vue : la portée, ou le genre quand on regarde toute la bibliothèque à travers une puce. */
export const titreDeLaVue = ({ portee, filtre }: Vue) => (portee === 'tout' && filtre !== 'tout' ? t(`biblio.rubrique.${PLURIEL[filtre]}`) : t(`biblio.rubrique.${portee}`))

/** Une suite de tuiles sous un titre ; `dans` : la toile que la section regroupe (tri par dossier). */
export interface Section {
  cle: string
  titre: string
  dans?: string | null
  entrees: EntreeBibliotheque[]
  /** « Tout voir » : la vue qui montre toute la rubrique, quand elle n'en montre qu'une part. */
  voir?: Partial<Vue>
}

/** Combien de tuiles une rubrique de l'accueil montre avant « Tout voir » ; au téléphone, deux rangées de deux. */
const PAR_RUBRIQUE = 8
const PAR_RUBRIQUE_TELEPHONE = 4
/** Le temps d'attente avant la recherche dans le contenu : les titres, eux, répondent à chaque lettre. */
const ATTENTE_CONTENU = 200
/** Combien de récents en lignes, quand la recherche au doigt s'ouvre sans rien encore. */
const RECENTS_AU_DOIGT = 8

/**
 * L'accueil de la bibliothèque, comme celui de Freeform ou de Google Drive : reprendre ce qu'on a ouvert, les favoris,
 * les dossiers, puis une rubrique par genre qui s'ouvre (toiles, pages, cartes mentales), chacune avec « Tout voir ».
 * Il reçoit ce que montre « Tout » : les photos, liens et fichiers n'y ont pas de rubrique, leur puce les montre.
 * Chaque entrée n'y paraît qu'une fois, dans la première rubrique qui la prend : la sélection et le clavier ne
 * connaissent qu'une tuile par entrée.
 */
export function sectionsDeLAccueil(entrees: readonly EntreeBibliotheque[], parRubrique = PAR_RUBRIQUE): Section[] {
  const montrees = new Set<string>()
  const sections: Section[] = []
  const ajouter = (cle: string, titre: string, candidates: EntreeBibliotheque[], voir?: Partial<Vue>, max = parRubrique) => {
    const toutes = [...candidates].sort(parOuverture)
    const libres = toutes.filter((e) => !montrees.has(cleDe(e)))
    const prises = libres.slice(0, max)
    if (prises.length === 0) return
    prises.forEach((e) => montrees.add(cleDe(e)))
    sections.push({ cle, titre, entrees: prises, ...(voir && toutes.length > prises.length ? { voir } : {}) })
  }
  ajouter('reprendre', t('biblio.accueil.reprendre'), entrees.filter((e) => e.vu !== null), { portee: 'recents', filtre: 'tout' })
  ajouter('favoris', t('biblio.rubrique.favoris'), entrees.filter((e) => e.favori), { portee: 'favoris', filtre: 'tout' })
  ajouter('dossiers', t('biblio.dossiers'), entrees.filter(estDossier), undefined, Infinity)
  for (const g of TYPES.filter((x) => !PIECES.has(x)))
    ajouter(`genre:${g}`, t(`biblio.rubrique.${PLURIEL[g]}`), entrees.filter((e) => e.genre === g && !estDossier(e)), { portee: 'tout', filtre: g })
  return sections
}

/** Les tuiles rangées par date d'ouverture : aujourd'hui, les sept derniers jours, plus tôt, puis jamais ouvertes. */
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
 * Les tuiles rangées par dossier : une section par toile qui les porte, titrée de son nom, la plus récemment ouverte
 * d'abord. Ce dont on ne lit pas la toile (un partage venu d'ailleurs) va à part, en dernier.
 */
export function sectionsParDossier(entrees: readonly EntreeBibliotheque[]): Section[] {
  const parDossier = new Map<string, Section>()
  for (const e of [...entrees].sort(parOuverture)) {
    const cle = e.dans ?? ''
    let s = parDossier.get(cle)
    if (!s) parDossier.set(cle, (s = { cle: `dossier:${cle}`, titre: e.dans ? e.ou || t('commun.sansTitre') : t('biblio.sansDossier'), dans: e.dans, entrees: [] }))
    s.entrees.push(e)
  }
  const recent = (s: Section) => s.entrees[0]?.vu ?? -1
  return [...parDossier.values()].sort(
    (a, b) => Number(!a.dans) - Number(!b.dans) || recent(b) - recent(a) || a.titre.localeCompare(b.titre, undefined, { sensitivity: 'base', numeric: true }),
  )
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


const CLE_TRI = 'notak:bibliotheque-tri'
function lireTri(): Tri {
  try {
    return localStorage.getItem(CLE_TRI) === 'dossier' ? 'dossier' : 'date'
  } catch {
    return 'date'
  }
}
function ecrireTri(tri: Tri) {
  try {
    localStorage.setItem(CLE_TRI, tri)
  } catch {
    // Sans stockage, le choix vaut pour la visite.
  }
}

/** Ce que la page demande à l'espace : de quoi lire le titre de l'accueil, créer, et ranger. */
type EspaceBibliotheque = EspaceRangement

/** Une fenêtre ouverte par-dessus la page. */
type Fenetre =
  | { type: 'deplacer'; cles: string[] }
  | { type: 'partage'; tableau: string }
  | { type: 'confirmer'; titre: string; lignes: string[]; repondre(oui: boolean): void }

/** Ce qu'on renomme sur place : une tuile, ou le titre d'un dossier (la toile qu'il regroupe). */
type Renommage = { cle: string } | { dossier: string }

/** Le menu du clic droit : sur des tuiles, sur le fond, ou sur le titre d'un dossier. */
type Menu = { x: number; y: number } & ({ type: 'tuiles'; cles: string[] } | { type: 'fond' } | { type: 'dossier'; dans: string; titre: string })

/** Le glisser de tuiles : ce qu'on glisse, où est le pointeur, et la toile survolée qui le prendrait. */
interface Glisse {
  cles: string[]
  x: number
  y: number
  cible: string | null
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

/** Crée sur une toile de l'espace (l'accueil, sans `dans`) ; rend où aller. */
const creerDansLEspace = (espace: EspaceBibliotheque | undefined) => async (genre: GenreNeuf, dans?: string) => {
  const ou = dans ?? espace!.racine
  await quandPretes(espace!, [ou])
  return creerDans(espace!, ou, genre)
}

/** La carte de bienvenue d'un serveur au téléphone, fermée une fois pour toutes (le stockage est déjà celui de ce serveur). */
export const CLE_BIENVENUE_SERVEUR = 'notak:serveur:bienvenue'

/** La carte du premier passage, au téléphone : sous quelle clé elle se ferme, son titre, ses lignes. */
export interface Bienvenue {
  cle: string
  titre: string
  lignes: readonly { icone: NomIcone; texte: string }[]
}

/** Celle d'un serveur : l'accueil, le « + », et le rond du compte quand il est là. */
const bienvenueServeur = (compte: boolean): Bienvenue => ({
  cle: CLE_BIENVENUE_SERVEUR,
  titre: t('biblio.bienvenue.serveur.titre'),
  lignes: [
    { icone: 'maison', texte: t('biblio.bienvenue.accueil') },
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
}: {
  charger?: () => Promise<EntreeBibliotheque[]>
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
  /** Crée sur une toile (l'accueil, sans `dans`) ; rend où aller. */
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
  const [depart] = useState(() => lireVue(location.search))
  const [choisie, setChoisie] = useState<Portee | null>(depart.portee)
  const [filtre, setFiltre] = useState<Filtre>(depart.filtre)
  /** La toile qu'on parcourt comme un dossier : elle tient lieu de portée. */
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
  const titreAccueil = useSyncExternalStore(espace?.ecouter ?? (() => () => {}), () => (espace ? espace.tableau(espace.racine)?.titre : '') ?? '')

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

  // On commence par les récents ; tant qu'on n'a rien ouvert, par toute la bibliothèque. Au téléphone, par son
  // accueil, qui a les récents en tête.
  const portee: Portee = choisie ?? (telephone || (toutes && !toutes.some((e) => e.vu !== null)) ? 'tout' : 'recents')
  // Au téléphone, ni tri ni affichage à choisir : par date, en grille, quoi qu'on ait choisi sur un écran plus grand.
  const triVu: Tri = telephone ? 'date' : tri
  const affichageVu: Affichage = telephone ? 'grille' : affichage
  const vue: Vue = { portee, filtre, ...(dossier ? { dossier } : {}) }
  const cherche = requete.trim() !== ''
  // La recherche lit toute la bibliothèque, d'où qu'on soit ; les puces la filtrent encore (au téléphone, elles se
  // cachent pendant qu'on cherche : elles ne filtrent rien).
  const filtreDeRecherche: Filtre = telephone ? 'tout' : filtre
  const visibles = useMemo(
    () => (toutes ? (cherche ? duFiltre(filtreDeRecherche, filtrer(toutes, requete)).sort(parOuverture) : entreesDe({ portee, filtre, ...(dossier ? { dossier } : {}) }, toutes)) : []),
    [toutes, cherche, requete, portee, filtre, filtreDeRecherche, dossier],
  )
  /** Ce que chaque puce garderait, là où l'on est. */
  const parGenre = useMemo(
    () => compterParGenre(toutes ? (cherche ? filtrer(toutes, requete) : baseDe({ portee, filtre: 'tout', ...(dossier ? { dossier } : {}) }, toutes)) : []),
    [toutes, cherche, requete, portee, dossier],
  )
  // Toute la bibliothèque, sans puce ni recherche, triée par date : son accueil, en rubriques.
  const accueilDeLaBibliotheque = portee === 'tout' && filtre === 'tout' && !dossier && !cherche && triVu === 'date'
  const sections =
    triVu === 'dossier' ? sectionsParDossier(visibles) : accueilDeLaBibliotheque ? sectionsDeLAccueil(visibles, telephone ? PAR_RUBRIQUE_TELEPHONE : PAR_RUBRIQUE) : sectionsParDate(visibles)
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
  const titreToile = (id: string) => (espace && id === espace.racine ? titreAccueil || t('biblio.accueil') : parCle.get(`${id}/`)?.titre || t('commun.sansTitre'))
  /**
   * Ce qu'on ouvre d'ici arrive avec le chemin des dossiers où il est rangé (`parent` : pour une toile qu'on vient d'y
   * créer) : la barre de la toile le redit, et chaque maillon mène à sa liste, au lieu de croire qu'on vient de l'accueil.
   */
  const tenirLeChemin = (tableau: string, parent?: string) => {
    if (!espace?.entrer || !toutes) return
    const c = parent ? [...filDAriane(parent, toutes, espace.racine), tableau] : filDAriane(tableau, toutes, espace.racine)
    for (let i = 1; i < c.length; i++) espace.entrer(c[i]!, c[i - 1]!)
  }
  /** Un dossier autre que l'accueil : il ne se montre jamais en toile, ni ce qu'il porte sur la sienne. */
  const sousDossier = (id: string | null | undefined): boolean => {
    if (!id || id === espace?.racine) return false
    const e = parCle.get(`${id}/`)
    return !!e && estDossier(e)
  }

  /**
   * Change de vue : la portée (la colonne), le filtre (les puces), le dossier qu'on parcourt ; l'adresse la redit.
   * Choisir une portée quitte le dossier ; changer de puce le garde.
   */
  const choisirVue = (v: Partial<Omit<Vue, 'dossier'>> & { dossier?: string | null }) => {
    const d = v.dossier !== undefined ? v.dossier : v.portee ? null : dossier
    const apres: Vue = { portee: v.portee ?? portee, filtre: v.filtre ?? filtre, ...(d ? { dossier: d } : {}) }
    setChoisie(apres.portee)
    setFiltre(apres.filtre)
    setDossier(d)
    history.replaceState(null, '', adresseDeLaVue(apres))
  }
  /** Une rubrique de la colonne : on quitte la recherche, et le tiroir se referme sur la vue choisie. */
  const choisir = (r: Portee) => {
    setRequete('')
    setTiroir(false)
    choisirVue({ portee: r })
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
    setDeplies((d) => new Set([...d, ...(toutes ? filDAriane(id, toutes, espace?.racine ?? null) : [])]))
    corps.current?.scrollTo?.({ top: 0 })
  }
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
      // Sans toile dite, ce qu'on crée va dans le dossier qu'on parcourt.
      const neuve = await creer(genre, dans ?? dossier ?? undefined)
      // « Créer la toile « … » », quand la recherche n'a rien trouvé : elle porte ce qu'on cherchait.
      if (titre && neuve.element === null && espace) espace.renommer(neuve.tableau, titre)
      // Ce qu'on vient de créer compte parmi les récents.
      void noterVu(neuve)
      tenirLeChemin(neuve.tableau, neuve.element === null ? (dans ?? dossier ?? undefined) : undefined)
      allerAEntree(neuve)
    } finally {
      // Ce qu'on a créé s'est ouvert : la page a pu partir.
      if (montee.current) setCreation(false)
    }
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
    if (sousDossier(e.tableau)) return ouvrirSeul(e)
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
    // La toile neuve va là où tout était, sinon sur l'accueil.
    const ou = es.every((e) => porteuseDe(e) === porteuseDe(es[0]!)) ? (porteuseDe(es[0]!) ?? outils.espace.racine) : outils.espace.racine
    // Comme le « nouveau dossier avec la sélection » du Finder : la toile neuve est choisie, son nom prêt à changer.
    void executer(rangerDansUneNeuve(outils, es, { id: ou, titre: titreToile(ou) }, confirmerOuverture(nomDe(es), ou))).then((r) => {
      if (!r) return
      const cle = `${r.toile}/`
      setSel({ choisies: new Set([cle]), ancre: cle })
      setCourante(cle)
      setRenommage({ cle })
    })
  }
  /** Un dossier neuf, là où l'on est (l'accueil, ou le dossier du clic droit) : on le voit choisi, son nom prêt à changer. */
  const nouveauDossier = (dans?: string) => {
    if (!outils) return
    preparerClavier()
    const ou = dans ?? dossier ?? outils.espace.racine
    setMenuNeuf(false)
    // Il doit se voir : dans le dossier qu'on parcourt s'il y naît, sinon dans toute la bibliothèque ; ses toiles, sans recherche.
    const ici = dossier ? ou === dossier : portee === 'tout'
    if (!ici || (filtre !== 'tout' && filtre !== 'toile') || cherche) {
      setRequete('')
      choisirVue(dossier === ou ? { filtre: 'toile' } : { portee: 'tout', filtre: 'toile' })
    }
    void executer(creerDossier(outils, { id: ou, titre: titreToile(ou) })).then((r) => {
      if (!r) return
      const cle = `${r.toile}/`
      setSel({ choisies: new Set([cle]), ancre: cle })
      setCourante(cle)
      setRenommage({ cle })
    })
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
      estDossier(e) ? adresseDuDossier(e.tableau) : e.element && !EN_GRAND.has(e.genre) && sousDossier(e.tableau) ? adresseDuDossier(e.tableau, e.element) : adresseDe(e)
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
    if (une?.resume.genre === 'lien') {
      const url = une.resume.url
      l.push({ libelle: t('biblio.menu.ouvrirLien'), icone: 'ouvrir', faire: () => ouvrirDehors(url) })
    }
    if (porteuse && !sousDossier(porteuse)) l.push({ libelle: t('biblio.menu.afficher'), icone: 'tableau', faire: () => afficherDansSaToile(une!, porteuse) })
    // Au doigt, l'appui long mène aussi au choix de plusieurs, comme dans Fichiers : la tuile tenue y est déjà.
    if (ecranAuDoigt() && !modeChoix) l.push({ libelle: t('biblio.choisir'), icone: 'menuSelectionner', faire: () => setModeChoix(true) })
    l.push(null)
    if (une && ecrit)
      l.push({
        libelle: t('biblio.menu.renommer'),
        icone: 'renommer',
        raccourci: 'F2',
        faire: () => {
          preparerClavier()
          setRenommage({ cle: cleDe(une) })
        },
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
          ? { libelle: t('biblio.menu.enToile'), icone: 'tableau', faire: () => montrerEnDossierCe(une, false) }
          : { libelle: t('biblio.menu.enDossier'), icone: 'dossier', faire: () => montrerEnDossierCe(une, true) },
      )
    l.push(null)
    if (ecrit) l.push({ libelle: t('biblio.menu.deplacer'), icone: 'dossier', faire: () => setFenetre({ type: 'deplacer', cles }) })
    if (ecrit && es.length > 1) l.push({ libelle: t('biblio.menu.neuveAvec'), icone: 'ajouter', faire: () => rangerDansNeuveCes(es) })
    l.push({ libelle: t(es.length > 1 ? 'biblio.menu.liens' : 'biblio.menu.lien'), icone: 'lien', faire: () => copierLiens(es) })
    if (une?.element === null && partage) l.push({ libelle: t('biblio.menu.partager'), icone: 'partager', faire: () => setFenetre({ type: 'partage', tableau: une.tableau }) })
    l.push(null)
    if (ecrit) l.push({ libelle: t('biblio.menu.corbeille'), icone: 'corbeille', raccourci: '⌫', danger: true, faire: () => jeterCes(es) })
    return l
  }
  const sousMenuCreer = (dans?: string): EntreeMenu[] =>
    (['toile', 'document', 'arbre'] as const).map((g) => ({ libelle: t(`biblio.genre.${g}`), icone: ICONE_GENRE[g], faire: () => void creerPuisOuvrir(g, dans) }))
  const menuDuFond = (): EntreeMenu[] => [
    ...(espace
      ? [
          { libelle: t('biblio.menu.nouveau'), icone: 'ajouter' as const, sous: sousMenuCreer(), faire: () => {} },
          { libelle: t('biblio.menu.nouveauDossier'), icone: 'dossier' as const, raccourci: '⇧⌘N', faire: () => nouveauDossier() },
          null,
        ]
      : []),
    { libelle: t('biblio.tri.date'), icone: 'horloge', coche: tri === 'date', faire: () => trier('date') },
    { libelle: t('biblio.tri.dossier'), icone: 'dossier', coche: tri === 'dossier', faire: () => trier('dossier') },
    null,
    { libelle: t('biblio.menu.toutChoisir'), icone: 'menuSelectionner', raccourci: '⌘A', desactive: ordre.length === 0, faire: () => setSel(toutChoisir(ordre)) },
  ]
  const menuDuDossier = (dans: string): EntreeMenu[] => [
    { libelle: t('biblio.menu.parcourir'), icone: 'dossier', faire: () => parcourir(dans) },
    ...(sousDossier(dans) ? [] : [{ libelle: t('biblio.menu.ouvrirToile'), icone: 'ouvrir' as const, faire: () => allerA(`/t/${encodeURIComponent(dans)}`) }]),
    ...(espace
      ? [
          { libelle: t('biblio.menu.creerIci'), icone: 'ajouter' as const, sous: sousMenuCreer(dans), faire: () => {} },
          { libelle: t('biblio.menu.nouveauDossier'), icone: 'dossier' as const, faire: () => nouveauDossier(dans) },
          null,
          {
            libelle: t(sousDossier(dans) ? 'biblio.menu.renommerDossier' : 'biblio.menu.renommerToile'),
            icone: 'renommer' as const,
            faire: () => {
              preparerClavier()
              setRenommage({ dossier: dans })
            },
          },
        ]
      : []),
  ]
  /** Au doigt, sans clavier sous la main, le menu ne parle pas de raccourcis (la feuille du téléphone non plus). */
  const sansRaccourcis = (l: EntreeMenu[]): EntreeMenu[] => (ecranAuDoigt() ? l.map((e) => (e && e.raccourci ? (({ raccourci: _r, ...reste }) => reste)(e) : e)) : l)
  const entreesDuMenu = (m: Menu) => sansRaccourcis(m.type === 'tuiles' ? menuDesTuiles(m.cles) : m.type === 'fond' ? menuDuFond() : menuDuDossier(m.dans))

  /** Le menu de ce qui est sous `el` : la tuile (et les autres choisies avec elle), le titre d'un dossier, ou le fond. */
  const ouvrirMenuSur = (el: HTMLElement, x: number, y: number) => {
    const { sel: s, choisies: ch, ordre: o } = etat.current
    const tuile = el.closest<HTMLElement>('[data-cle]')
    const dossier = el.closest<HTMLElement>('[data-dossier]')
    if (tuile) {
      const cle = tuile.dataset.cle!
      const cles = s.choisies.has(cle) ? ch : [cle]
      if (!s.choisies.has(cle)) setSel(cliquer(s, cle, o))
      setCourante(cle)
      setMenu({ x, y, type: 'tuiles', cles })
    } else if (dossier) setMenu({ x, y, type: 'dossier', dans: dossier.dataset.dossier!, titre: dossier.textContent ?? '' })
    else setMenu({ x, y, type: 'fond' })
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

  const etat = useRef({ sel, ordre, choisies, parCle, toutes })
  etat.current = { sel, ordre, choisies, parCle, toutes }
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
    // Le « ••• » d'une tuile ouvre son menu : ni choix, ni glisser.
    if (el.closest('.biblio-tuile-plus')) return
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
    if (el.closest('a, button, [data-dossier]')) return
    tracerCadre(ev, touches)
  }

  const glisser = (ev: ReactPointerEvent, cle: string, reduireAuRelache: boolean) => {
    const depart = { x: ev.clientX, y: ev.clientY }
    const pointeur = { y: ev.clientY }
    let courant: Glisse | null = null
    let arretDefilement = () => {}
    const viser = (x: number, y: number) => {
      if (!courant) return
      const sous = document.elementFromPoint?.(x, y)?.closest<HTMLElement>('[data-depot]')
      const id = sous?.dataset.depot ?? null
      courant = { ...courant, x, y, cible: id && depotPossible(id, courant.cles) ? id : null }
      setGlisse(courant)
    }
    const bouger = (e: PointerEvent) => {
      pointeur.y = e.clientY
      if (!courant) {
        if (Math.hypot(e.clientX - depart.x, e.clientY - depart.y) < 5) return
        const { sel: s, ordre: o } = etat.current
        courant = { cles: s.choisies.has(cle) ? o.filter((c) => s.choisies.has(c)) : [cle], x: e.clientX, y: e.clientY, cible: null }
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
      if (g.cible) deplacerVers(g.cles.flatMap((c) => etat.current.parCle.get(c) ?? []), g.cible)
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
    if (el.closest('input, .biblio-tuile-plus')) return
    const cle = el.closest<HTMLElement>('[data-cle]')?.dataset.cle
    const e = cle ? parCle.get(cle) : undefined
    if (e) ouvrir(e)
  }
  // Au doigt et au Pencil, une tuile touchée s'ouvre ; en « Sélectionner », elle se choisit ou se retire.
  const surClic = (ev: ReactMouseEvent) => {
    if (!auDoigt.current) return
    const el = ev.target as HTMLElement
    if (el.closest('.biblio-tuile-plus')) return
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
    } else if (e.key === 'F2' && une && outils) {
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

  /** Importe ces fichiers sur la toile `dans` : l'accueil, ou la toile (tuile, dossier) sur laquelle on les lâche. */
  const importerIci = (fichiers: File[], dans: string) => {
    if (!outils || !importer || fichiers.length === 0) return
    setImportEnCours(fichiers.length)
    void executer(importerEntrees(outils, importer, fichiers, { id: dans, titre: titreToile(dans) }, (element) => afficherDansSaToile({ tableau: dans, element }, dans)))
      .then((r) => r && montrerArrivee(r.entrees, dans))
      .finally(() => setImportEnCours(0))
  }
  /**
   * Ce qu'on vient d'importer se voit là où l'on est, s'il y a sa place ; sinon dans les récents, sous la puce qui le
   * montre, ou dans la toile qui l'a pris (`vueDeLArrivee`). Une recherche qui le cacherait se vide. Les tuiles sont
   * choisies, la première vient à l'écran, et leur anneau bat une fois. Rien de neuf à montrer (des fichiers joints
   * seuls) : c'est la toile qui les a pris qui bat.
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
    const icite = entrees.every((e) => entreesDe(vue, [e]).length > 0)
    if (cherche || !icite) {
      setRequete('')
      if (!icite) {
        const ou = vueDeLArrivee(entrees, dans)
        choisirVue({ ...ou, dossier: ou.dossier ?? null })
      }
    }
    setSel({ choisies: new Set(cles), ancre: cles[0]! })
    setCourante(cles[0]!)
    battre(cles)
    plusTard(() => tuileDe(cles[0]!)?.scrollIntoView?.({ block: 'nearest' }), 60)
  }
  // L'élément que l'adresse demande dans son dossier (« Copier le lien », la fiche d'un autre outil) : choisi, et
  // ouvert seul, une fois la liste arrivée. Un lien n'est que choisi : un onglet ouvert sans clic serait bloqué.
  const demande = useRef(elementDeLAdresse(location.search))
  useEffect(() => {
    const el = demande.current
    if (!el || !dossier || !toutes) return
    demande.current = null
    const e = parCle.get(`${dossier}/${el}`)
    // L'adresse ne garde que le dossier : y revenir (le retour du navigateur) ne rouvre pas l'élément.
    history.replaceState(history.state, '', adresseDuDossier(dossier))
    if (!e) return
    const cle = cleDe(e)
    setSel({ choisies: new Set([cle]), ancre: cle })
    setCourante(cle)
    plusTard(() => tuileDe(cle)?.scrollIntoView?.({ block: 'nearest' }), 60)
    if (e.resume.genre !== 'lien') ouvrir(e)
  }, [toutes, dossier]) // une fois, à l’arrivée de la liste
  const importerCourant = useRef(importerIci)
  importerCourant.current = importerIci
  // Fichier › Importer… dans Notak de bureau : dans le dossier qu'on parcourt, sinon sur l'accueil, comme un fichier lâché sur le fond.
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
  /** Ce que dit une vue vide : le genre de la puce s'il y en a une, sinon le dossier qu'on parcourt, sinon la portée. */
  const vide = (): { texte: string; aide: string } =>
    filtre !== 'tout'
      ? { texte: t(`biblio.vide.${PLURIEL[filtre]}`), aide: portee === 'tout' && !dossier ? t(`biblio.vide.${PLURIEL[filtre]}.aide`) : t('biblio.vide.filtre.aide') }
      : dossier
        ? { texte: t('biblio.vide.dossier'), aide: t('biblio.vide.dossier.aide') }
        : { texte: t(`biblio.vide.${portee}`), aide: t(`biblio.vide.${portee}.aide`) }
  const accueil = espace ? `/t/${encodeURIComponent(espace.racine)}` : '/'
  const arbre = useMemo(() => (toutes && espace ? arbreDesDossiers(toutes, espace.racine) : []), [toutes, espace])
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
  const genreDuNiveau = (id: string): GenreNiveau => (id === espace?.racine ? 'accueil' : sousDossier(id) ? 'dossier' : 'toile')
  // Le fil prend la place que lui laissent les îlots de droite : ce qui ne tient pas passe dans « … ».
  const [placeDuFil, filDuDossier] = usePlaceDuFil('parent')
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

  /** L'accueil de la bibliothèque : ni portée, ni puce, ni dossier. */
  const accueilDeLaVue = portee === 'tout' && filtre === 'tout' && !dossier
  /** Ce que porte la page, pour la vedette de l'accueil : toutes les toiles, pages et cartes mentales. */
  const nombresDeLAccueil = useMemo(() => {
    const l = toutes ?? []
    return { toiles: l.filter((e) => e.genre === 'toile').length, documents: l.filter((e) => e.genre === 'document').length, cartes: l.filter((e) => e.genre === 'arbre').length }
  }, [toutes])
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
   * Hors téléphone, la toile d'accueil en tête des récents comme de tout : la colonne ne la montrait que parmi les
   * dossiers, où elle se parcourt sans s'ouvrir, et la colonne d'un iPad en portrait est un tiroir fermé.
   */
  const vedetteEnTete = !telephone && !!espace && !dossier && !cherche && filtre === 'tout' && (portee === 'tout' || portee === 'recents')
  /** Sous une tuile au doigt : la toile qui la porte, sauf l'accueil, qui porte tout ; sinon quand on l'a ouverte. */
  const detailAuDoigt = (e: EntreeBibliotheque) => (e.ou && e.dans !== espace?.racine ? t('biblio.dans', { toile: e.ou }) : quand(e.vu))
  const genreLigne = (e: EntreeBibliotheque): GenreLigne => (estDossier(e) ? 'dossier' : e.genre)
  /**
   * Rien encore : de quoi commencer, au lieu d'une toile déjà remplie. Au téléphone, un accueil où l'on a déjà posé
   * quelque chose reste en vedette, même sans autre toile.
   */
  const premierPas = !!toutes && toutes.length === 0 && !cherche && !(resumeAccueil && resumeAccueil.boites.length > 0)

  /**
   * La rangée des filtres au doigt, qui glisse : « Tout » (l'accueil), puis où (récents, favoris, partages) et quoi
   * (un genre), qui se combinent ; un filtre touché une seconde fois se retire.
   */
  const filtresAuDoigt = () => {
    const portees: Portee[] = partages ? ['recents', 'favoris', 'partages'] : ['recents', 'favoris']
    return (
      <nav className="biblio-locale-filtres" aria-label={t('biblio.telephone.filtres')}>
        <button type="button" className="biblio-locale-filtre" data-rubrique="tout" aria-pressed={accueilDeLaVue} onClick={() => choisirVue({ portee: 'tout', filtre: 'tout', dossier: null })}>
          {t('biblio.telephone.tout')}
        </button>
        {portees.map((r) => {
          const actif = !dossier && portee === r
          return (
            <button key={r} type="button" className="biblio-locale-filtre" data-rubrique={r} aria-pressed={actif} onClick={() => choisirVue({ portee: actif ? 'tout' : r })}>
              {t(`biblio.rubrique.${r}`)}
              {combien(r) > 0 && <small>{combien(r)}</small>}
            </button>
          )
        })}
        <span className="biblio-locale-filtres-sep" aria-hidden />
        {TYPES.map((g) => (
          <button
            key={g}
            type="button"
            className="biblio-locale-filtre"
            data-puce={g}
            aria-pressed={filtre === g}
            data-vide={parGenre[g] === 0 || undefined}
            onClick={() => choisirVue({ filtre: filtre === g ? 'tout' : g })}
          >
            {t(`biblio.rubrique.${PLURIEL[g]}`)}
            {parGenre[g] > 0 && <small>{parGenre[g]}</small>}
          </button>
        ))}
      </nav>
    )
  }

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
      const recents = toutes ? entreesDe({ portee: 'recents', filtre: 'tout' }, toutes).slice(0, RECENTS_AU_DOIGT) : []
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
  const restes = dossier && entreeDuDossier && sousDossier(dossier) && !cherche && outils && !restesRanges.has(dossier) ? restesDe(entreeDuDossier) : 0
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
        {erreur ? (
          <div className="biblio-vide" role="alert">
            <p>{erreur}</p>
            <button type="button" className="bouton" onClick={lire}>
              {t('bandeau.reessayer')}
            </button>
          </div>
        ) : !toutes ? (
          <ul className="biblio-grille" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
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
            <Icone nom={cherche ? 'recherche' : filtre !== 'tout' ? ICONE_GENRE[filtre] : ICONE_PORTEE[portee]} taille={28} trait={1.5} />
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
            {vedetteEnTete && espace && (
              <VedetteAccueil titre={titreAccueil || t('biblio.accueil')} resume={resumeAccueil} nombres={nombresDeLAccueil} onClick={() => allerA(accueil)} />
            )}
            {(sections.length > 0 || cherche ? sections : [{ cle: 'vide', titre: '', entrees: [] } as Section]).map((s, i) => (
              <section key={s.cle} className="biblio-section" aria-label={s.titre || undefined} data-rail={(accueilDeLaBibliotheque && s.cle === 'reprendre') || undefined}>
                {s.titre && (
                  <h2
                    data-dossier={s.dans || undefined}
                    data-depot={s.dans || undefined}
                    data-survol-depot={(s.dans && survolDepot === s.dans) || undefined}
                  >
                    {s.dans !== undefined && <Icone nom={s.dans ? 'tableau' : 'equipe'} taille={15} />}
                    {s.dans && renommage && 'dossier' in renommage && renommage.dossier === s.dans ? (
                      <ChampRenommer
                        valeur={s.titre}
                        valider={(titre) => void renommerCe({ tableau: s.dans!, element: null, titre: s.titre }, titre)}
                        annuler={() => setRenommage(null)}
                      />
                    ) : s.dans ? (
                      <a
                        href={adresseDeLaVue({ portee, filtre: 'tout', dossier: s.dans })}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                          e.preventDefault()
                          parcourir(s.dans!)
                        }}
                      >
                        {s.titre}
                      </a>
                    ) : (
                      s.titre
                    )}
                    {s.voir && (
                      <button type="button" className="biblio-voir" onClick={() => choisirVue(s.voir!)}>
                        {t('biblio.toutVoir')}
                        <Icone nom="chevronDroite" taille={13} trait={2} />
                      </button>
                    )}
                  </h2>
                )}
                <ul className="biblio-grille" data-affichage={affichageVu} role="listbox" aria-multiselectable aria-label={s.titre || titreDeLaVue(vue)}>
                  {i === 0 && neuf && (
                    <li role="presentation">
                      <button type="button" className="biblio-tuile biblio-tuile-neuve" disabled={creation} onClick={() => void creerPuisOuvrir(neuf)}>
                        <span className="biblio-vignette" aria-hidden>
                          <Icone nom="ajouter" taille={36} trait={1.2} />
                        </span>
                        <span className="biblio-tuile-titre">{t(`biblio.neuf.${neuf}`)}</span>
                        <span className="biblio-tuile-ou">{dossier && dossier !== espace?.racine ? t('biblio.neuf.aideDans', { toile: titreToile(dossier) }) : t('biblio.neuf.aide')}</span>
                      </button>
                    </li>
                  )}
                  {s.entrees.map((e) => {
                    const cle = cleDe(e)
                    return (
                      <Tuile
                        key={cle}
                        entree={e}
                        menu={menuDuBouton}
                        coche={modeChoix}
                        parDossier={triVu === 'dossier'}
                        choisie={sel.choisies.has(cle)}
                        focalisable={cle === premiereFocalisable}
                        glissee={glissees.has(cle)}
                        survolee={e.element === null && survolDepot === e.tableau}
                        arrivee={arrivees.has(cleDe(e))}
                        {...(telephone ? { detail: detailAuDoigt(e) } : {})}
                        renommer={renommage !== null && 'cle' in renommage && renommage.cle === cle}
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
                  })}
                </ul>
              </section>
            ))}
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
          entrees={entreesDes(fenetre.cles)}
          toutes={toutes}
          accueil={{ id: espace.racine, titre: titreAccueil || t('biblio.accueil') }}
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
            titre={dossier ? titreToile(dossier) : accueilDeLaVue ? t('biblio.titre') : titreDeLaVue(vue)}
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
              {bienvenueAMontrer && accueilDeLaVue && espace && toutes && !premierPas && (
                <CarteBienvenue titre={carteBienvenue.titre} lignes={carteBienvenue.lignes} partir={() => allerA(accueil)} fermer={fermerBienvenue} />
              )}
              {accueilDeLaVue && espace && toutes && !premierPas && (
                <VedetteAccueil titre={titreAccueil || t('biblio.accueil')} resume={resumeAccueil} nombres={nombresDeLAccueil} onClick={() => allerA(accueil)} />
              )}
              {toutes && !premierPas && filtresAuDoigt()}
              {dossier && (
                <div className="biblio-locale-dossier">
                  <button type="button" className="biblio-locale-retour" onClick={() => (fil.length > 0 ? parcourir(fil[fil.length - 1]!) : choisirVue({ portee: 'tout', filtre: 'tout', dossier: null }))}>
                    <Icone nom="precedent" taille={16} trait={2} />
                    <span>{fil.length > 0 ? titreToile(fil[fil.length - 1]!) : t('biblio.titre')}</span>
                  </button>
                  {!sousDossier(dossier) && (
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
        {bouton('tout')}
        {bouton('recents')}
        {bouton('favoris')}
        {partages && bouton('partages')}
        <p className="biblio-groupe">{t('biblio.dossiers')}</p>
        {espace ? (
          <button
            type="button"
            className="biblio-rubrique"
            data-depot={espace.racine}
            data-survol-depot={survolDepot === espace.racine || undefined}
            aria-current={!cherche && dossier === espace.racine ? 'page' : undefined}
            onClick={() => parcourir(espace.racine)}
          >
            <span className="biblio-maison" aria-hidden>
              <Icone nom="maison" taille={12} trait={2.4} />
            </span>
            <span>{titreAccueil || t('biblio.accueil')}</span>
          </button>
        ) : (
          <a className="biblio-rubrique" href={accueil} onClick={(e) => surLien(e, accueil)}>
            <span className="biblio-maison" aria-hidden>
              <Icone nom="maison" taille={12} trait={2.4} />
            </span>
            <span>{t('biblio.accueil')}</span>
          </a>
        )}
        {espace && arbre.length > 0 && (
          <ArbreDossiers
            noeuds={arbre}
            courant={cherche ? null : dossier}
            deplies={deplies}
            survol={survolDepot}
            parcourir={parcourir}
            basculer={(id) => setDeplies((d) => (d.has(id) ? new Set([...d].filter((x) => x !== id)) : new Set([...d, id])))}
          />
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
              niveaux={fil.map((id) => ({ id, titre: titreToile(id), genre: genreDuNiveau(id) }))}
              ici={{ genre: genreDuNiveau(dossier), titre: titreToile(dossier), contenu: <h1>{titreToile(dossier)}</h1> }}
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
          {dossier && !sousDossier(dossier) && !cherche && !(modeChoix || choisies.length > 1) && (
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
          <Ilot className="biblio-tri" etiquette={t('biblio.tri')}>
            {(['date', 'dossier'] as const).map((x) => (
              <button key={x} type="button" className="biblio-tri-choix" aria-pressed={tri === x} aria-label={t(`biblio.tri.${x}`)} title={t(`biblio.tri.${x}`)} onClick={() => trier(x)}>
                <Icone nom={x === 'date' ? 'horloge' : 'dossier'} taille={16} />
                {/* Dans une fenêtre moyenne (un iPad en portrait), le bouton garde son icône : son nom reste à aria-label. */}
                <span className="biblio-tri-libelle">{t(`biblio.tri.${x}`)}</span>
              </button>
            ))}
          </Ilot>
          <Ilot className="biblio-tri biblio-affichage" etiquette={t('biblio.affichage')}>
            {(['grille', 'liste'] as const).map((a) => (
              <button key={a} type="button" className="biblio-tri-choix" aria-pressed={affichage === a} aria-label={t(`biblio.affichage.${a}`)} title={t(`biblio.affichage.${a}`)} onClick={() => afficher(a)}>
                <Icone nom={a === 'grille' ? 'vueGrille' : 'vueListe'} taille={16} />
              </button>
            ))}
          </Ilot>
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
        {toutes && toutes.length > 0 && (
          <div className="biblio-puces" role="group" aria-label={t('biblio.puces')}>
            {(['tout', ...TYPES] as const).map((f) => (
              <button key={f} type="button" className="biblio-puce" data-puce={f} aria-pressed={filtre === f} data-vide={(f !== 'tout' && parGenre[f] === 0) || undefined} onClick={() => choisirVue({ filtre: f })}>
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

/** Le menu du bouton « Nouveau » : une toile, une carte mentale ou un document, posés sur l'accueil. */
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
 * Une tuile : sa vignette, son titre, et où elle est. Un clic la choisit, un double-clic l'ouvre ; une toile prend ce
 * qu'on lâche sur elle.
 */
function Tuile({
  entree: e,
  menu,
  coche,
  parDossier,
  choisie,
  focalisable,
  glissee,
  survolee,
  arrivee,
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
  parDossier: boolean
  choisie: boolean
  focalisable: boolean
  glissee: boolean
  survolee: boolean
  /** Vient d'arriver (un import) : son anneau bat une fois. */
  arrivee?: boolean
  /** Ce qu'on dit sous son titre, à la place de la toile qui la porte ou de son genre (au téléphone, quand on l'a ouverte). */
  detail?: string
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
      data-glissee={glissee || undefined}
      aria-label={titreDe(e)}
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
      ) : (
        <span className="biblio-tuile-titre">{titreDe(e)}</span>
      )}
      <span className="biblio-tuile-ou">
        <Icone nom={iconeDe(e)} taille={13} />
        <span>{detail ?? (e.ou && !parDossier ? t('biblio.dans', { toile: e.ou }) : genreDe(e))}</span>
      </span>
    </li>
  )
}

/**
 * L'arbre des dossiers de la colonne, sous l'accueil : chaque dossier se parcourt d'un toucher, prend ce qu'on lui
 * lâche, et se déplie s'il en contient d'autres. Les parents du dossier qu'on parcourt sont dépliés.
 */
function ArbreDossiers({
  noeuds,
  courant,
  deplies,
  survol,
  parcourir,
  basculer,
  profondeur = 1,
}: {
  noeuds: NoeudDossier[]
  courant: string | null
  deplies: ReadonlySet<string>
  survol: string | null
  parcourir(id: string): void
  basculer(id: string): void
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
              >
                <Icone nom="dossier" taille={18} />
                <span>{n.titre || t('commun.sansTitre')}</span>
              </button>
            </div>
            {ouvert && n.enfants.length > 0 && <ArbreDossiers noeuds={n.enfants} courant={courant} deplies={deplies} survol={survol} parcourir={parcourir} basculer={basculer} profondeur={profondeur + 1} />}
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
