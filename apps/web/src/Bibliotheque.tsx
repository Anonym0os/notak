import {
  BandeauAvis,
  BoutonIlot,
  type EntreeMenu,
  type FenetresNotak,
  type GenreNeuf,
  Icone,
  Ilot,
  MenuContextuel,
  type NomIcone,
  annoncer,
  creerDans,
  quandPretes,
} from '@notak/tableau'
import {
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
import { type EntreeBibliotheque, definirFavori as definirFavoriApi, lireBibliotheque, rangerToile as rangerToileApi } from './api'
import {
  type EspaceRangement,
  type Outils,
  type Resultat,
  deplacerEntrees,
  dupliquerEntrees,
  favoris,
  jeterEntrees,
  rangerDansUneNeuve,
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
import { Vignette } from './bibliotheque/Vignettes'
import { allerA, surLien } from './chemin'
import { t, tn } from './langue'

/**
 * La bibliothèque, page d'accueil de l'édition serveur : tout ce que le compte peut ouvrir, en vignettes, comme chez
 * Xmind. Une colonne de rubriques à gauche, la barre de l'application en haut, et des tuiles rangées par date
 * d'ouverture ou par dossier (la toile qui les porte). Les toiles restent la façon de ranger ; ici, on parcourt.
 */

export const RUBRIQUES = ['recents', 'favoris', 'partages', 'toiles', 'cartes', 'documents'] as const
export type Rubrique = (typeof RUBRIQUES)[number]
export type Tri = 'date' | 'dossier'

const ICONE_RUBRIQUE: Record<Rubrique, NomIcone> = {
  recents: 'horloge',
  favoris: 'etoile',
  partages: 'equipe',
  toiles: 'tableau',
  cartes: 'carteMentale',
  documents: 'document',
}
const ICONE_GENRE: Record<EntreeBibliotheque['genre'], NomIcone> = { toile: 'tableau', arbre: 'carteMentale', document: 'document' }
/** Ce que crée la première tuile de chaque rubrique ; rien dans les favoris et les partages. */
const NEUF_DE: Partial<Record<Rubrique, GenreNeuf>> = { recents: 'toile', toiles: 'toile', cartes: 'arbre', documents: 'document' }

/** Les récents s'arrêtent là : au-delà, on passe par les rubriques d'un genre. */
const RECENTS_MAX = 60
const JOUR = 86_400_000

const parTitre = (a: EntreeBibliotheque, b: EntreeBibliotheque) =>
  (a.titre || '￿').localeCompare(b.titre || '￿', undefined, { sensitivity: 'base', numeric: true })
const parOuverture = (a: EntreeBibliotheque, b: EntreeBibliotheque) => (b.vu ?? -1) - (a.vu ?? -1) || parTitre(a, b)

/** Ce que montre chaque rubrique, la plus récemment ouverte d'abord, puis par titre. */
export function entreesDe(rubrique: Rubrique, toutes: readonly EntreeBibliotheque[]): EntreeBibliotheque[] {
  const garder = (f: (e: EntreeBibliotheque) => boolean) => toutes.filter(f).sort(parOuverture)
  switch (rubrique) {
    case 'recents':
      return garder((e) => e.vu !== null).slice(0, RECENTS_MAX)
    case 'favoris':
      return garder((e) => e.favori)
    case 'partages':
      return garder((e) => e.partage)
    case 'toiles':
      return garder((e) => e.genre === 'toile')
    case 'cartes':
      return garder((e) => e.genre === 'arbre')
    case 'documents':
      return garder((e) => e.genre === 'document')
  }
}

/** Une suite de tuiles sous un titre ; `dans` : la toile que la section regroupe (tri par dossier). */
export interface Section {
  cle: string
  titre: string
  dans?: string | null
  entrees: EntreeBibliotheque[]
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

/** Ce qui répond à une recherche : chaque mot dans le titre ou dans le nom de la toile qui le porte. */
export function filtrer(entrees: readonly EntreeBibliotheque[], requete: string): EntreeBibliotheque[] {
  const mots = sansAccents(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return [...entrees]
  return entrees.filter((e) => {
    const texte = sansAccents(`${e.titre} ${e.ou ?? ''}`)
    return mots.every((m) => texte.includes(m))
  })
}

/** L'adresse qui ouvre une entrée : la toile, ou l'élément en grand sur sa toile. */
export const adresseDe = (e: Pick<EntreeBibliotheque, 'tableau' | 'element'>) =>
  e.element === null ? `/t/${encodeURIComponent(e.tableau)}` : `/t/${encodeURIComponent(e.tableau)}/e/${encodeURIComponent(e.element)}`

const rubriqueDeLAdresse = (): Rubrique | null => {
  const v = new URLSearchParams(location.search).get('vue')
  return (RUBRIQUES as readonly string[]).includes(v ?? '') ? (v as Rubrique) : null
}

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
  | { type: 'confirmer'; titre: string; texte: string; repondre(oui: boolean): void }

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

/** Le pointeur à moins de tant de pixels du haut ou du bas de la page la fait défiler, pendant un cadre ou un glisser. */
const BORD_DEFILEMENT = 48

export function PageBibliotheque({
  charger = lireBibliotheque,
  espace,
  fenetres,
  compte,
  creer = async (genre, dans) => {
    const ou = dans ?? espace!.racine
    await quandPretes(espace!, [ou])
    return creerDans(espace!, ou, genre)
  },
  rangerToile = rangerToileApi,
  definirFavori = definirFavoriApi,
  partage,
}: {
  charger?: () => Promise<EntreeBibliotheque[]>
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
}) {
  const [serveur, setServeur] = useState<EntreeBibliotheque[] | null>(null)
  const [correctifs, setCorrectifs] = useState<{ n: number; correctif: Correctif }[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [choisie, setChoisie] = useState<Rubrique | null>(rubriqueDeLAdresse)
  const [tri, setTri] = useState<Tri>(lireTri)
  const [requete, setRequete] = useState('')
  const [menuNeuf, setMenuNeuf] = useState(false)
  const [sel, setSel] = useState<Selection>(RIEN)
  const [courante, setCourante] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const [renommage, setRenommage] = useState<Renommage | null>(null)
  const [glisse, setGlisse] = useState<Glisse | null>(null)
  const [cadre, setCadre] = useState<Boite | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const nav = useRef<HTMLElement>(null)
  const corps = useRef<HTMLElement>(null)
  const minuteurs = useRef(new Set<ReturnType<typeof setTimeout>>())
  const titreAccueil = useSyncExternalStore(espace?.ecouter ?? (() => () => {}), () => (espace ? espace.tableau(espace.racine)?.titre : '') ?? '')

  const lire = useCallback(() => {
    setErreur(null)
    charger().then(setServeur, (x: Error) => setErreur(x.message || t('commun.echec')))
  }, [charger])
  useEffect(lire, [lire])
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
    const relire = () => void charger().then(setServeur, () => {})
    plusTard(relire, 3500)
    plusTard(() => {
      setCorrectifs((l) => l.filter((x) => !ns.includes(x)))
      relire()
    }, DUREE_CORRECTIF)
  }
  const toutes = useMemo(() => (serveur ? avecCorrectifs(serveur, correctifs) : null), [serveur, correctifs])

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

  const parRubrique = useMemo(
    () => (toutes ? (Object.fromEntries(RUBRIQUES.map((r) => [r, entreesDe(r, toutes)])) as Record<Rubrique, EntreeBibliotheque[]>) : null),
    [toutes],
  )
  // On commence par les récents ; tant qu'on n'a rien ouvert, par les toiles.
  const rubrique: Rubrique = choisie ?? (parRubrique && parRubrique.recents.length === 0 ? 'toiles' : 'recents')
  const cherche = requete.trim() !== ''
  const visibles = toutes && parRubrique ? (cherche ? filtrer(toutes, requete).sort(parOuverture) : parRubrique[rubrique]) : []
  const sections = tri === 'dossier' ? sectionsParDossier(visibles) : sectionsParDate(visibles)
  const neuf = cherche ? undefined : NEUF_DE[rubrique]
  // Les tuiles dans l'ordre où on les lit, de section en section : celui de ⇧ et des flèches.
  const ordre = useMemo(() => sections.flatMap((s) => s.entrees.map(cleDe)), [sections])
  const parCle = useMemo(() => new Map((toutes ?? []).map((e) => [cleDe(e), e])), [toutes])
  const entreesDes = (cles: Iterable<string>) => [...cles].flatMap((c) => parCle.get(c) ?? [])
  const choisies = ordre.filter((c) => sel.choisies.has(c))
  const cleOrdre = ordre.join('|')
  useEffect(() => setSel((s) => garder(s, cleOrdre ? cleOrdre.split('|') : [])), [cleOrdre])

  const outils: Outils | null = espace ? { espace, rangerToile, definirFavori } : null
  const titreToile = (id: string) => (espace && id === espace.racine ? titreAccueil || t('biblio.accueil') : parCle.get(`${id}/`)?.titre || t('commun.sansTitre'))

  const choisir = (r: Rubrique) => {
    setChoisie(r)
    setRequete('')
    history.replaceState(null, '', r === 'recents' ? '/' : `/?vue=${r}`)
  }
  const trier = (x: Tri) => {
    setTri(x)
    ecrireTri(x)
  }
  const [creation, setCreation] = useState(false)
  const creerPuisOuvrir = async (genre: GenreNeuf, dans?: string) => {
    setMenuNeuf(false)
    if (creation) return
    setCreation(true)
    try {
      allerA(adresseDe(await creer(genre, dans)))
    } finally {
      setCreation(false)
    }
  }
  const ouvrir = (e: EntreeBibliotheque) => allerA(adresseDe(e))

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
      annoncer({ texte: r.texte, ...(r.annuler ? { action: { libelle: t('biblio.annuler'), faire: () => void defaire(r) } } : {}) })
      return r
    } catch (x) {
      annoncer({ texte: (x as Error).message || t('commun.echec') })
      return null
    }
  }
  const confirmerOuverture = (titre: string, vers: string) => (nouveaux: number) =>
    new Promise<boolean>((repondre) =>
      setFenetre({
        type: 'confirmer',
        titre: t('biblio.confirmer.titre', { titre }),
        texte: tn('biblio.confirmer.texte', nouveaux, { toile: titreToile(vers) }),
        repondre: (oui) => {
          setFenetre(null)
          repondre(oui)
        },
      }),
    )
  const nomDe = (es: EntreeBibliotheque[]) => (es.length === 1 ? es[0]!.titre || t('commun.sansTitre') : tn('biblio.deplacer.titre', es.length).replace(/^\S+\s/, ''))
  const deplacerVers = (es: EntreeBibliotheque[], vers: string) => {
    if (!outils || es.length === 0) return
    void executer(deplacerEntrees(outils, es, { id: vers, titre: titreToile(vers) }, confirmerOuverture(nomDe(es), vers)))
  }
  const jeterCes = (es: EntreeBibliotheque[]) => outils && es.length > 0 && void executer(jeterEntrees(outils, es, toutes ?? []))
  const dupliquerCes = (es: EntreeBibliotheque[]) => outils && es.length > 0 && void executer(dupliquerEntrees(outils, es))
  const rangerDansNeuveCes = (es: EntreeBibliotheque[]) => {
    if (!outils || es.length === 0) return
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
  const renommerCe = async (cible: Pick<EntreeBibliotheque, 'tableau' | 'element' | 'titre'>, titre: string) => {
    setRenommage(null)
    if (!outils || !titre.trim()) return
    try {
      poser(await renommerEntree(outils, cible, titre, toutes ?? []))
    } catch (x) {
      annoncer({ texte: (x as Error).message || t('commun.echec') })
    }
  }
  const favoriCes = async (es: EntreeBibliotheque[], oui: boolean) => {
    try {
      const cs = await favoris({ espace: espace!, rangerToile, definirFavori }, es, oui)
      // Le serveur a déjà suivi : on corrige la liste qu'on a, sans attendre.
      setServeur((l) => l && cs.reduce((x, c) => corriger(x, c), l))
    } catch (x) {
      annoncer({ texte: (x as Error).message || t('commun.echec') })
    }
  }
  const copierLiens = (es: EntreeBibliotheque[]) => {
    void navigator.clipboard?.writeText(es.map((e) => `${location.origin}${adresseDe(e)}`).join('\n')).then(
      () => annoncer({ texte: t(es.length > 1 ? 'biblio.annonce.liens' : 'biblio.annonce.lien') }),
      () => {},
    )
  }

  // ---- Le menu du clic droit ----

  const menuDesTuiles = (cles: string[]): EntreeMenu[] => {
    const es = entreesDes(cles)
    const une = es.length === 1 ? es[0]! : null
    const toiles = es.filter((e) => e.element === null)
    const tousFavoris = toiles.length > 0 && toiles.every((e) => e.favori)
    const porteuse = une && porteuseDe(une)
    const ecrit = outils !== null
    const l: EntreeMenu[] = []
    if (une) l.push({ libelle: t('biblio.menu.ouvrir'), icone: 'ouvrir', raccourci: '↩', faire: () => ouvrir(une) })
    if (porteuse) l.push({ libelle: t('biblio.menu.afficher'), icone: 'tableau', faire: () => allerA(`/t/${encodeURIComponent(porteuse)}`) })
    l.push(null)
    if (une && ecrit) l.push({ libelle: t('biblio.menu.renommer'), icone: 'renommer', raccourci: 'F2', faire: () => setRenommage({ cle: cleDe(une) }) })
    if (ecrit) l.push({ libelle: t('biblio.menu.dupliquer'), icone: 'menuDupliquer', raccourci: '⌘D', faire: () => dupliquerCes(es) })
    if (toiles.length > 0)
      l.push({
        libelle: t(tousFavoris ? 'biblio.menu.plusFavori' : 'biblio.menu.favori'),
        icone: tousFavoris ? 'favoriPlein' : 'favori',
        faire: () => void favoriCes(toiles, !tousFavoris),
      })
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
    (['toile', 'arbre', 'document'] as const).map((g) => ({ libelle: t(`biblio.genre.${g}`), icone: ICONE_GENRE[g], faire: () => void creerPuisOuvrir(g, dans) }))
  const menuDuFond = (): EntreeMenu[] => [
    ...(espace ? [{ libelle: t('biblio.menu.nouveau'), icone: 'ajouter' as const, sous: sousMenuCreer(), faire: () => {} }, null] : []),
    { libelle: t('biblio.tri.date'), icone: 'horloge', coche: tri === 'date', faire: () => trier('date') },
    { libelle: t('biblio.tri.dossier'), icone: 'dossier', coche: tri === 'dossier', faire: () => trier('dossier') },
    null,
    { libelle: t('biblio.menu.toutChoisir'), icone: 'menuSelectionner', raccourci: '⌘A', desactive: ordre.length === 0, faire: () => setSel(toutChoisir(ordre)) },
  ]
  const menuDuDossier = (dans: string): EntreeMenu[] => [
    { libelle: t('biblio.menu.ouvrirToile'), icone: 'ouvrir', faire: () => allerA(`/t/${encodeURIComponent(dans)}`) },
    ...(espace
      ? [
          { libelle: t('biblio.menu.creerIci'), icone: 'ajouter' as const, sous: sousMenuCreer(dans), faire: () => {} },
          null,
          { libelle: t('biblio.menu.renommerToile'), icone: 'renommer' as const, faire: () => setRenommage({ dossier: dans }) },
        ]
      : []),
  ]
  const entreesDuMenu = (m: Menu) => (m.type === 'tuiles' ? menuDesTuiles(m.cles) : m.type === 'fond' ? menuDuFond() : menuDuDossier(m.dans))

  const surMenu = (ev: ReactMouseEvent) => {
    const el = ev.target as HTMLElement
    if (el.closest('input')) return
    ev.preventDefault()
    const tuile = el.closest<HTMLElement>('[data-cle]')
    const dossier = el.closest<HTMLElement>('[data-dossier]')
    if (tuile) {
      const cle = tuile.dataset.cle!
      const cles = sel.choisies.has(cle) ? choisies : [cle]
      if (!sel.choisies.has(cle)) setSel(cliquer(sel, cle, ordre))
      setCourante(cle)
      setMenu({ x: ev.clientX, y: ev.clientY, type: 'tuiles', cles })
    } else if (dossier) setMenu({ x: ev.clientX, y: ev.clientY, type: 'dossier', dans: dossier.dataset.dossier!, titre: dossier.textContent ?? '' })
    else setMenu({ x: ev.clientX, y: ev.clientY, type: 'fond' })
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

  /** Le dernier appui venait-il d'un doigt : le clic qui suit n'en dit rien partout. */
  const auDoigt = useRef(false)
  const surAppui = (ev: ReactPointerEvent) => {
    auDoigt.current = ev.pointerType === 'touch'
    const el = ev.target as HTMLElement
    if (ev.button !== 0 || el.closest('input')) return
    const tuile = el.closest<HTMLElement>('[data-cle]')
    // Au doigt, on fait défiler et on touche pour ouvrir : ni cadre ni glisser.
    if (ev.pointerType === 'touch') return
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
    const cle = (ev.target as HTMLElement).closest<HTMLElement>('[data-cle]')?.dataset.cle
    const e = cle && !(ev.target as HTMLElement).closest('input') ? parCle.get(cle) : undefined
    if (e) ouvrir(e)
  }
  // Au doigt, une tuile touchée s'ouvre, comme avant.
  const surClic = (ev: ReactMouseEvent) => {
    if (!auDoigt.current) return
    const cle = (ev.target as HTMLElement).closest<HTMLElement>('[data-cle]')?.dataset.cle
    const e = cle ? parCle.get(cle) : undefined
    if (e) ouvrir(e)
  }

  // ---- Le clavier ----

  const aller = (cle: string | null, etendre: boolean) => {
    if (!cle) return
    setSel((s) => (etendre ? cliquer(s, cle, ordre, { suite: true }) : cliquer(RIEN, cle, ordre)))
    setCourante(cle)
    const el = corps.current?.querySelector<HTMLElement>(`[data-cle="${CSS.escape(cle)}"]`)
    el?.focus({ preventScroll: true })
    el?.scrollIntoView?.({ block: 'nearest' })
  }
  /** Le renommage fini, le clavier revient à la tuile. */
  const rendreFocus = (cle: string) =>
    requestAnimationFrame(() => corps.current?.querySelector<HTMLElement>(`[data-cle="${CSS.escape(cle)}"]`)?.focus({ preventScroll: true }))
  const touche = useRef<(e: globalThis.KeyboardEvent) => void>(() => {})
  touche.current = (e) => {
    const cible = e.target as HTMLElement
    if (e.defaultPrevented || menu || fenetre || renommage || glisse) return
    if (cible.closest?.('input, textarea, select, [contenteditable="true"], dialog, .notak-par-dessus')) return
    const cmd = e.metaKey || e.ctrlKey
    const es = entreesDes(choisies)
    const une = es.length === 1 ? es[0]! : null
    const fleches: Record<string, Direction> = { ArrowLeft: 'gauche', ArrowRight: 'droite', ArrowUp: 'haut', ArrowDown: 'bas' }
    // Les flèches de la colonne restent à la colonne.
    if (fleches[e.key] && !cmd && !nav.current?.contains(cible)) {
      e.preventDefault()
      aller(voisine(boitesTuiles(), ordre, courante ?? sel.ancre, fleches[e.key]!), e.shiftKey)
    } else if (cmd && !e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSel(toutChoisir(ordre))
    } else if (cmd && !e.shiftKey && e.key.toLowerCase() === 'z' && annulable.current) {
      e.preventDefault()
      void defaire(annulable.current)
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
    } else if (e.key === 'Escape' && sel.choisies.size > 0) {
      setSel(RIEN)
    } else if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && choisies.length > 0) {
      e.preventDefault()
      const b = corps.current?.querySelector<HTMLElement>(`[data-cle="${CSS.escape(courante ?? choisies[0]!)}"]`)?.getBoundingClientRect()
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

  const bouton = (r: Rubrique) => (
    <button key={r} type="button" className="biblio-rubrique" data-rubrique={r} aria-current={!cherche && rubrique === r ? 'page' : undefined} onClick={() => choisir(r)}>
      <Icone nom={ICONE_RUBRIQUE[r]} taille={18} />
      <span>{t(`biblio.rubrique.${r}`)}</span>
      {parRubrique && r !== 'recents' && parRubrique[r].length > 0 && <small>{parRubrique[r].length}</small>}
    </button>
  )
  const accueil = espace ? `/t/${encodeURIComponent(espace.racine)}` : '/'
  const glissees = new Set(glisse?.cles)
  const premiereFocalisable = courante && ordre.includes(courante) ? courante : (choisies[0] ?? ordre[0])

  return (
    <div className="biblio">
      <nav className="biblio-colonne" aria-label={t('biblio.titre')} ref={nav} onKeyDown={surToucheColonne} data-tauri-drag-region="deep">
        <div className="biblio-nouveau">
          <button type="button" className="biblio-nouveau-bouton" aria-expanded={menuNeuf} aria-haspopup="menu" disabled={creation} onClick={() => setMenuNeuf((o) => !o)}>
            <Icone nom="ajouter" taille={18} trait={2} />
            {t('biblio.nouveau')}
            <Icone nom="chevronBas" taille={14} trait={2} />
          </button>
          {menuNeuf && <MenuNeuf creer={(g) => void creerPuisOuvrir(g)} fermer={() => setMenuNeuf(false)} />}
        </div>
        {bouton('recents')}
        {bouton('favoris')}
        {bouton('partages')}
        <p className="biblio-groupe">{t('biblio.mesContenus')}</p>
        {bouton('toiles')}
        {bouton('cartes')}
        {bouton('documents')}
        <p className="biblio-groupe">{t('biblio.maToile')}</p>
        <a
          className="biblio-rubrique"
          href={accueil}
          onClick={(e) => surLien(e, accueil)}
          data-depot={espace?.racine}
          data-survol-depot={(espace && glisse?.cible === espace.racine) || undefined}
        >
          <span className="biblio-maison" aria-hidden>
            <Icone nom="maison" taille={12} trait={2.4} />
          </span>
          <span>{titreAccueil || t('biblio.accueil')}</span>
        </a>
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
        {choisies.length > 1 ? (
          <Ilot className="biblio-barre-choix" etiquette={tn('biblio.selection', choisies.length)}>
            <span className="biblio-barre-compte">{tn('biblio.selection', choisies.length)}</span>
            {outils && <BoutonIlot icone="dossier" libelle={t('biblio.menu.deplacer')} onClick={() => setFenetre({ type: 'deplacer', cles: choisies })} />}
            {outils && <BoutonIlot icone="corbeille" libelle={t('biblio.menu.corbeille')} raccourci="⌫" onClick={() => jeterCes(entreesDes(choisies))} />}
            <BoutonIlot icone="fermer" libelle={t('biblio.deselectionner')} raccourci="Échap" onClick={() => setSel(RIEN)} />
          </Ilot>
        ) : (
          <h1>{cherche ? t('biblio.resultats') : t(`biblio.rubrique.${rubrique}`)}</h1>
        )}
        <div className="biblio-tete-droite">
          <Ilot className="biblio-tri" etiquette={t('biblio.tri')}>
            {(['date', 'dossier'] as const).map((x) => (
              <button key={x} type="button" className="biblio-tri-choix" aria-pressed={tri === x} onClick={() => trier(x)}>
                <Icone nom={x === 'date' ? 'horloge' : 'dossier'} taille={16} />
                {t(`biblio.tri.${x}`)}
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
      </header>

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
        ) : visibles.length === 0 && !neuf ? (
          <div className="biblio-vide">
            <Icone nom={cherche ? 'recherche' : ICONE_RUBRIQUE[rubrique]} taille={28} trait={1.5} />
            <p>{cherche ? t('biblio.aucunResultat', { requete: requete.trim() }) : t(`biblio.vide.${rubrique}`)}</p>
            {!cherche && <small>{t(`biblio.vide.${rubrique}.aide`)}</small>}
          </div>
        ) : (
          <>
            {(sections.length > 0 ? sections : [{ cle: 'vide', titre: '', entrees: [] } as Section]).map((s, i) => (
              <section key={s.cle} className="biblio-section" aria-label={s.titre || undefined}>
                {s.titre && (
                  <h2
                    data-dossier={s.dans || undefined}
                    data-depot={s.dans || undefined}
                    data-survol-depot={(s.dans && glisse?.cible === s.dans) || undefined}
                  >
                    {s.dans !== undefined && <Icone nom={s.dans ? 'tableau' : 'equipe'} taille={15} />}
                    {s.dans && renommage && 'dossier' in renommage && renommage.dossier === s.dans ? (
                      <ChampRenommer
                        valeur={s.titre}
                        valider={(titre) => void renommerCe({ tableau: s.dans!, element: null, titre: s.titre }, titre)}
                        annuler={() => setRenommage(null)}
                      />
                    ) : s.dans ? (
                      <a href={`/t/${encodeURIComponent(s.dans)}`} onClick={(e) => surLien(e, `/t/${encodeURIComponent(s.dans!)}`)}>
                        {s.titre}
                      </a>
                    ) : (
                      s.titre
                    )}
                  </h2>
                )}
                <ul className="biblio-grille" role="listbox" aria-multiselectable aria-label={s.titre || t(`biblio.rubrique.${rubrique}`)}>
                  {i === 0 && neuf && (
                    <li role="presentation">
                      <button type="button" className="biblio-tuile biblio-tuile-neuve" disabled={creation} onClick={() => void creerPuisOuvrir(neuf)}>
                        <span className="biblio-vignette" aria-hidden>
                          <Icone nom="ajouter" taille={36} trait={1.2} />
                        </span>
                        <span className="biblio-tuile-titre">{t(`biblio.neuf.${neuf}`)}</span>
                        <span className="biblio-tuile-ou">{t('biblio.neuf.aide')}</span>
                      </button>
                    </li>
                  )}
                  {s.entrees.map((e) => {
                    const cle = cleDe(e)
                    return (
                      <Tuile
                        key={cle}
                        entree={e}
                        parDossier={tri === 'dossier'}
                        choisie={sel.choisies.has(cle)}
                        focalisable={cle === premiereFocalisable}
                        glissee={glissees.has(cle)}
                        survolee={e.element === null && glisse?.cible === e.tableau}
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
            {visibles.length === 0 && (
              <div className="biblio-vide biblio-vide-bas">
                <p>{t(`biblio.vide.${rubrique}`)}</p>
                <small>{t(`biblio.vide.${rubrique}.aide`)}</small>
              </div>
            )}
          </>
        )}
        {cadre && <div className="biblio-cadre" style={{ left: cadre.gauche, top: cadre.haut, width: cadre.droite - cadre.gauche, height: cadre.bas - cadre.haut }} />}
      </main>

      {glisse && <Fantome entrees={entreesDes(glisse.cles)} x={glisse.x} y={glisse.y} />}
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
      {fenetre?.type === 'confirmer' && <Confirmation titre={fenetre.titre} texte={fenetre.texte} oui={t('biblio.confirmer.oui')} repondre={fenetre.repondre} />}
      {fenetre?.type === 'partage' && partage?.(fenetre.tableau, () => setFenetre(null))}
      <BandeauAvis />
    </div>
  )
}

/** Le menu du bouton « Nouveau » : une toile, une carte mentale ou un document, posés sur l'accueil. */
function MenuNeuf({ creer, fermer }: { creer(genre: GenreNeuf): void; fermer(): void }) {
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
      {(['toile', 'arbre', 'document'] as const).map((g) => (
        <button key={g} type="button" role="menuitem" onClick={() => creer(g)}>
          <Icone nom={ICONE_GENRE[g]} taille={18} />
          <span>
            {t(`biblio.genre.${g}`)}
            <small>{t(`biblio.neuf.${g}.aide`)}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Une tuile : sa vignette, son titre, et où elle est. Un clic la choisit, un double-clic l'ouvre ; une toile prend ce
 * qu'on lâche sur elle.
 */
function Tuile({
  entree: e,
  parDossier,
  choisie,
  focalisable,
  glissee,
  survolee,
  renommer,
  valider,
  annuler,
}: {
  entree: EntreeBibliotheque
  parDossier: boolean
  choisie: boolean
  focalisable: boolean
  glissee: boolean
  survolee: boolean
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
      data-glissee={glissee || undefined}
      aria-label={e.titre || t('commun.sansTitre')}
    >
      <Vignette resume={e.resume} />
      {renommer ? (
        <ChampRenommer valeur={e.titre} valider={valider} annuler={annuler} />
      ) : (
        <span className="biblio-tuile-titre">{e.titre || t('commun.sansTitre')}</span>
      )}
      <span className="biblio-tuile-ou">
        <Icone nom={ICONE_GENRE[e.genre]} taille={13} />
        <span>{e.ou && !parDossier ? t('biblio.dans', { toile: e.ou }) : t(`biblio.genre.${e.genre}`)}</span>
      </span>
    </li>
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
      <Vignette resume={e.resume} />
      <span className="biblio-fantome-titre">{e.titre || t('commun.sansTitre')}</span>
      {entrees.length > 1 && <span className="biblio-fantome-nombre">{entrees.length}</span>}
    </div>
  )
}
