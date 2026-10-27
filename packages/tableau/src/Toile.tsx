import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toileSuspendue } from './elements/dessin/mode'
import { PanneauBanque } from './elements/image/Banque'
import { attacherFil, pointDePose } from './elements/commentaire/attacher'
import { avecLegende } from './elements/image/geometrie'
import { ouvrirImage, useImageOuverte } from './elements/image/visionneuse'
import { ouvrirFenetreFichier, useFichierOuvert } from './elements/fichier/ouverture'
import { PanneauEnvoi } from './elements/fichier/PanneauEnvoi'
import { BarreOutils, BarreSelection, type OutilDeBarre, outilsDeBarre } from './Barres'
import { enFeuille } from './communs/Feuille'
import { auDoigt } from './doigt'
import { BarreEdition, ContexteBarreEdition } from './barreEdition'
import { Cadre, ContexteRangement, type Empreinte, type Rangement } from './Cadre'
import * as cam from './coeur/camera'
import { brancherPilote } from './pilotage'
import { montrerDemande, prendreDemande } from './elements/tableau/montrer'
import { type DetailImport, EVENEMENT_IMPORT, operationsDImport } from './recevoirImport'
import { type Point, type Rect, centre, chevauche, depuisCoins, englobant, point, soustraire } from './coeur/geometrie'
import { type Hauteur, hauteurTiree, memeHauteur } from './coeur/hauteur'
import { CANEVAS, type Fond, NOMS_CANEVAS, estLibre, estNomme, estSombre, fondParDefaut, fondRange, pointsAllumes } from './coeur/fond'
import { creerLimiteur } from './coeur/limiteur'
import { type Magasin, enLectureSeule, sansCorbeille } from './coeur/magasin'
import { aFiltrer, filtrerMagasin, peutCommenter } from './coeur/droitsElements'
import { largeurDoubleClic, largeurMinDe, largeurTiree } from './coeur/largeur'
import { type Cible, type Deplace, cleEntre, clesEntre, comparerOrdre, indexInsertion, pasDeDepot } from './coeur/ordre'
import { cliquer, lasso } from './coeur/selection'
import { type Paquet, TYPE_PAQUET, decalageDeCollage, deballer, empaqueter, texteDuPaquet } from './coeur/pressePapiers'
import { type Entree, MenuContextuel } from './communs'
import type { NomIcone } from './icones'
import { FenetreRaccourcis, GLISSER_NON_TRIE, PanneauCorbeille, PanneauNonTries, Recherche } from './Menus'
import { chercher } from './coeur/recherche'
import { ouvrirPourRecherche } from './elements/colonne/recherche'
import { poussees } from './coeur/collisions'
import { accroches } from './coeur/lignes'
import { VOL_REPOS, type Vol, inclinaisonMax, transformation } from './coeur/vol'
import { Envol, dessinerSur, oublierVol } from './envol'
import { BandeauAvis, annoncer } from './avis'
import {
  type Contenu,
  type Element,
  type Extremite,
  type Id,
  type Ligne,
  type Operation,
  type Tableau,
  type TypeContenu,
  HAUTEUR_NOTE_MIN,
  aLaCorbeille,
  nonTriesDe,
  aimanter,
  auDernierPlan,
  auPremierPlan,
  dUnCran,
  inverse,
  nouvelId,
  nouvelleNote,
  placeDe,
} from './coeur/tableau'
import './elements'
import { definition, marquerDepot, tousLesCollages, tousLesRaccourcis, tousLesRecepteurs, tousLesTypes, toutesLesEntreesMenu } from './elements/registre'
import { demanderRenommage } from './elements/tableau/renommage'
import { figerDepot, glisseUneImage, libererDepot, survolerImage } from './elements/image/survolDepot'
import { GardeElement } from './garde'
import type { ContexteToile, Presence, Services } from './elements/types'
import { t, tn } from './langue'
import { PastilleZoom } from './PastilleZoom'
import { Minicarte } from './Minicarte'
import { PastilleAutre } from './PastilleAutre'
import { PointActivite } from './PointActivite'
import { PointeursBord } from './PointeursBord'
import type { CibleBord } from './coeur/pointeurs'
import { lignesDeTrace } from './trace'
import { personneAJour } from './personne'
import { usePublierVue } from './vueZoom'

type Geste =
  | {
      type: 'attraper'
      dernier: Point
      /** Au doigt : ce que le doigt a touché en premier (un élément, ou le vide), et s'il a bougé depuis. Relâché sans
          bouger, c'est un toucher : il choisit l'élément, ou vide le choix. */
      toucher?: { id: Id | null; ecran: Point; bouge: boolean }
    }
  | { type: 'lasso'; depart: Point; avant: ReadonlySet<Id>; inverser: boolean }
  | {
      type: 'glisser'
      depart: Point
      /** Le départ du pointeur à l'écran : un glisser ne démarre qu'après quelques pixels. */
      ecran: Point
      demarre: boolean
      /** Chaque élément glissé : sa place d'origine, et sa position sur le tableau au départ. */
      origines: Map<Id, { place: Deplace['de']; pos: Point }>
      axe: 'h' | 'v' | null
      /** Un appui sur un élément déjà choisi, sans Cmd : au relâchement sans glisser, il devient seul choisi (ou s'édite). */
      reduire?: { id: Id; seul: boolean; ou: Point }
      /** Au doigt, décollé par un appui long : relâché sans avoir bougé, il ouvre son menu, là. */
      decolle?: { clientX: number; clientY: number; target: EventTarget | null }
      /** Le déplacement voulu, en UG, sans aimantation : on n'aimante qu'au dépôt. */
      d: Point
      envol?: Envol
      /** Les nœuds qui volent, et la place où ils sont déjà posés pendant la dépose, en pixels du plan. */
      vols: Id[]
      base: Point
      /** Ce qui a quitté une colonne au départ du geste, pour le remettre si on annule. */
      sorties: Operation[]
      /** Alt, lue au dépôt : les copies laissées à la place de départ. */
      copies?: Operation[]
      /** Ce qu'on glisse tel qu'au départ, prêt à laisser une copie si Alt est tenue au dépôt. */
      modele?: Paquet | null
      /** Le geste vient d'un autre tableau, où il est entré au survol. */
      enchaine?: boolean
    }
  | {
      type: 'outil'
      outil: OutilDeBarre
      fantome: Element
      prise: Point
      ecran: Point
      /** Le coin haut gauche voulu du fantôme, à l'écran : l'élément naîtra là, le fantôme l'y suit. */
      coin: Point
      demarre: boolean
      envol?: Envol
    }
  | {
      /** Le groupe choisi s'étire autour de son coin haut gauche, positions et largeurs ensemble. */
      type: 'redimensionnerGroupe'
      depart: Point
      cadre: Rect
      items: { id: Id; x: number; y: number; largeur: number; min: number; ligne: boolean; proportion?: boolean }[]
    }
  | {
      /** Une ligne prise par son trait : ses bouts libres suivent le pointeur, ceux qui tiennent à un élément restent. */
      type: 'ligneEntiere'
      id: Id
      depart: Point
      ecran: Point
      demarre: boolean
      avant: Ligne
    }
  | {
      type: 'redimensionner'
      id: Id
      depart: Point
      largeurDepart: number
      min: number
      /** Pour un type à hauteur bornable : sa hauteur donnée au départ, et celle de sa carte (px du plan). */
      borne?: { de: Hauteur | undefined; px: number }
      /** Pour un type dont la poignée change le contenu (`tirerPoignee`) : l'élément tel qu'il était au départ. */
      avant?: Element
    }

/**
 * Où en est le groupe tiré jusqu'à `ici` : une échelle par axe, celle en x ne descendant pas sous la largeur minimale
 * d'aucun élément. Chaque élément s'éloigne du coin haut gauche en proportion ; une ligne ne fait que suivre. Les opérations vont de l'état présent à l'état voulu.
 */
function pasDuGroupe(g: Extract<Geste, { type: 'redimensionnerGroupe' }>, ici: Point, libre = false, arrondir = true): Operation[] {
  const [l, h] = [g.cadre.max.x - g.cadre.min.x, g.cadre.max.y - g.cadre.min.y]
  const plancher = Math.max(0.1, ...g.items.filter((i) => !i.ligne).map((i) => i.min / i.largeur))
  // Chaque axe a sa propre échelle ; un média du groupe qui garde ses proportions ramène les deux à l'échelle en x (Cmd les libère).
  const echelleX = Math.max(plancher, 1 + (ici.x - g.depart.x) / l)
  const echelleY = !libre && g.items.some((i) => i.proportion) ? echelleX : Math.max(0.1, 1 + (ici.y - g.depart.y) / h)
  const o = g.cadre.min
  // Pendant le geste tout suit le pointeur au plus fin ; la grille ne rattrape que la fin (voir `animerFin`).
  const sur = arrondir ? Math.round : (v: number) => v
  return g.items.flatMap((i): Operation[] => {
    const x = sur(o.x + (i.x - o.x) * echelleX)
    const y = sur(o.y + (i.y - o.y) * echelleY)
    const echelle = echelleX
    const pas: Operation[] = [{ type: 'deplacer', id: i.id, de: [i.x, i.y], vers: [x, y] }]
    if (!i.ligne) pas.push({ type: 'redimensionner', id: i.id, de: i.largeur, vers: Math.max(i.min, sur(i.largeur * echelle)) })
    return pas
  })
}

/** La hauteur que demande le contenu d'une carte, plafond ou non (px du plan). */
function hauteurNaturelle(carte: HTMLElement): number {
  const contenu = carte.firstElementChild as HTMLElement | null
  const style = getComputedStyle(carte)
  return (contenu?.offsetHeight ?? 0) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
}

/**
 * Un glisser qui entre dans un tableau survolé : la toile de départ y envoie ce qu'on glisse, puis la toile
 * d'arrivée reprend le geste sous le pointeur, toujours enfoncé.
 */
let relais: { tableau: Id; ids: Id[]; decalages: Point[]; pointeur: number; ecran: Point } | null = null
/** Survoler un tableau ouvre au bout de ce délai (plus court une fois qu'on est déjà entré), puis d'un clignement. */
const ENTREE_PREMIERE = 700
const ENTREE_SUIVANTE = 400
const ENTREE_CLIGNEMENT = 300

/** Le verrou d'axe de Maj : choisi d'après le plus grand déplacement, il ne bascule que si l'autre le dépasse franchement. */
function choisirAxe(actuel: 'h' | 'v' | null, d: Point): 'h' | 'v' {
  const [ax, ay] = [Math.abs(d.x), Math.abs(d.y)]
  // Milanote ne bascule que si l'autre axe dépasse le premier de 50 px.
  if (actuel === 'h' && ay < ax + 50 / cam.PX_PAR_UG) return 'h'
  if (actuel === 'v' && ax < ay + 50 / cam.PX_PAR_UG) return 'v'
  return ax >= ay ? 'h' : 'v'
}

/** Un doigt posé sans bouger ce temps-là ouvre le menu du clic droit, en millisecondes. */
const APPUI_LONG = 500

/** Les types qui s'ouvrent en grand, et dont le plein écran a donc une adresse. */
const SANS_CROIX: ReadonlySet<string> = new Set(['croquis', 'document', 'arbre'])

const PLEIN_ECRAN: ReadonlySet<string> = new Set(['image', 'fichier', 'document', 'croquis', 'arbre'])

/** Les types que propose le menu de la toile vide. */
/** L'icône de chaque ligne de création du menu du fond. */
const ICONES_CREATION: Record<string, NomIcone> = { note: 'note', lien: 'lien', taches: 'tache', ligne: 'ligne', tableau: 'tableau', colonne: 'colonne', commentaire: 'commentaire', table: 'table' }

const TYPES_DU_MENU: ReadonlySet<string> = new Set(['note', 'lien', 'taches', 'ligne', 'tableau', 'colonne', 'commentaire', 'table'])

/** L'âge d'une activité, en quelques mots : « il y a quelques secondes », « il y a 3 min ». */
const ageCourt = (quand: number) => {
  const m = Math.floor((Date.now() - quand) / 60000)
  return m < 1 ? t('toile.ageSecondes') : t('toile.ageMinutes', { n: m })
}

/** Ce que Cmd+Entrée fait naître, pour les types où Milanote diffère de la suite propre du type. */
const SUIVANT_COMMUN: Partial<Record<TypeContenu, 'note' | 'rien' | 'droite'>> = {
  table: 'rien',
  document: 'droite',
  nuancier: 'note',
  lieu: 'note',
  fichier: 'note',
  croquis: 'note',
  clone: 'note',
  dessin: 'note',
}

/** Sous ce déplacement (pixels écran), un appui reste un clic : rien ne bouge, rien ne quitte sa colonne. */
const SEUIL_GLISSER = 3
/** Près du bord pendant un glisser ou un lasso, la vue défile : zone de 40 px, jusqu'à 18 px par image. */
const BORD = 40
const VITESSE_BORD = 18

/** Le dernier paquet copié, gardé d'un tableau à l'autre : le menu « Coller » s'en sert. */
const copie: { paquet: Paquet | null; collages: number } = { paquet: null, collages: 0 }
function retenirPaquet(p: Paquet) {
  if (copie.paquet !== p) copie.collages = 0
  copie.paquet = p
  // Un nouveau copier rend ce qui avait été coupé.
  if (coupe && p.coupe !== coupe.cle) libererCoupe()
}

/**
 * Ce qui a été coupé : comme chez Milanote, rien ne va à la corbeille. Les éléments disparaissent de l'écran (sans
 * rien changer au tableau) jusqu'au collage, qui les déplace ; un nouveau copier ou un annuler les fait reparaître.
 */
let coupe: { cle: string; magasin: Magasin; ids: ReadonlySet<Id> } | null = null
const ecouteursCoupe = new Set<() => void>()
function poserCoupe(c: typeof coupe) {
  coupe = c
  for (const f of ecouteursCoupe) f()
}
function libererCoupe() {
  if (coupe) poserCoupe(null)
}
const abonnerCoupe = (f: () => void) => {
  ecouteursCoupe.add(f)
  return () => void ecouteursCoupe.delete(f)
}
const lireCoupe = () => coupe

const AUCUNE: readonly Empreinte[] = []
const RIEN_MODIFIE = new Map<Id, { couleur: string; nom: string }>()
const aucunModifie = () => RIEN_MODIFIE

/**
 * La présentation montre un élément en grand : une copie de sa carte part de sa place et grandit au centre, sur un
 * voile. Un clic ou Échap la renvoie à sa place.
 */
function CoucheFocus({ noeud, depart, fermer }: { noeud: HTMLElement; depart: DOMRect; fermer(): void }) {
  const hote = useRef<HTMLDivElement>(null)
  const [sortie, setSortie] = useState(false)
  const copie = useRef<HTMLElement | null>(null)
  const place = `translate(${depart.left}px, ${depart.top}px)`
  useLayoutEffect(() => {
    const c = noeud.cloneNode(true) as HTMLElement
    c.removeAttribute('data-choisie')
    Object.assign(c.style, { position: 'absolute', left: '0', top: '0', margin: '0', width: `${depart.width}px`, transformOrigin: '0 0', transform: place })
    hote.current!.replaceChildren(c)
    copie.current = c
    const k = Math.min((innerWidth * 0.8) / depart.width, (innerHeight * 0.8) / depart.height, 3)
    const [x, y] = [(innerWidth - depart.width * k) / 2, (innerHeight - depart.height * k) / 2]
    c.getBoundingClientRect()
    c.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
    c.style.transform = `translate(${x}px, ${y}px) scale(${k})`
  }, [noeud, depart, place])
  const quitter = useCallback(() => {
    setSortie(true)
    if (copie.current) copie.current.style.transform = place
    setTimeout(fermer, 300)
  }, [fermer, place])
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      quitter()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [quitter])
  return (
    <div className="notak-focus" data-sortie={sortie || undefined} onPointerDown={(e) => (e.stopPropagation(), quitter())}>
      <div ref={hote} />
    </div>
  )
}

/** Le nom suit le pointeur d'un autre tant qu'il bouge ; immobile, le nom s'efface, puis le pointeur pâlit. */
const NOM_REPOS = 3_000
const POINTEUR_REPOS = 20_000

function CurseurAutre({ presence: a, echelle }: { presence: Presence; echelle: number }) {
  const [repos, setRepos] = useState<'non' | 'nom' | 'tout'>('non')
  const { x, y } = a.curseur!
  useEffect(() => {
    setRepos('non')
    const t1 = setTimeout(() => setRepos('nom'), NOM_REPOS)
    const t2 = setTimeout(() => setRepos('tout'), POINTEUR_REPOS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [x, y])
  return (
    <div
      className="notak-curseur"
      data-repos={repos === 'non' ? undefined : repos}
      style={{
        left: x * cam.PX_PAR_UG,
        top: y * cam.PX_PAR_UG,
        transform: `scale(${1 / echelle})`,
        ['--notak-autre' as string]: a.utilisateur.couleur,
      }}
    >
      <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden>
        <path d="M1 1l13 8.5-5.6 1.4L6.2 17z" fill="currentColor" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <span>{a.utilisateur.nom}</span>
    </div>
  )
}
const sansEcoute = () => () => {}
const rien = () => {}

/** L'élément dont on écrit le texte quand on « édite » celui-ci (un clone écrit son original) ; `null` : rien à écrire. */
const ecrivain = (el: Element, tableau: Tableau): Element | null => {
  const def = definition(el.contenu.type)
  return def?.edite ? def.edite(el as never, tableau) : el
}
const defEcrite = (el: Element, tableau: Tableau) => {
  const ecrit = ecrivain(el, tableau)
  return ecrit ? definition(ecrit.contenu.type) : undefined
}

/** Une ligne fantôme se dessine par son type, dans un calque SVG à elle. */
function rendreFantome(e: Element, contexte: ContexteToile) {
  const Rendu = definition(e.contenu.type)!.Rendu
  return <Rendu element={e} choisie={false} enEdition={false} contexte={contexte} brouillon={rien} changer={rien} />
}
const aucun = (): Presence[] => AUCUN
const AUCUN: Presence[] = []

const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** Les nœuds `data-id` qui contiennent ce nœud, du plus proche au plus lointain, dans la toile. */
function chaineDe(racine: HTMLElement | null, noeud: EventTarget | null): HTMLElement[] {
  const chaine: HTMLElement[] = []
  for (let c = (noeud as HTMLElement | null)?.closest<HTMLElement>('[data-id]') ?? null; c; c = c.parentElement?.closest<HTMLElement>('[data-id]') ?? null) {
    if (racine?.contains(c)) chaine.push(c)
  }
  return chaine
}
/** Le nœud en cours d'édition ne laisse passer que ce qui est à lui, pas ce qu'il contient (les éléments d'une colonne). */
function dansEdition(racine: HTMLElement | null, cible: EventTarget | null) {
  const n = (cible as HTMLElement | null)?.closest?.('[data-edition]')
  return !!n && chaineDe(racine, cible)[0]?.getAttribute('data-id') === n.getAttribute('data-id')
}
/** Un élément qu'on glisse : tout sauf une ligne. */
const mobile = (e: Element) => definition(e.contenu.type)?.calque !== 'lignes'
/** Un élément posé librement sur la toile : ni dans une colonne, ni une ligne. */
/** Au-delà de ce nombre d'éléments libres, l'édition ne pousse plus ses voisins. */
const MAX_POUSSEES = 150
const libre = (e: Element) => !e.parent && definition(e.contenu.type)?.calque !== 'lignes'
/** Ce qu'on supprime, et ce qui doit partir avec (les lignes accrochées), sans doublon. */
function avecLiees(supprimes: Element[], tableau: Tableau): Element[] {
  const vus = new Set(supprimes.map((e) => e.id))
  const liees = tousLesTypes().flatMap((d) => d.emporterAvec?.(supprimes, tableau) ?? [])
  return [...supprimes, ...liees.filter((e) => !vus.has(e.id) && vus.add(e.id))]
}
/** Hauteur réservée au-dessus de la sélection pour sa barre, en pixels. */
const MARGE_BARRE = 52

/** La vue n'est signalée à l'hôte qu'à ce rythme au plus, en millisecondes. */
const DELAI_SIGNAL_CAMERA = 300

interface PropsToile {
  magasin: Magasin
  services?: Services
  /** Où regarder à l'ouverture (la vue mémorisée du tableau). */
  cameraInitiale?: cam.Camera
  /** La vue a changé : au plus toutes les 300 ms, et une dernière fois en quittant la toile. */
  surCamera?(c: cam.Camera): void
}

/** Le texte qu'on écrit part dans le tableau à ce rythme au plus, en millisecondes. */
const DELAI_ECRITURE = 1000

/** Le pointeur est signalé aux autres à ce rythme au plus, en millisecondes. */
const DELAI_CURSEUR = 100

/** Deux touchers comptent pour un double-clic s'ils tombent à moins de tant de millisecondes et de pixels l'un de l'autre. */
const DOUBLE_TOUCHER_MS = 350
const DOUBLE_TOUCHER_PX = 24
/** Un doigt qui a bougé de plus que cela (px) tire le fond : ce n'est plus un toucher. */
const SEUIL_TOUCHER = 8

export function Toile({ magasin: source, services = {}, cameraInitiale, surCamera }: PropsToile) {
  const lectureSeule = !!services.lectureSeule
  // Les droits du serveur, lus au moment du geste : ils peuvent changer sans que la toile se refasse.
  const droitsActuels = useRef(services.droits)
  droitsActuels.current = services.droits
  const auteurActuel = useRef(services.presence)
  auteurActuel.current = services.presence
  // Un commentateur, ou des éléments à droits propres : seuls passent les gestes permis (le serveur annulerait les
  // autres). Sinon, en lecture seule, rien ne passe.
  const filtre = aFiltrer(services.droits) && !services.presentation && !services.apercuModele
  // Tout le tableau, corbeille comprise ; la toile, elle, ne voit pas la corbeille.
  const complet = useMemo(
    () =>
      filtre
        ? filtrerMagasin(source, () => droitsActuels.current!, () => auteurActuel.current?.moi?.()?.id ?? '')
        : lectureSeule
          ? enLectureSeule(source)
          : source,
    [source, lectureSeule, filtre],
  )
  const magasin = useMemo(() => sansCorbeille(complet), [complet])
  const toutLeTableau = useSyncExternalStore(complet.ecouter, complet.lire)
  const corbeille = useMemo(() => aLaCorbeille(toutLeTableau), [toutLeTableau])
  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false)
  const nonTries = useMemo(() => nonTriesDe(toutLeTableau), [toutLeTableau])
  const [nonTriesOuvert, setNonTriesOuvert] = useState(false)
  // La recherche dans le tableau (Cmd+F) : `null` fermée ; le rang du résultat montré ; chaque appel refocalise.
  const [requete, setRequete] = useState<string | null>(null)
  const [raccourcis, setRaccourcis] = useState(false)
  const fermerRaccourcis = useCallback(() => setRaccourcis(false), [])
  const [rangTrouve, setRangTrouve] = useState(-1)
  const [appelRecherche, setAppelRecherche] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; ou: Point; surElement: boolean } | null>(null)
  const presence = services.presence
  const autres = useSyncExternalStore(
    presence?.ecouter ?? sansEcoute,
    presence ? presence.autres : aucun,
  )
  // Ce qu'un autre a choisi ou écrit en ce moment : ni vous ni le lasso n'y touchez.
  // Ce qui est coupé de ce tableau disparaît de l'écran, sans quitter le tableau.
  const coupeEnCours = useSyncExternalStore(abonnerCoupe, lireCoupe)
  const masques = coupeEnCours?.magasin === magasin ? coupeEnCours.ids : null
  // L'arrière-plan du tableau, et son aperçu en direct pendant qu'on choisit une couleur libre.
  const [apercuFond, setApercuFond] = useState<Fond | null>(null)
  const fondVoulu: Fond | undefined = apercuFond ?? toutLeTableau.fond
  const prisParUnAutre = useMemo(() => new Set(autres.flatMap((a) => [...a.selection, ...(a.edition ? [a.edition] : [])])), [autres])
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const [camera, setCamera] = useState<cam.Camera>(cameraInitiale ?? cam.CAMERA_DEPART)
  const [vue, setVue] = useState<cam.Vue>({ largeur: 1, hauteur: 1 })
  const [selection, setSelection] = useState<ReadonlySet<Id>>(new Set())
  const [edition, setEdition] = useState<Id | null>(null)
  // [barre d'édition à gauche] L'emplacement que la barre de gauche prête aux outils de texte de l'élément en édition.
  const [cibleEdition, setCibleEdition] = useState<HTMLElement | null>(null)
  const [zoneLasso, setZoneLasso] = useState<Rect | null>(null)
  /** Ce que le lasso prendra : montré pendant le geste, posé comme sélection au relâchement. */
  const [prisLasso, setPrisLasso] = useState<ReadonlySet<Id> | null>(null)
  const [espace, setEspace] = useState(false)
  /** Espace vient d'être appuyée, et n'a encore rien attrapé. */
  const espaceBref = useRef(false)
  // Au doigt, deux touchers rapides sur le vide valent un double-clic (`appui`) : le premier, et l'heure du double.
  const toucher = useRef<{ instant: number; x: number; y: number } | null>(null)
  const doubleTouche = useRef(-Infinity)
  const [anime, setAnime] = useState(false)
  const [enGeste, setEnGeste] = useState(false)
  // Un geste qui laisse les barres telles qu'avant l'appui : la toile qu'on déplace (bouton du milieu, Espace) ne
  // change ni la sélection ni l'édition, et la barre de création peut être rangée ; un appui sur un élément qui n'a pas
  // encore franchi le seuil du glisser ne fait pas basculer, au clic ou au double-clic, la sélection vers la création.
  const [barresGardees, setBarresGardees] = useState(false)
  // La main se ferme tant qu'on tient la toile, au bouton du milieu comme avec Espace.
  const [attrape, setAttrape] = useState(false)
  // Ce qu'un autre vient de toucher : un contour à sa couleur et son prénom, quelques secondes (voir le service).
  const modifies = useSyncExternalStore(services.ecouterRecemmentModifies ?? sansEcoute, services.recemmentModifies ?? aucunModifie)
  useLayoutEffect(() => {
    const div = racine.current
    if (!div) return
    for (const n of div.querySelectorAll<HTMLElement>('.notak-carte[data-modifie-par]')) {
      if (!modifies.has(n.dataset.id!)) {
        delete n.dataset.modifiePar
        n.style.removeProperty('--notak-modifie')
      }
    }
    for (const [id, qui] of modifies) {
      const n = div.querySelector<HTMLElement>(`.notak-carte[data-id="${CSS.escape(id)}"]`)
      if (!n) continue
      n.dataset.modifiePar = qui.nom.split(' ')[0] ?? qui.nom
      n.style.setProperty('--notak-modifie', qui.couleur)
    }
  })
  // L'activité qu'on n'a pas vue : un point sur l'élément qu'un autre a modifié, jusqu'à ce qu'on l'ait choisi puis lâché.
  const [nonVus, setNonVus] = useState<ReadonlyMap<Id, { nom: string; quand: number }>>(new Map())
  useEffect(() => {
    setNonVus((avant) => {
      let suivant: Map<Id, { nom: string; quand: number }> | null = null
      for (const [id, qui] of modifies) {
        if (avant.has(id) || selection.has(id)) continue
        suivant ??= new Map(avant)
        suivant.set(id, { nom: qui.nom, quand: Date.now() })
      }
      return suivant ?? avant
    })
  }, [modifies, selection])
  useEffect(() => {
    if (enGeste || nonVus.size === 0) return
    const vus = [...nonVus.keys()].filter((id) => selection.has(id))
    if (vus.length > 0) setNonVus((avant) => new Map([...avant].filter(([id]) => !vus.includes(id))))
  }, [selection, enGeste, nonVus])
  // L'élément montré en grand pendant une présentation.
  const [focus, setFocus] = useState<{ noeud: HTMLElement; depart: DOMRect } | null>(null)
  const [glisses, setGlisses] = useState<ReadonlySet<Id> | null>(null)
  /** Le trait qui montre la place d'insertion dans une colonne, en pixels de la toile. */
  const [trait, setTrait] = useState<{ x0: number; x1: number; y: number; cadre?: number } | null>(null)
  const cible = useRef<Cible | null>(null)
  /** Le tableau où tombera ce qu'on glisse (sa carte sur la toile, ou un segment du fil d'Ariane), et son nœud. */
  const tableauVise = useRef<{ id: Id; noeud: HTMLElement } | null>(null)
  const zoneMarquee = useRef<HTMLElement | null>(null)
  // Le paquet glissé rétrécit au-dessus d'un tableau, de la corbeille ou du fil d'Ariane (0,8 et 75 %), et pâlit sur une colonne (75 %).
  const reduction = useRef({ cible: { echelle: 1, opacite: 1 }, actuel: { echelle: 1, opacite: 1 }, instant: 0 })
  const reductionVol = () => {
    const r = reduction.current
    const t = performance.now()
    const k = 1 - Math.exp(-Math.min(t - r.instant, 100) / 70)
    r.instant = t
    r.actuel = {
      echelle: r.actuel.echelle + (r.cible.echelle - r.actuel.echelle) * k,
      opacite: r.actuel.opacite + (r.cible.opacite - r.actuel.opacite) * k,
    }
    return r.actuel
  }
  // L'entrée au survol en attente, et le dernier point du pointeur (écran) pour la reprise dans l'autre tableau.
  const entree = useRef<{ noeud: HTMLElement; minuteur: ReturnType<typeof setTimeout> } | null>(null)
  const dernierPointeur = useRef<{ ecran: Point; id: number } | null>(null)
  const oublierEntree = () => {
    if (!entree.current) return
    clearTimeout(entree.current.minuteur)
    delete entree.current.noeud.dataset.clignote
    entree.current = null
  }
  const [empreintes, setEmpreintes] = useState<readonly Empreinte[]>(AUCUNE)

  const racine = useRef<HTMLDivElement>(null)
  const geste = useRef<Geste | null>(null)
  const gesteZoom = useRef(new cam.GesteZoom())
  const animation = useRef<{ depart: cam.Camera; cible: cam.Camera; debut: number } | null>(null)
  /** Ce qu'on écrit : le contenu d'avant l'édition (un seul pas d'historique à la sortie), et le dernier état. */
  const brouillon = useRef<{ id: Id; debut: Contenu; contenu: Contenu } | null>(null)
  // Les voisins poussés pendant l'édition : ils entrent dans le pas qui l'inscrit. `neSous` : l'élément que
  // Cmd+Entrée vient de faire naître, qui écarte ce qu'il recouvre dès sa première mesure.
  const pousses = useRef<Operation[]>([])
  const neSous = useRef<Id | null>(null)
  const pointEdition = useRef<Point | null>(null)
  /** Le fantôme de l'outil qu'on glisse depuis la barre. */
  const [fantome, setFantome] = useState<Element | null>(null)
  const calqueFantome = useRef<HTMLDivElement>(null)
  const [rebond, setRebond] = useState<{ libelle: string; n: number; texte?: 'barre.cliquer' } | null>(null)
  /** La dépose qui s'anime encore : un nouveau geste l'arrête net. */
  const depose = useRef<{ envol: Envol; ids: Id[] } | null>(null)
  // Les gestionnaires natifs (molette, collage, animation) et le contexte lisent l'état courant ici.
  const etat = useRef({ camera, vue, tableau, selection, edition, magasin, services })
  etat.current = { camera, vue, tableau, selection, edition, magasin, services }

  const limiteur = useMemo(
    () => (presence ? creerLimiteur((curseur: Point | null) => presence.signaler({ curseur }), DELAI_CURSEUR) : null),
    [presence],
  )
  useEffect(() => {
    presence?.signaler({ selection: [...selection] })
  }, [presence, selection])
  // Qui écrit dans quelle note : celui qui arrive rejoint le texte en cours au lieu de le remettre à zéro.
  useEffect(() => {
    // Un clone s'écrit dans son original : c'est lui que les autres voient s'écrire.
    const el = edition ? etat.current.magasin.lire().elements.find((x) => x.id === edition) : undefined
    presence?.signaler({ edition: el ? (ecrivain(el, etat.current.tableau)?.id ?? edition) : edition })
  }, [presence, edition])
  useEffect(() => () => presence?.signaler({ curseur: null, selection: [], edition: null }), [presence])
  // Quelqu'un nous demande de lâcher ce qu'il voulait : retiré de la sélection (et de l'écriture), sauf croquis et document.
  useEffect(
    () =>
      presence?.surDeselection?.((ids) => {
        const lachables = new Set(ids.filter((id) => !SANS_CROIX.has(etat.current.magasin.lire().elements.find((x) => x.id === id)?.contenu.type ?? '')))
        if (lachables.size === 0) return
        if (etat.current.edition && lachables.has(etat.current.edition)) finirEdition()
        setSelection((s) => (ids.some((id) => s.has(id) && lachables.has(id)) ? new Set([...s].filter((id) => !lachables.has(id))) : s))
      }),
    [presence],
  )

  // Le contour d'un élément choisi par un autre : posé sur le nœud, dans la couleur de cette personne.
  useEffect(() => {
    const div = racine.current
    if (!div) return
    const marques: HTMLElement[] = []
    for (const a of autres) {
      for (const id of a.selection) {
        const n = div.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
        if (!n) continue
        n.dataset.autre = a.utilisateur.nom
        n.style.setProperty('--notak-autre', a.utilisateur.couleur)
        marques.push(n)
      }
    }
    return () => {
      for (const n of marques) {
        delete n.dataset.autre
        n.style.removeProperty('--notak-autre')
      }
    }
  }, [autres, tableau])

  const signalee = useRef(camera)
  const signal = useRef<{ f?: (c: cam.Camera) => void; minuteur?: ReturnType<typeof setTimeout> }>({})
  signal.current.f = surCamera
  useEffect(() => {
    const s = signal.current
    if (camera === signalee.current || s.minuteur) return
    s.minuteur = setTimeout(() => {
      s.minuteur = undefined
      signalee.current = etat.current.camera
      s.f?.(signalee.current)
    }, DELAI_SIGNAL_CAMERA)
  }, [camera])
  // En quittant la toile, la dernière vue part tout de suite.
  useEffect(() => {
    const s = signal.current
    return () => {
      if (!s.minuteur) return
      clearTimeout(s.minuteur)
      s.minuteur = undefined
      s.f?.(etat.current.camera)
    }
  }, [])

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = racine.current!.getBoundingClientRect()
    return point(e.clientX - r.left, e.clientY - r.top)
  }

  /** Le rectangle d'un élément, mesuré sur son nœud DOM et ramené au tableau. */
  const rect = useCallback((id: Id): Rect | null => {
    const div = racine.current
    const noeud = div?.querySelector(`[data-id="${CSS.escape(id)}"]`)
    if (!div || !noeud) return null
    const [o, r] = [div.getBoundingClientRect(), noeud.getBoundingClientRect()]
    const c = etat.current.camera
    return {
      min: cam.versTableau(c, point(r.left - o.left, r.top - o.top)),
      max: cam.versTableau(c, point(r.right - o.left, r.bottom - o.top)),
    }
  }, [])
  const contenu = useCallback(
    () => englobant(etat.current.tableau.elements.filter(libre).flatMap((e) => rect(e.id) ?? [])),
    [rect],
  )
  // L'hôte (l'export du tableau entier) déplace la caméra par là, le temps d'une capture.
  useEffect(() => brancherPilote({ camera: () => etat.current.camera, vue: () => etat.current.vue, contenu, poser: setCamera }), [contenu])
  // Le document borné : après chaque mouvement de vue, la caméra revient dans ses bornes. Pas pendant un geste ni
  // une animation : la vue ne doit pas bouger sous le pointeur pendant qu'on tire un élément.
  // Seul ce que la personne fait de la vue la recale : déplacer un élément ne la fait jamais bouger. Le recentrage
  // (tout tient à l'écran) attend un changement de zoom ou de fenêtre.
  const derniereBorne = useRef<{ camera: cam.Camera | null; vue: cam.Vue }>({ camera: null, vue })
  useLayoutEffect(() => {
    if (enGeste || anime || edition) return
    const avant = derniereBorne.current
    const memeVue = avant.vue.largeur === vue.largeur && avant.vue.hauteur === vue.hauteur
    derniereBorne.current = { camera, vue }
    if (avant.camera === camera && memeVue) return
    const recentrer = !avant.camera || avant.camera.echelle !== camera.echelle || !memeVue
    const bornee = cam.bornerVue(camera, contenu(), vue, recentrer)
    if (bornee !== camera) setCamera(bornee)
  }, [camera, enGeste, anime, edition, vue, tableau, contenu])

  const sous = (cible: EventTarget | null): Id | null => {
    const n = (cible as HTMLElement | null)?.closest?.('[data-id]')
    return n && racine.current?.contains(n) ? n.getAttribute('data-id') : null
  }

  // Pendant l'écriture, le texte part dans le tableau au plus chaque seconde : les autres le voient venir.
  const ecritureDirecte = useMemo(
    () =>
      creerLimiteur((id: Id) => {
        const b = brouillon.current
        const m = etat.current.magasin
        const el = b?.id === id && m.lire().elements.find((x) => x.id === id)
        if (b && el && !memes(el.contenu, b.contenu)) m.appliquerSeulement([{ type: 'contenu', id, avant: el.contenu, apres: b.contenu }])
      }, DELAI_ECRITURE),
    [],
  )
  /**
   * Rien ne s'écrit d'ici : la lecture seule, sauf pour qui commente (le magasin filtré ne laisse alors passer que ses
   * fils et ses réactions).
   */
  const fermeeAEcriture = () => {
    const s = etat.current.services
    return !!s.lectureSeule && !(aFiltrer(s.droits) && peutCommenter(s))
  }
  const finirEdition = useCallback(() => {
    const b = brouillon.current
    brouillon.current = null
    setEdition(null)
    racine.current?.focus({ preventScroll: true })
    const m = etat.current.magasin
    const el = b && m.lire().elements.find((x) => x.id === b.id)
    if (!b || !el) return
    // Une note qui n'est qu'une adresse devient un lien, d'un seul pas avec l'écriture.
    const converti = definition(b.contenu.type)?.convertir?.(b.contenu as never)
    if (converti) b.contenu = converti
    if (!memes(el.contenu, b.contenu)) m.appliquerSeulement([{ type: 'contenu', id: b.id, avant: el.contenu, apres: b.contenu }])
    // Toute l'édition, d'un seul pas, avec les voisins qu'elle a poussés : annuler rend le contenu et les places d'avant.
    const pas: Operation[] = memes(b.debut, b.contenu) ? [] : [{ type: 'contenu', id: b.id, avant: b.debut, apres: b.contenu }]
    pas.push(...pousses.current)
    pousses.current = []
    if (pas.length > 0) m.inscrire(pas)
  }, [])
  const commencerEdition = useCallback(
    (id: Id, ou?: Point) => {
      // Le magasin, pas l'état rendu : l'élément vient peut-être d'être créé.
      const el = etat.current.magasin.lire().elements.find((x) => x.id === id)
      // En lecture seule, seul un commentateur ouvre quelque chose : un fil, pour y écrire.
      const services = etat.current.services
      if (services.lectureSeule && !(el?.contenu.type === 'commentaire' && peutCommenter(services, id))) return
      if (!el || !defEcrite(el, etat.current.magasin.lire())?.editable) return
      // Déjà ouvert (l'adresse qui suit l'ouverture le redemande) : le refermer rendrait le clavier à la toile.
      if (etat.current.edition === id && !ou) return
      if (etat.current.edition) finirEdition()
      brouillon.current = null
      pousses.current = []
      pointEdition.current = ou ?? null
      setSelection(new Set([id]))
      setEdition(id)
    },
    [finirEdition],
  )
  const creerSuivant = useCallback((id: Id, format: boolean) => {
    if (etat.current.services.lectureSeule) return
    if (etat.current.edition) finirEdition()
    const m = etat.current.magasin
    const t = m.lire()
    const el = t.elements.find((x) => x.id === id)
    if (!el) return
    const def = definition(el.contenu.type)
    const r = rect(id)
    const bas = r ? Math.round(r.max.y) + 1 : el.y + (def?.hauteurParDefaut ?? HAUTEUR_NOTE_MIN) + 1
    const places = { dessous: point(el.x, bas), droite: point(el.x + el.largeur + 2, el.y) }
    // Comme Milanote : une table ne donne rien, un document naît 17 UG à droite, le reste des éléments sans suite propre donne une note dessous.
    const usage = SUIVANT_COMMUN[el.contenu.type]
    if (usage === 'rien') return
    const propre = usage === 'note' ? undefined : def?.suivant
    const neuf = propre ? propre(el as never, places, format, contexteRef.current!) : nouvelleNote(places.dessous.x, places.dessous.y)
    if (!neuf) return
    let element: Element = propre ? neuf : { ...neuf, largeur: el.largeur }
    if (usage === 'droite') element = { ...element, x: el.x + 17, y: el.y }
    // Dans une colonne, l'élément neuf se range juste après.
    if (el.parent) {
      const freres = t.elements.filter((x) => x.parent === el.parent).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
      const apres = freres[freres.findIndex((x) => x.id === id) + 1]
      element = { ...element, parent: el.parent, ordre: cleEntre(el.ordre, apres?.ordre) }
    }
    m.faire([{ type: 'creer', element }])
    setSelection(new Set([element.id]))
    neSous.current = element.id
    commencerEdition(element.id)
  }, [finirEdition, rect, commencerEdition])

  /**
   * Les voisins à pousser quand l'élément `haut` passe de `avant` à `apres` (voir `coeur/collisions.ts`), en
   * opérations prêtes à écrire. `origines` garde, d'un appel à l'autre, d'où venaient les voisins rattrapés.
   */
  const calculerPoussees = useCallback(
    (haut: Id, avant: Rect, apres: Rect, nouveau: boolean, origines: Map<Id, number>): Operation[] => {
      const t = etat.current.magasin.lire()
      const candidats = t.elements.filter((x) => libre(x) && x.id !== haut && !x.verrou)
      // Au-delà, chaque frappe mesurerait trop d'éléments.
      if (candidats.length > MAX_POUSSEES) return []
      const voisins = new Map<Id, Rect>()
      for (const x of candidats) {
        const r = rect(x.id)
        if (r) voisins.set(x.id, r)
      }
      // Une ligne horizontale aux deux bouts libres se pousse aussi, comme un trait d'une UG d'épaisseur.
      for (const x of t.elements) {
        const c = x.contenu
        if (c.type !== 'ligne' || x.verrou || !('x' in c.depart) || !('x' in c.arrivee) || c.depart.y !== c.arrivee.y) continue
        const y = c.depart.y
        voisins.set(x.id, { min: point(Math.min(c.depart.x, c.arrivee.x), y - 0.5), max: point(Math.max(c.depart.x, c.arrivee.x), y + 0.5) })
      }
      const pas: Operation[] = []
      for (const [id, dy] of poussees(haut, { avant, apres, nouveau }, voisins, origines)) {
        const x = t.elements.find((e) => e.id === id)!
        const c = x.contenu
        if (c.type === 'ligne' && 'x' in c.depart && 'x' in c.arrivee) {
          const apres = { ...c, depart: { x: c.depart.x, y: c.depart.y + dy }, arrivee: { x: c.arrivee.x, y: c.arrivee.y + dy } }
          pas.push({ type: 'contenu', id, avant: c, apres })
        } else pas.push({ type: 'deplacer', id, de: [x.x, x.y], vers: [x.x, x.y + dy] })
      }
      return pas
    },
    [rect],
  )

  // Ce qui change de taille juste après un geste (une note bornée qui se replie en sortant d'édition, une colonne
  // qui reçoit ou perd un élément) : remesuré une fois le geste écrit, ses voisins suivent d'un pas à part.
  const aRemesurer = useRef<{ haut: Id; avant: Rect; origines: Map<Id, number> }[]>([])
  const colonnesAuDepart = useRef<{ haut: Id; avant: Rect; origines: Map<Id, number> }[]>([])
  useEffect(() => {
    if (aRemesurer.current.length === 0 || enGeste || edition || services.lectureSeule) return
    const liste = aRemesurer.current
    aRemesurer.current = []
    const pas = liste.flatMap((r) => {
      const apres = rect(r.haut)
      return apres && Math.abs(apres.max.y - r.avant.max.y) >= 0.05 ? calculerPoussees(r.haut, r.avant, apres, false, r.origines) : []
    })
    if (pas.length > 0) etat.current.magasin.faire(pas)
  })

  // Pendant l'édition, ce qui grandit pousse ce qui est dessous. Un élément rangé fait grandir sa colonne : c'est
  // elle qui pousse.
  useEffect(() => {
    if (!edition || services.lectureSeule) return
    const m = etat.current.magasin
    const el = m.lire().elements.find((x) => x.id === edition)
    if (!el) return
    const haut = el.parent ?? el.id
    const noeud = racine.current?.querySelector(`.notak-carte[data-id="${CSS.escape(haut)}"]`)
    if (!noeud) return
    let avant = rect(haut)
    const origines = new Map<Id, number>()
    const obs = new ResizeObserver(() => {
      const apres = rect(haut)
      // Lue ici, pas à l'entrée de l'effet : React le joue deux fois en développement.
      const nouveau = neSous.current === edition
      if (!avant || !apres || (!nouveau && Math.abs(apres.max.y - avant.max.y) < 0.05)) return
      const pas = calculerPoussees(haut, avant, apres, nouveau, origines)
      if (nouveau) neSous.current = null
      avant = apres
      if (pas.length === 0) return
      m.appliquerSeulement(pas)
      pousses.current.push(...pas)
    })
    obs.observe(noeud)
    return () => {
      obs.disconnect()
      // En sortant d'édition, une note à hauteur bornée se replie : elle ramène ses voisins.
      if (avant) aRemesurer.current.push({ haut, avant, origines })
    }
  }, [edition, services.lectureSeule, rect, calculerPoussees])
  const contexteRef = useRef<ContexteToile | null>(null)

  /**
   * Sort ces éléments de la toile, d'un seul pas, vers la corbeille ou les non triés. Un élément verrouillé reste ;
   * une colonne garde son contenu ; les lignes accrochées partent à la corbeille avec, mais pas dans les non triés.
   */
  const ecarter = useCallback(
    (ids: Iterable<Id>, vers: 'corbeille' | 'nonTrie') => {
      if (etat.current.services.lectureSeule) return
      const m = etat.current.magasin
      const tab = m.lire()
      const voulus = new Set(ids)
      const choisis = tab.elements.filter((e) => voulus.has(e.id) && !e.verrou)
      const partants = vers === 'corbeille' ? avecLiees(choisis, tab) : choisis.filter((e) => definition(e.contenu.type)?.calque !== 'lignes')
      const dedans = new Set(partants.map((e) => e.id))
      const date = Date.now()
      const pas = partants
        .filter((e) => !(e.parent && dedans.has(e.parent)))
        .map((e): Operation => {
          const r = e.parent ? rect(e.id) : null
          const [x, y] = r ? aimanter(r.min) : [e.x, e.y]
          return { type: 'ranger', id: e.id, de: placeDe(e), vers: { x, y, [vers]: date } }
        })
      if (pas.length === 0) return
      m.faire(pas)
      const n = pas.length
      annoncer({
        texte:
          vers === 'corbeille'
            ? tn('toile.misCorbeille', n)
            : tn('toile.misNonTries', n),
        // Défaire ce geste-là, même si d'autres l'ont suivi : Cmd+Z, lui, défait le dernier.
        action: { libelle: t('espace.annuler'), faire: () => m.faire(pas.map(inverse).reverse()) },
      })
    },
    [rect],
  )
  const jeter = useCallback((ids: Iterable<Id>) => ecarter(ids, 'corbeille'), [ecarter])
  const surBrouillon = useCallback(
    (el: Element, apres: Contenu) => {
      const b = brouillon.current
      const debut = b?.id === el.id ? b.debut : (etat.current.magasin.lire().elements.find((x) => x.id === el.id)?.contenu ?? el.contenu)
      brouillon.current = { id: el.id, debut, contenu: apres }
      if (!fermeeAEcriture()) ecritureDirecte.pousser(el.id)
    },
    [ecritureDirecte],
  )
  const surChanger = useCallback((el: Element, apres: Contenu) => {
    if (fermeeAEcriture()) return
    const m = etat.current.magasin
    const actuel = m.lire().elements.find((x) => x.id === el.id)
    if (actuel && !memes(actuel.contenu, apres)) m.faire([{ type: 'contenu', id: el.id, avant: actuel.contenu, apres }])
  }, [])

  // Le contexte est stable : ses champs lisent l'état courant, les cartes ne se redessinent pas à chaque zoom.
  const contexte = useMemo<ContexteToile>(
    () => ({
      get magasin() {
        return etat.current.magasin
      },
      get services() {
        return etat.current.services
      },
      get camera() {
        return etat.current.camera
      },
      get selection() {
        return etat.current.selection
      },
      rect,
      versTableau: (p) => cam.versTableau(etat.current.camera, p),
      largeurVue: () => etat.current.vue.largeur,
      centreVue: () => cam.centreCamera(etat.current.camera, etat.current.vue),
      choisir: (ids) => setSelection(new Set(ids)),
      commencerEdition,
      brouillonDe: (el, apres) => surBrouillon(el, apres),
      montrer: (id) => montrerCourant.current(id),
      jeter,
      creerSuivant,
      prendrePointEdition: () => {
        const p = pointEdition.current
        pointEdition.current = null
        return p
      },
      finirEdition,
      suivreBord: (e, rejouer) => suivreBordTenu(e, rejouer),
      arreterBord: () => arreterBordTenu(),
      recevoir: (donnees, ou) => void recevoirCourant.current(donnees, ou),
    }),
    [rect, commencerEdition, finirEdition, creerSuivant, jeter, surBrouillon],
  )
  contexteRef.current = contexte

  const montrerCourant = useRef<(id: Id) => void>(() => {})
  /** Met fin tout de suite à la fin animée d'un redimensionnement en cours (voir `animerFin`). */
  const finRedim = useRef<(() => void) | null>(null)
  useEffect(() => () => finRedim.current?.(), [])
  /** Un zoom qui démarre pendant un redimensionnement l'annule (rempli plus bas, avec `annulerGlisser`). */
  const annulerRedimRef = useRef<() => void>(() => {})
  const recevoirCourant = useRef<(d: DataTransfer, ou: Point) => Promise<void>>(async () => {})
  /** `dans` : la colonne où l'on a déposé ; ce qui peut y entrer s'y range, à la suite. */
  const recevoir = async (original: DataTransfer, ou: Point, dans?: Id, depot = false) => {
    if (lectureSeule) return
    // Le navigateur vide le presse-papiers dès que l'événement est fini : on le recopie avant d'attendre
    // le premier récepteur.
    const donnees = new DataTransfer()
    for (const type of original.types) if (type !== 'Files') donnees.setData(type, original.getData(type))
    for (const f of original.files) donnees.items.add(f)
    if (depot) marquerDepot(donnees)
    const tous: Operation[] = []
    for (const r of tousLesRecepteurs()) {
      const pas = await r.recevoir(donnees, ou, contexte)
      if (!pas || pas.length === 0) continue
      tous.push(...pas)
      if (!r.cumulable) break
    }
    if (tous.length === 0) return
    const colonne = dans ? magasin.lire().elements.find((x) => x.id === dans) : undefined
    const defColonne = colonne ? definition(colonne.contenu.type) : undefined
    if (colonne && defColonne?.accepte) {
      const freres = magasin.lire().elements.filter((x) => x.parent === colonne.id).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
      let dernier = freres.at(-1)?.ordre
      for (const op of tous) {
        if (op.type !== 'creer' || !defColonne.accepte(op.element, colonne as never)) continue
        dernier = cleEntre(dernier, undefined)
        op.element = { ...op.element, parent: colonne.id, ordre: dernier }
      }
    }
    magasin.faire(tous)
    const crees = tous.flatMap((op) => (op.type === 'creer' ? [op.element] : []))
    setSelection(new Set(crees.map((e) => e.id)))
    // Une seule note née d'un collage s'ouvre en édition : on la complète aussitôt, comme si on l'avait tapée.
    if (crees.length === 1 && crees[0]!.contenu.type === 'note') commencerEdition(crees[0]!.id)
  }

  recevoirCourant.current = recevoir

  // Fichier › Importer… (Notak de bureau) : la toile ouverte, si on peut y écrire, prend les fichiers au centre de la vue.
  useEffect(() => {
    const importer = (e: Event) => {
      const { fichiers } = (e as CustomEvent<DetailImport>).detail
      if (e.defaultPrevented || lectureSeule || !racine.current?.isConnected || racine.current.offsetParent === null) return
      e.preventDefault()
      void operationsDImport(fichiers, contexte.centreVue(), contexte).then((ops) => {
        if (ops.length === 0) return
        magasin.faire(ops)
        setSelection(new Set(ops.flatMap((op) => (op.type === 'creer' ? [op.element.id] : []))))
      })
    }
    window.addEventListener(EVENEMENT_IMPORT, importer)
    return () => window.removeEventListener(EVENEMENT_IMPORT, importer)
  }, [contexte, lectureSeule, magasin])

  useLayoutEffect(() => {
    const div = racine.current!
    // Mesurée tout de suite, avant la première image : une vue de 1 px ne laisserait rien se poser au premier affichage.
    setVue({ largeur: div.clientWidth, hauteur: div.clientHeight })
    const obs = new ResizeObserver(() => setVue({ largeur: div.clientWidth, hauteur: div.clientHeight }))
    obs.observe(div)
    return () => obs.disconnect()
  }, [])

  // Molette et pincement : il faut un écouteur non passif pour empêcher le zoom du navigateur.
  // L'échelle voulue est rejointe en douceur (un quart de l'écart par image) ; un effleurement près de 100 % y revient.
  useEffect(() => {
    const div = racine.current!
    const mac = /Mac|iP(hone|ad)/.test(navigator.platform)
    const vise = { echelle: 0, fixe: point(0, 0), image: 0, depuisCent: false, cumul: 0, correction: 0 as ReturnType<typeof setTimeout> | 0 }
    const rejoindre = () => {
      vise.image = 0
      const c = etat.current.camera
      const ecart = vise.echelle - c.echelle
      const fini = Math.abs(ecart) / vise.echelle < 0.002
      setCamera(cam.echelleAutour(c, fini ? vise.echelle : c.echelle + ecart * 0.25, vise.fixe))
      if (!fini) vise.image = requestAnimationFrame(rejoindre)
    }
    const viser = (echelle: number, fixe: Point) => {
      vise.echelle = echelle
      vise.fixe = fixe
      if (!vise.image) vise.image = requestAnimationFrame(rejoindre)
    }
    // L'inertie d'un défilement ne devient jamais un zoom, ni l'inverse : le mode tient 150 ms après le dernier pas.
    let mode: 'zoom' | 'defiler' | null = null
    let finMode: ReturnType<typeof setTimeout> | undefined
    const molette = (e: WheelEvent) => {
      if (etat.current.edition && dansEdition(div, e.target) && !(e.ctrlKey || e.metaKey)) return
      // Une table plus large que sa colonne défile en largeur sous un geste horizontal, comme chez Milanote.
      const defile = !(e.ctrlKey || e.metaKey) && Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.target instanceof Element ? e.target.closest<HTMLElement>('.notak-tableur[data-colonne] .notak-table-defile') : null
      if (defile && defile.scrollWidth > defile.clientWidth + 1 && mode !== 'zoom') {
        e.preventDefault()
        defile.scrollLeft += e.deltaX
        return
      }
      e.preventDefault()
      animation.current = null
      const { camera: c, vue: v } = etat.current
      mode ??= e.ctrlKey || e.metaKey ? 'zoom' : 'defiler'
      // Un zoom qui démarre pendant un redimensionnement l'annule : les mesures d'avant sont rendues.
      if (mode === 'zoom') annulerRedimRef.current()
      clearTimeout(finMode)
      finMode = setTimeout(() => (mode = null), 150)
      if (mode === 'zoom') {
        // Le pincement du trackpad arrive en Ctrl+molette sur Mac, à petits pas : on le rend trois fois plus vif.
        const pas = e.deltaY * (mac && e.ctrlKey && !e.metaKey ? 3 : 1)
        const depart = vise.image ? vise.echelle : c.echelle
        // Un geste commence quand le précédent s'est tu (100 ms) : on note s'il part de 100 %.
        if (vise.cumul === 0) vise.depuisCent = Math.abs(c.echelle - 1) < 1e-3
        vise.cumul += Math.abs(pas)
        const echelle = gesteZoom.current.appliquer(depart, Math.max(0.1, 1 - pas * 0.0025), cam.echelleMin(contenu(), v), e.timeStamp)
        viser(echelle, cam.pointFixe(echelle, local(e), v))
        clearTimeout(vise.correction || undefined)
        vise.correction = setTimeout(() => {
          // Un geste à peine esquissé depuis 100 % n'en voulait pas : on y revient.
          if (vise.depuisCent && vise.cumul < 50) viser(1, cam.pointFixe(1, point(v.largeur / 2, v.hauteur / 2), v))
          vise.cumul = 0
          vise.correction = 0
        }, 100)
      } else {
        setCamera(cam.defiler(c, -e.deltaX, -e.deltaY))
      }
    }
    div.addEventListener('wheel', molette, { passive: false })
    return () => {
      div.removeEventListener('wheel', molette)
      cancelAnimationFrame(vise.image)
      clearTimeout(finMode)
      clearTimeout(vise.correction || undefined)
    }
  }, [contenu])

  // Au doigt : pincer zoome autour du milieu des deux doigts et les suit ; un appui long décolle l'élément touché pour le
  // déplacer, ou ouvre le menu du clic droit (`appuiLongRef`).
  useEffect(() => {
    const div = racine.current
    if (!div) return
    const doigts = new Map<number, Point>()
    let pince: { ecart: number; milieu: Point; camera: cam.Camera } | null = null
    let appuiLong: { minuteur: ReturnType<typeof setTimeout>; depart: Point } | null = null
    const ici = (e: PointerEvent) => {
      const r = div.getBoundingClientRect()
      return point(e.clientX - r.left, e.clientY - r.top)
    }
    const mesure = () => {
      const [a, b] = [...doigts.values()] as [Point, Point]
      return { ecart: Math.hypot(a.x - b.x, a.y - b.y), milieu: point((a.x + b.x) / 2, (a.y + b.y) / 2) }
    }
    const lacherAppuiLong = () => {
      if (appuiLong) clearTimeout(appuiLong.minuteur)
      appuiLong = null
    }
    const appui = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      doigts.set(e.pointerId, ici(e))
      if (doigts.size === 1) {
        const { clientX, clientY, target, pointerId } = e
        appuiLong = {
          depart: ici(e),
          minuteur: setTimeout(() => {
            appuiLong = null
            appuiLongRef.current({ clientX, clientY, target, pointerId })
          }, APPUI_LONG),
        }
      } else if (doigts.size === 2) {
        // Un second doigt change le geste en pincement : ce que le premier avait commencé s'arrête là.
        lacherAppuiLong()
        annulerRedimRef.current()
        geste.current = null
        setEnGeste(false)
        setZoneLasso(null)
        animation.current = null
        pince = { ...mesure(), camera: etat.current.camera }
        e.stopPropagation()
      }
    }
    const mouvement = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !doigts.has(e.pointerId)) return
      doigts.set(e.pointerId, ici(e))
      if (appuiLong && Math.hypot(ici(e).x - appuiLong.depart.x, ici(e).y - appuiLong.depart.y) > 8) lacherAppuiLong()
      if (!pince || doigts.size < 2) return
      e.stopPropagation()
      const { ecart, milieu } = mesure()
      const { vue: v } = etat.current
      const echelle = Math.min(cam.ECHELLE_MAX, Math.max(cam.echelleMin(contenu(), v), (pince.camera.echelle * ecart) / Math.max(1, pince.ecart)))
      const zoomee = cam.echelleAutour(pince.camera, echelle, pince.milieu)
      setCamera(cam.defiler(zoomee, milieu.x - pince.milieu.x, milieu.y - pince.milieu.y))
    }
    const fin = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      doigts.delete(e.pointerId)
      lacherAppuiLong()
      if (doigts.size < 2) pince = null
    }
    div.addEventListener('pointerdown', appui)
    div.addEventListener('pointermove', mouvement)
    div.addEventListener('pointerup', fin)
    div.addEventListener('pointercancel', fin)
    return () => {
      lacherAppuiLong()
      div.removeEventListener('pointerdown', appui)
      div.removeEventListener('pointermove', mouvement)
      div.removeEventListener('pointerup', fin)
      div.removeEventListener('pointercancel', fin)
    }
  }, [contenu])

  // Copier, couper, coller sur la toile, hors édition.
  useEffect(() => {
    const actif = () => document.activeElement === racine.current && !etat.current.edition
    const coller = (e: ClipboardEvent) => {
      if (!actif() || !e.clipboardData) return
      e.preventDefault()
      const brut = e.clipboardData.getData(TYPE_PAQUET)
      let p: Paquet | null = null
      try {
        p = brut ? (JSON.parse(brut) as Paquet) : null
      } catch {
        p = null
      }
      if (p) {
        const choisie = etat.current.selection.size === 1 ? etat.current.magasin.lire().elements.find((x) => etat.current.selection.has(x.id)) : undefined
        if (choisie?.contenu.type === 'colonne' && collerDansColonne(p, choisie)) return
        return collerSurSelection(p) || collerPaquet(p)
      }
      // Du texte collé sur une ligne seule choisie devient son libellé (400 caractères au plus, tel quel).
      const texte = e.clipboardData.getData('text/plain')
      const choisie = etat.current.selection.size === 1 ? etat.current.magasin.lire().elements.find((x) => x.id === [...etat.current.selection][0]) : undefined
      if (texte.trim() && e.clipboardData.files.length === 0 && choisie?.contenu.type === 'ligne' && !choisie.verrou && !etat.current.services.lectureSeule) {
        const { libelleMasque: _m, ...sans } = choisie.contenu
        return etat.current.magasin.faire([{ type: 'contenu', id: choisie.id, avant: choisie.contenu, apres: { ...sans, libelle: texte.slice(0, 400) } }])
      }
      // Du texte collé sur une image seule choisie en devient la légende.
      if (texte.trim() && e.clipboardData.files.length === 0 && choisie?.contenu.type === 'image' && !choisie.verrou && !etat.current.services.lectureSeule) {
        return etat.current.magasin.faire([{ type: 'contenu', id: choisie.id, avant: choisie.contenu, apres: avecLegende(choisie.contenu, texte) }])
      }
      void recevoir(e.clipboardData, contexte.centreVue())
    }
    const copier = (couper: boolean) => (e: ClipboardEvent) => {
      if (!actif() || !e.clipboardData || etat.current.selection.size === 0) return
      const p = empaqueter(etat.current.magasin.lire(), etat.current.selection, rect)
      if (!p) return
      e.preventDefault()
      // Couper ne jette rien : le paquet porte une marque, ce qui est coupé se masque jusqu'au collage.
      const coupable = couper && !etat.current.services.lectureSeule
      const cle = coupable ? nouvelId() : undefined
      const emporte = cle ? { ...p, coupe: cle } : p
      if (coupe) libererCoupe()
      retenirPaquet(emporte)
      e.clipboardData.setData(TYPE_PAQUET, JSON.stringify(emporte))
      e.clipboardData.setData('text/plain', texteDuPaquet(emporte))
      if (cle) {
        poserCoupe({ cle, magasin: etat.current.magasin, ids: new Set(emporte.elements.map((x) => x.id)) })
        setSelection(new Set())
      }
    }
    const surCopie = copier(false)
    const surCoupe = copier(true)
    document.addEventListener('paste', coller)
    document.addEventListener('copy', surCopie)
    document.addEventListener('cut', surCoupe)
    return () => {
      document.removeEventListener('paste', coller)
      document.removeEventListener('copy', surCopie)
      document.removeEventListener('cut', surCoupe)
    }
  })

  /** Un paquet collé sur des éléments choisis qui le prennent (des tâches sur une liste) : vrai s'ils l'ont pris. */
  const collerSurSelection = (p: Paquet): boolean => {
    if (lectureSeule || etat.current.selection.size === 0) return false
    const choisis = magasin.lire().elements.filter((x) => etat.current.selection.has(x.id) && !x.verrou)
    for (const c of tousLesCollages()) {
      const pas = c(p, choisis, contexte)
      if (!pas || pas.length === 0) continue
      magasin.faire(pas)
      return true
    }
    return false
  }

  /** Colle un paquet : à `ou` s'il est dit (le menu), sinon décalé de l'original s'il est en vue, ou au centre. */
  const collerPaquet = (p: Paquet, ou?: Point) => {
    if (lectureSeule) return
    const n = (copie.paquet === p || JSON.stringify(copie.paquet) === JSON.stringify(p) ? copie.collages : 0) + 1
    retenirPaquet(p)
    copie.collages = n
    const vueUG = { min: cam.versTableau(camera, point(0, 0)), max: cam.versTableau(camera, point(vue.largeur, vue.hauteur)) }
    const enVue = p.tableau === tableau.id && chevauche(vueUG, p.cadre)
    const d = ou ? point(Math.round(ou.x - p.cadre.min.x), Math.round(ou.y - p.cadre.min.y)) : decalageDeCollage(p, enVue, n, contexte.centreVue())
    if (p.coupe && coupe?.cle === p.coupe && coupe.magasin === magasin) return deplacerCoupe(p, d)
    const neufs = deballer(p, d)
    magasin.faire(neufs.map((element): Operation => ({ type: 'creer', element })))
    setSelection(new Set(neufs.filter((x) => !x.parent).map((x) => x.id)))
    finirCoupe(p)
  }

  /** Le collage d'un paquet coupé ailleurs : les originaux, masqués dans leur tableau, en sont retirés pour de bon. */
  const finirCoupe = (p: Paquet) => {
    const c = coupe
    if (!p.coupe || c?.cle !== p.coupe) return
    if (c.magasin !== magasin) {
      const source = c.magasin.lire()
      c.magasin.faire(source.elements.filter((x) => c.ids.has(x.id)).map((element): Operation => ({ type: 'supprimer', element })))
    }
    libererCoupe()
  }

  /**
   * Coller ce qu'on a coupé dans le même tableau : les mêmes éléments (mêmes identifiants, mêmes liens) changent de
   * place, décalés de `d` UG ; `colonne` les range en tête de cette colonne.
   */
  const deplacerCoupe = (p: Paquet, d: Point, colonne?: Element) => {
    const t = magasin.lire()
    const racines = p.elements.filter((x) => !x.parent && x.contenu.type !== 'ligne')
    const actuels = racines.flatMap((x) => t.elements.find((y) => y.id === x.id) ?? [])
    let tete: string | undefined
    if (colonne) {
      const premier = t.elements.filter((x) => x.parent === colonne.id && !coupe!.ids.has(x.id)).sort((a, b) => comparerOrdre(a.ordre, b.ordre))[0]
      tete = premier?.ordre
    }
    let avant: string | undefined
    const pas: Operation[] = actuels.map((e): Operation => {
      if (colonne) return { type: 'ranger', id: e.id, de: placeDe(e), vers: { x: colonne.x, y: colonne.y, parent: colonne.id, ordre: (avant = cleEntre(avant, tete)) } }
      const [x, y] = aimanter(point(e.x + d.x, e.y + d.y))
      return { type: 'ranger', id: e.id, de: placeDe(e), vers: { x, y } }
    })
    // Une ligne coupée avec ses éléments suit ses bouts accrochés ; ses bouts libres se décalent comme eux.
    if (!colonne) {
      for (const l of p.elements) {
        const actuelle = l.contenu.type === 'ligne' ? t.elements.find((y) => y.id === l.id) : undefined
        if (!actuelle || actuelle.contenu.type !== 'ligne') continue
        const bout = (x: Extremite): Extremite => ('element' in x ? x : { x: x.x + d.x, y: x.y + d.y })
        pas.push({ type: 'contenu', id: l.id, avant: actuelle.contenu, apres: { ...actuelle.contenu, depart: bout(actuelle.contenu.depart), arrivee: bout(actuelle.contenu.arrivee) } })
      }
    }
    libererCoupe()
    if (pas.length > 0) magasin.faire(pas)
    if (!colonne) setSelection(new Set(actuels.map((x) => x.id)))
  }

  /** Colle un paquet dans une colonne, en tête, si tout peut y entrer ; la sélection ne change pas. */
  const collerDansColonne = (p: Paquet, colonne: Element) => {
    const def = definition(colonne.contenu.type)
    if (lectureSeule || !def?.accepte) return false
    if (p.coupe && coupe?.cle === p.coupe && coupe.magasin === magasin) {
      const entrants = p.elements.filter((x) => !x.parent && x.contenu.type !== 'ligne' && x.id !== colonne.id)
      if (entrants.length === 0 || !entrants.every((x) => def.accepte!(x, colonne))) return false
      deplacerCoupe(p, point(0, 0), colonne)
      return true
    }
    const neufs = deballer(p, point(0, 0))
    const racines = neufs.filter((x) => !x.parent)
    if (racines.length === 0 || !racines.every((x) => def.accepte!(x, colonne))) return false
    const tete = magasin.lire().elements.filter((x) => x.parent === colonne.id).sort((a, b) => comparerOrdre(a.ordre, b.ordre))[0]
    let avant: string | undefined
    const rangs = new Map(racines.map((x) => [x.id, (avant = cleEntre(avant, tete?.ordre))] as const))
    retenirPaquet(p)
    magasin.faire(neufs.map((element): Operation => ({ type: 'creer', element: rangs.has(element.id) ? { ...element, parent: colonne.id, ordre: rangs.get(element.id)! } : element })))
    finirCoupe(p)
    return true
  }

  /** Cmd+D : une copie à 2 UG en bas à droite ; dans une colonne, juste après l'original. */
  const dupliquer = () => {
    const t = magasin.lire()
    const p = empaqueter(t, selection, rect)
    if (!p) return
    const neufs = deballer(p, point(2, 2))
    const originaux = new Map(p.elements.map((e, i) => [neufs[i]!.id, e]))
    const ranges = neufs.map((n) => {
      const o = originaux.get(n.id)!
      const avant = t.elements.find((x) => x.id === o.id)
      if (n.parent || !avant?.parent || !selection.has(avant.id)) return n
      // Tiré d'une colonne : la copie reste dans la colonne, juste après lui.
      const freres = t.elements.filter((x) => x.parent === avant.parent).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
      const suivant = freres[freres.findIndex((x) => x.id === avant.id) + 1]
      return { ...n, parent: avant.parent, ordre: cleEntre(avant.ordre, suivant?.ordre) }
    })
    magasin.faire(ranges.map((element): Operation => ({ type: 'creer', element })))
    setSelection(new Set(ranges.filter((x) => !x.parent || selection.has(originaux.get(x.id)!.id)).map((x) => x.id)))
  }

  /** Envoie ces éléments dans un autre tableau (avec le contenu des colonnes et les lignes entre eux). */
  const envoyerDans = (cibleTableau: Id, ids: Id[]): Map<Id, Id | undefined> | undefined => {
    const t = magasin.lire()
    const p = empaqueter(t, ids, rect)
    if (!p || !services.deposerDans) return
    const neufs = services.deposerDans(cibleTableau, p.elements.map((x) => ({ ...x }))) ?? []
    // Le déplacement n'entre pas dans l'historique : l'annuler ici laisserait un double là-bas.
    const partis = new Set(p.elements.map((x) => x.id))
    const lignesOrphelines = avecLiees(t.elements.filter((x) => partis.has(x.id)), t).filter((x) => !partis.has(x.id))
    magasin.appliquerSeulement(
      [...t.elements.filter((x) => partis.has(x.id) || (x.parent && partis.has(x.parent))), ...lignesOrphelines].map(
        (element): Operation => ({ type: 'supprimer', element }),
      ),
    )
    return new Map(p.elements.map((x, i) => [x.id, neufs[i]?.id]))
  }
  /** Le glisser entre dans le tableau survolé : ce qu'on glisse y part, et le geste reprend dans sa toile. */
  const entrerEnGlissant = (id: Id) => {
    oublierEntree()
    const g = geste.current
    const ptr = dernierPointeur.current
    if (g?.type !== 'glisser' || !g.demarre || !ptr || !services.ouvrirTableau) return
    const ici = cam.versTableau(camera, local({ clientX: ptr.ecran.x, clientY: ptr.ecran.y }))
    // Ce qu'on glisse, là où on le voit, par rapport au pointeur.
    const ids = [...g.origines.keys()]
    const decalages = ids.map((x) => {
      const o = g.origines.get(x)!
      return point(o.pos.x + g.d.x - ici.x, o.pos.y + g.d.y - ici.y)
    })
    g.envol?.arreter()
    for (const v of g.vols) {
      const n = noeudDe(v)
      if (n) oublierVol(n)
    }
    magasin.appliquerSeulement(g.sorties.toReversed().map(inverse))
    geste.current = null
    if (tableauVise.current) delete tableauVise.current.noeud.dataset.survolDepot
    tableauVise.current = null
    cible.current = null
    setTrait(null)
    setGlisses(null)
    setEmpreintes(AUCUNE)
    setEnGeste(false)
    const neufs = envoyerDans(id, ids)
    const suite = ids.flatMap((x, i) => {
      const n = neufs?.get(x)
      return n ? [{ id: n, decalage: decalages[i]! }] : []
    })
    relais = { tableau: id, ids: suite.map((x) => x.id), decalages: suite.map((x) => x.decalage), pointeur: ptr.id, ecran: ptr.ecran }
    services.ouvrirTableau(id)
  }

  // Arrivé par un glisser entré au survol : on reprend le geste, ce qu'on glisse sous le pointeur.
  useLayoutEffect(() => {
    const r = relais
    if (!r || r.tableau !== tableau.id || !racine.current) return
    relais = null
    const ici = cam.versTableau(camera, local({ clientX: r.ecran.x, clientY: r.ecran.y }))
    const pas: Operation[] = []
    const origines = new Map<Id, { place: Deplace['de']; pos: Point }>()
    r.ids.forEach((x, i) => {
      const el = magasin.lire().elements.find((y) => y.id === x)
      if (!el) return
      const [vx, vy] = aimanter(point(ici.x + r.decalages[i]!.x, ici.y + r.decalages[i]!.y))
      pas.push({ type: 'deplacer', id: x, de: [el.x, el.y], vers: [vx, vy] })
      origines.set(x, { place: { ...placeDe(el), x: vx, y: vy }, pos: point(vx, vy) })
    })
    if (origines.size === 0) return
    magasin.appliquerSeulement(pas)
    const ids = [...origines.keys()]
    const choisis = magasin.lire().elements.filter((x) => origines.has(x.id))
    const g: Extract<Geste, { type: 'glisser' }> = {
      type: 'glisser',
      depart: ici,
      ecran: r.ecran,
      demarre: true,
      origines,
      axe: null,
      d: point(0, 0),
      vols: ids,
      base: point(0, 0),
      sorties: [],
      enchaine: true,
    }
    g.envol = new Envol(reglageVol(choisis, 0), (v) => {
      for (const id of g.vols) {
        const n = noeudDe(id)
        if (n) dessinerSur(n, transformation(v, g.base), v.ombre, reductionVol())
      }
    })
    geste.current = g
    setSelection(new Set(ids))
    setGlisses(new Set(ids))
    setEnGeste(true)
    setBarresGardees(false)
    try {
      racine.current.setPointerCapture(r.pointeur)
    } catch {
      // Le bouton a été relâché pendant le chargement : le geste finira au prochain mouvement.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableau.id])


  const restaurer = (e: Element) => {
    complet.faire([{ type: 'ranger', id: e.id, de: placeDe(e), vers: { x: e.x, y: e.y } }])
    magasin.remplacer(auPremierPlan(magasin.lire(), [e.id]))
    setSelection(new Set([e.id]))
  }

  const collerStyle = () => {
    const source = copie.paquet?.elements[0]
    if (!source || selection.size === 0) return
    const defSource = definition(source.contenu.type)
    const couleur = defSource?.couleur?.lire(source as never, contexte)
    const pas: Operation[] = []
    for (const e of choisis()) {
      if (e.verrou) continue
      // D'une ligne à une autre, tout le style passe : couleur, pointes, trait et épaisseur.
      if (source.contenu.type === 'ligne' && e.contenu.type === 'ligne') {
        const { couleur: _c, fond: _f, ...nu } = e.contenu
        const s = source.contenu
        const apres: Ligne = {
          ...nu,
          pointeDepart: s.pointeDepart,
          pointeArrivee: s.pointeArrivee,
          trait: s.trait,
          epaisseur: s.epaisseur,
          ...(s.couleur ? { couleur: s.couleur } : {}),
          ...(s.fond ? { fond: s.fond } : {}),
        }
        if (JSON.stringify(apres) !== JSON.stringify(e.contenu)) pas.push({ type: 'contenu', id: e.id, avant: e.contenu, apres })
        continue
      }
      const c = definition(e.contenu.type)?.couleur
      if (c?.vers && (couleur !== undefined || defSource?.couleur?.vers)) {
        const apres = c.vers(e.contenu as never, couleur)
        if (JSON.stringify(apres) !== JSON.stringify(e.contenu)) pas.push({ type: 'contenu', id: e.id, avant: e.contenu, apres })
      } else if (couleur && c?.ailleurs) c.ailleurs(e as never, couleur, contexte)
      if (e.contenu.type === source.contenu.type && !e.parent && e.largeur !== source.largeur)
        pas.push({ type: 'redimensionner', id: e.id, de: e.largeur, vers: source.largeur })
    }
    if (pas.length > 0) magasin.faire(pas)
    annoncer({ texte: t('toile.styleColle') })
  }

  /** Un élément des non triés prend sa place sur la toile, à `ou` (son coin haut gauche, en UG). */
  const poserNonTrie = (id: Id, ou: Point) => {
    const e = complet.lire().elements.find((x) => x.id === id)
    if (!e || e.nonTrie === undefined) return
    const [x, y] = aimanter(ou)
    complet.faire([{ type: 'ranger', id, de: placeDe(e), vers: { x, y } }])
    magasin.remplacer(auPremierPlan(magasin.lire(), [id]))
    setSelection(new Set([id]))
  }

  const viderCorbeille = () => {
    const t = complet.lire()
    const jetes = new Set(aLaCorbeille(t).map((e) => e.id))
    const partants = t.elements.filter((e) => jetes.has(e.id) || (e.parent && jetes.has(e.parent)))
    complet.faire(partants.map((element): Operation => ({ type: 'supprimer', element })))
  }

  /** Premier plan, arrière-plan : `cran` d'un cran parmi ce qui chevauche, sinon tout devant ou tout derrière. */
  const changerPlan = (sens: 'haut' | 'bas', cran: boolean) => {
    const t = magasin.lire()
    if (!cran) return magasin.remplacer(sens === 'haut' ? auPremierPlan(t, selection) : auDernierPlan(t, selection))
    const zones = [...selection].flatMap((id) => rect(id) ?? [])
    const touches = new Set(
      t.elements.filter((x) => !selection.has(x.id) && libre(x)).flatMap((x) => {
        const r = rect(x.id)
        return r && zones.some((z) => chevauche(z, r)) ? [x.id] : []
      }),
    )
    magasin.remplacer(dUnCran(t, selection, touches, sens))
  }

  const verrouiller = (verrou: boolean) =>
    magasin.faire(choisis().filter((x) => !!x.verrou !== verrou).map((x): Operation => ({ type: 'verrouiller', id: x.id, de: !verrou, vers: verrou })))

  /** Poser l'arrière-plan du tableau (`undefined` : celui d'origine), d'un geste qu'on peut annuler. */
  const poserFond = (vers: Fond | undefined) => {
    const range = vers && fondRange(vers)
    if (JSON.stringify(range) === JSON.stringify(toutLeTableau.fond)) return
    complet.faire([{ type: 'fond', de: toutLeTableau.fond, vers: range }])
  }
  const selecteurFond = useRef<HTMLInputElement | null>(null)
  /** Le sélecteur natif de couleur : le fond suit le choix en direct, et se pose quand on le ferme. */
  const choisirFondLibre = () => {
    selecteurFond.current?.remove()
    const actuel = toutLeTableau.fond
    const champ = document.createElement('input')
    champ.type = 'color'
    champ.value = estLibre(actuel?.couleur) ? actuel.couleur : CANEVAS.gris.clair
    champ.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
    champ.addEventListener('input', () => setApercuFond({ ...actuel, couleur: champ.value }))
    champ.addEventListener('change', () => {
      poserFond({ ...actuel, couleur: champ.value })
      setApercuFond(null)
      champ.remove()
    })
    document.body.appendChild(champ)
    selecteurFond.current = champ
    champ.click()
  }
  useEffect(() => () => selecteurFond.current?.remove(), [])
  /** « Changer l'arrière-plan » : les couleurs du canevas, une couleur libre, la grille de points, le retour au défaut. */
  const sousMenuFond = (): Entree[] => {
    const fond = toutLeTableau.fond
    const sombre = racine.current?.closest('.notak-espace')?.getAttribute('data-theme') === 'sombre'
    const nomme = estNomme(fond?.couleur) ? fond.couleur : estLibre(fond?.couleur) ? null : 'gris'
    return [
      ...NOMS_CANEVAS.map((n) => ({
        libelle: t(`fond.${n}`),
        pastille: CANEVAS[n][sombre ? 'sombre' : 'clair'],
        coche: nomme === n,
        faire: () => poserFond({ ...fond, couleur: n === 'gris' ? undefined : n }),
      })),
      null,
      { libelle: t('fond.personnalisee'), icone: 'pipette' as const, coche: estLibre(fond?.couleur), faire: choisirFondLibre },
      { libelle: t('fond.grille'), icone: 'diese' as const, coche: pointsAllumes(fond), reste: true, faire: () => poserFond({ ...fond, points: !pointsAllumes(fond) }) },
      ...(fondParDefaut(fond) ? [] : [null, { libelle: t('fond.retablir'), icone: 'annuler' as const, faire: () => poserFond(undefined) }]),
    ]
  }

  const entreesMenu = (): Entree[] => {
    if (!menu) return []
    const ou = menu.ou
    const avecPaquet = !lectureSeule && copie.paquet ? [{ libelle: t('toile.coller'), icone: 'menuColler' as const, raccourci: '⌘V', faire: () => collerPaquet(copie.paquet!, ou) }] : []
    if (!menu.surElement) {
      // Milanote ne propose ici que huit créations ; les autres se prennent dans la barre. Un commentateur, qui
      // n'a pas la barre, peut encore y poser un fil.
      const creer = (
        lectureSeule
          ? peutCommenter(services)
            ? outilsDeBarre().filter((o) => o.outil.fantome().contenu.type === 'commentaire')
            : []
          : outilsDeBarre().filter((o) => o.outil.groupe !== 'action' && TYPES_DU_MENU.has(o.outil.fantome().contenu.type))
      ).map((o) => ({
            libelle: o.outil.libelle,
            icone: ICONES_CREATION[o.outil.fantome().contenu.type] ?? ('ajouter' as const),
            faire: () => {
              const pas = o.outil.creer(point(Math.round(ou.x), Math.round(ou.y)), contexte)
              magasin.faire(pas)
              apresCreation(pas.flatMap((op) => (op.type === 'creer' ? [op.element.id] : [])))
            },
          }))
      // Annuler et Rétablir disparaissent quand il n'y a rien à défaire ; Tout sélectionner, quand la toile est vide.
      return [
        ...avecPaquet,
        null,
        ...(lectureSeule || !magasin.peutAnnuler() ? [] : [{ libelle: t('espace.annuler'), icone: 'annuler' as const, raccourci: '⌘Z', faire: () => void magasin.annuler() }]),
        ...(lectureSeule || !magasin.peutRetablir() ? [] : [{ libelle: t('espace.retablir'), icone: 'retablir' as const, raccourci: '⇧⌘Z', faire: () => void magasin.retablir() }]),
        ...(tableau.elements.length === 0 ? [] : [{ libelle: t('raccourcis.toutSelectionner'), icone: 'menuSelectionner' as const, raccourci: '⌘A', faire: () => setSelection(new Set(tableau.elements.filter((x) => !x.parent).map((x) => x.id))) }]),
        null,
        ...creer,
        ...(lectureSeule ? [] : [null, { libelle: t('fond.changer'), icone: 'palette' as const, faire: () => {}, sous: sousMenuFond() }]),
      ]
    }
    const els = choisis()
    if (lectureSeule) return [{ libelle: t('commun.copier'), icone: 'menuCopier' as const, raccourci: '⌘C', faire: () => document.execCommand('copy') }]
    const verrouilles = els.length > 0 && els.every((x) => x.verrou)
    const seul = els.length === 1 ? els[0] : undefined
    const defSeul = seul && definition(seul.contenu.type)
    // Comme Milanote : le presse-papiers et la suppression d'abord, puis le nom, les entrées des types, le verrou et le plan.
    // « Coller » ne paraît que sur des colonnes (le collage y entre, en tête).
    const colonnes = els.length > 0 && els.every((x) => x.contenu.type === 'colonne')
    const collage = !!copie.paquet && colonnes && seul ? [{ libelle: t('toile.coller'), icone: 'menuColler' as const, raccourci: '⌘V', faire: () => void collerDansColonne(copie.paquet!, seul) }] : []
    const renommable = !!seul && ['colonne', 'document', 'fichier'].includes(seul.contenu.type) && !!defSeul?.editable
    return [
      { libelle: t('toile.couper'), icone: 'menuCouper' as const, raccourci: '⌘X', faire: () => document.execCommand('cut') },
      { libelle: t('commun.copier'), icone: 'menuCopier' as const, raccourci: '⌘C', faire: () => document.execCommand('copy') },
      ...collage,
      ...(copie.paquet ? [{ libelle: t('toile.collerStyle'), icone: 'menuStyleColler' as const, raccourci: '⌥⌘V', faire: collerStyle }] : []),
      { libelle: t('raccourcis.dupliquer'), icone: 'menuDupliquer' as const, raccourci: '⌘D', faire: dupliquer },
      { libelle: t('menu.supprimer'), icone: 'corbeille' as const, danger: true, raccourci: '⌫', faire: () => jeter(selection) },
      null,
      ...(renommable ? [{ libelle: t('menu.renommer'), icone: 'renommer' as const, raccourci: '↩', faire: () => commencerEdition(seul!.id) }] : []),
      null,
      ...toutesLesEntreesMenu()
        .filter((x) => x.visible(els, contexte))
        
        .map((x) => ({ libelle: x.libelle, icone: x.icone, ...(x.raccourci ? { raccourci: x.raccourci } : {}), ...(x.coche ? { coche: x.coche(els, contexte) } : {}), faire: () => x.faire(els, contexte) })),
      null,
      { libelle: t('toile.verrouiller'), icone: 'verrou' as const, coche: verrouilles, reste: true, faire: () => verrouiller(!verrouilles) },
      null,
      { libelle: t('toile.premierPlan'), icone: 'premierPlan' as const, raccourci: '⇧⌘↑', faire: () => changerPlan('haut', false) },
      // Une ligne accrochée à un élément ne passe pas à l'arrière-plan.
      ...(els.some((x) => x.contenu.type === 'ligne' && accroches(x.contenu).length > 0)
        ? []
        : [{ libelle: t('toile.arrierePlan'), icone: 'arrierePlan' as const, raccourci: '⇧⌘↓', faire: () => changerPlan('bas', false) }]),
      // Le propriétaire règle qui peut écrire ou commenter cet élément.
      ...(seul && services.reglerDroitsElement ? [null, { libelle: t('toile.droitsElement'), icone: 'verrou' as const, faire: () => services.reglerDroitsElement!(seul.id) }] : []),
      // Un élément seul dit qui l'a créé et touché, avec l'avatar de la personne (rien si l'on ne sait pas).
      ...(seul ? histoireDe(seul.id) : []),
    ]
  }

  /** Les lignes « Créé par vous… » du menu d'un élément, précédées d'un filet. */
  const histoireDe = (id: Id): Entree[] => {
    const lignes = lignesDeTrace(complet.trace?.(id), services.presence?.moi?.()?.id)
    // La trace garde le profil du moment du geste : la pastille montre la personne telle qu'elle est aujourd'hui.
    return lignes.length === 0
      ? []
      : [
          null,
          ...lignes.map((l) => {
            const p = personneAJour(l.auteur, services)
            const photo = p.photo ? services.adressePhoto?.(p.photo) : undefined
            return { libelle: l.texte, info: { nom: p.nom, ...(p.couleur ? { couleur: p.couleur } : {}), ...(photo ? { photo } : {}) }, faire: () => {} }
          }),
        ]
  }

  // — Le plein écran d'un élément a une adresse (`/t/<tableau>/e/<élément>`) : l'ouvrir l'écrit, l'adresse l'ouvre. —
  const imageGrande = useImageOuverte()
  const fichierGrand = useFichierOuvert()
  const enGrand = useMemo(() => {
    const id = imageGrande ?? fichierGrand ?? (edition ?? null)
    const el = id ? tableau.elements.find((x) => x.id === id) : undefined
    return el && PLEIN_ECRAN.has(el.contenu.type) && (el.id === imageGrande || el.id === fichierGrand || definition(el.contenu.type)?.ouvreAuDoubleClic) ? el.id : null
  }, [imageGrande, fichierGrand, edition, tableau])
  const enGrandRef = useRef<Id | null>(null)
  enGrandRef.current = enGrand
  const annonce = useRef<Id | null>(null)
  useEffect(() => {
    // Seuls les changements sont dits : une toile qui vient de naître ne referme pas l'élément que l'adresse attend.
    if (enGrand === annonce.current) return
    annonce.current = enGrand
    services.pleinEcran?.(enGrand)
  }, [enGrand, services])
  const ouvertParAdresse = useRef<Id | null>(null)
  const adresseElement = services.elementAdresse ?? null
  useEffect(() => {
    // Retour du navigateur : l'élément ouvert en grand se referme.
    if (adresseElement || !enGrandRef.current || annonce.current !== enGrandRef.current) return
    const id = enGrandRef.current
    ouvertParAdresse.current = null
    annonce.current = null
    const type = etat.current.magasin.lire().elements.find((x) => x.id === id)?.contenu.type
    if (type === 'image') ouvrirImage(null)
    else if (type === 'fichier') ouvrirFenetreFichier(null)
    else finirEdition()
  }, [adresseElement])
  useEffect(() => {
    // L'adresse nomme un élément : il est choisi et ouvert une seule fois, dès que le tableau l'a.
    if (!adresseElement) {
      ouvertParAdresse.current = null
      return
    }
    if (ouvertParAdresse.current === adresseElement || lectureSeule) return
    const el = tableau.elements.find((x) => x.id === adresseElement)
    if (!el) return
    ouvertParAdresse.current = adresseElement
    if (!PLEIN_ECRAN.has(el.contenu.type)) return
    annonce.current = adresseElement
    setSelection(new Set([el.id]))
    definition(el.contenu.type)?.ouvrir?.(el, contexte)
  }, [adresseElement, tableau, contexte, lectureSeule])
  // Espace referme l'image ou le fichier ouvert en grand.
  useEffect(() => {
    if (!imageGrande && !fichierGrand) return
    const touche = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat || (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)))) return
      e.preventDefault()
      ouvrirImage(null)
      ouvrirFenetreFichier(null)
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [imageGrande, fichierGrand])

  const trouves = useMemo(
    () => (requete ? chercher(tableau.elements, requete, (id) => services.tableau?.(id)?.titre) : []),
    [tableau, requete, services],
  )
  // Ce qui ne correspond pas s'efface à moitié, le temps de la recherche.
  useLayoutEffect(() => {
    const div = racine.current
    if (!div) return
    // Une colonne qui contient un résultat reste nette : son contenu s'effacerait avec elle.
    const gardes = requete ? new Set(trouves.flatMap((x) => (x.parent ? [x.id, x.parent] : [x.id]))) : null
    ouvrirPourRecherche(requete?.trim() ? trouves.flatMap((x) => (x.parent ? [x.parent] : [])) : [])
    for (const n of div.querySelectorAll<HTMLElement | SVGElement>('[data-id]')) {
      const id = n.getAttribute('data-id')!
      if (gardes && requete!.trim() && !gardes.has(id)) n.dataset.horsRecherche = ''
      else delete n.dataset.horsRecherche
      // Les étiquettes de ligne trouvées se mettent en valeur.
      if (gardes && requete!.trim() && gardes.has(id)) n.dataset.trouve = ''
      else delete n.dataset.trouve
    }
  })
  /** Montre le résultat suivant (ou précédent) : il est choisi, et la vue s'y centre. */
  const allerAuTrouve = (sens: 1 | -1) => {
    if (trouves.length === 0) return
    const r = (((rangTrouve < 0 && sens < 0 ? 0 : rangTrouve + sens) % trouves.length) + trouves.length) % trouves.length
    setRangTrouve(r)
    const el = trouves[r]!
    setSelection(new Set([el.id]))
    const zone = rect(el.id)
    if (zone) lancerAnimation(cam.centree(centre(zone), camera.echelle, vue))
  }
  const fermerRecherche = () => {
    setRequete(null)
    setRangTrouve(-1)
    racine.current?.focus()
  }

  /** Choisit un élément et y centre la vue (le contexte l'appelle par `montrerCourant`, toujours à jour). */
  montrerCourant.current = (id) => {
    setSelection(new Set([id]))
    const zone = rect(id) ?? zoneRangee(id)
    if (zone) lancerAnimation(cam.centree(centre(zone), camera.echelle, vue))
  }
  /**
   * Hors de l'écran, un élément n'est pas dessiné, donc pas mesuré : sa place rangée suffit pour y aller (celle de sa
   * colonne s'il est dedans), avec une hauteur de carte ordinaire.
   */
  const zoneRangee = (id: Id): Rect | null => {
    const tous = etat.current.tableau.elements
    let e = tous.find((x) => x.id === id)
    for (let n = 0; e?.parent && n < 10; n++) e = tous.find((x) => x.id === e!.parent)
    return e ? { min: point(e.x, e.y), max: point(e.x + e.largeur, e.y + 8) } : null
  }

  /**
   * Une demande venue d'ailleurs (« Afficher dans sa toile » ou « Voir » dans la bibliothèque) : on arrive sur une toile,
   * glisser depuis l'ancienne vue n'apprendrait rien et saccaderait pendant le chargement. Dès que l'élément est là,
   * la vue se pose sur lui, il se choisit, et son cadre bat une fois. Hors de l'écran, il n'est pas encore dessiné : on
   * vise sa place rangée, puis on corrige au pixel au rendu suivant, avant que l'écran ne le montre. L'id d'une toile
   * vise sa carte ici.
   */
  const arrivee = useRef<Id | null>(null)
  useLayoutEffect(() => {
    if (vue.largeur <= 1) return
    const poser = (zone: Rect) => {
      const juste = cam.centree(centre(zone), camera.echelle, vue)
      if (Math.abs(juste.origine.x - camera.origine.x) + Math.abs(juste.origine.y - camera.origine.y) > 0.01) setCamera(juste)
    }
    const battre = (id: Id) => {
      const noeud = racine.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
      if (!noeud) return
      noeud.dataset.arrivee = ''
      setTimeout(() => delete noeud.dataset.arrivee, 900)
    }
    if (arrivee.current) {
      const zone = rect(arrivee.current)
      if (!zone) return
      poser(zone)
      battre(arrivee.current)
      arrivee.current = null
      return
    }
    const d = montrerDemande()
    if (!d) return
    const vise = magasin
      .lire()
      .elements.find((x) => x.corbeille === undefined && (x.id === d || (x.contenu.type === 'tableau' && x.contenu.cible === d && !x.contenu.raccourci)))
    if (!vise || !prendreDemande(d)) return
    animation.current = null
    setSelection(new Set([vise.id]))
    const zone = rect(vise.id)
    if (zone) {
      poser(zone)
      battre(vise.id)
    } else {
      arrivee.current = vise.id
      const estimee = zoneRangee(vise.id)
      if (estimee) poser(estimee)
    }
  })

  const lancerAnimation = (cible: cam.Camera) => {
    animation.current = { depart: camera, cible, debut: performance.now() }
    setAnime(true)
    const pas = (t: number) => {
      const a = animation.current
      if (!a) return setAnime(false)
      const { camera: c, fini } = cam.animer(a.depart, a.cible, t - a.debut, etat.current.vue)
      setCamera(c)
      if (fini) {
        animation.current = null
        setAnime(false)
      } else requestAnimationFrame(pas)
    }
    requestAnimationFrame(pas)
  }

  const ajuster = () => {
    const cible = cam.ajuster(contenu(), vue)
    if (!cible) return
    lancerAnimation(cam.revenirA100(camera.echelle, cible.echelle) ? cam.centree(cam.centreCamera(camera, vue), 1, vue) : cible)
  }

  const zoomerVers = (echelle: number) => {
    animation.current = null
    setCamera(cam.echelleAutour(camera, echelle, point(vue.largeur / 2, vue.hauteur / 2)))
  }

  const choisis = () => tableau.elements.filter((e) => selection.has(e.id))

  const deplacer = (dx: number, dy: number) =>
    magasin.faire(
      choisis()
        .filter(libre)
        .map((e) => ({ type: 'deplacer', id: e.id, de: [e.x, e.y], vers: [e.x + dx, e.y + dy] })),
    )

  /** Dans une colonne, les flèches font monter ou descendre d'un rang ce qui est choisi. */
  const reordonner = (colonne: Id, sens: -1 | 1) => {
    const freres = tableau.elements.filter((x) => x.parent === colonne).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
    const choisisIci = freres.filter((x) => selection.has(x.id))
    const autres = freres.filter((x) => !selection.has(x.id))
    const premier = freres.indexOf(choisisIci[0]!)
    // La place du groupe parmi les autres, décalée d'un cran.
    const avant = freres.slice(0, premier).filter((x) => !selection.has(x.id)).length
    const ou = Math.max(0, Math.min(autres.length, avant + sens))
    if (ou === avant) return
    const cles = clesEntre(autres[ou - 1]?.ordre, autres[ou]?.ordre, choisisIci.length)
    magasin.faire(
      choisisIci.map((x, i): Operation => ({ type: 'ranger', id: x.id, de: placeDe(x), vers: { ...placeDe(x), ordre: cles[i]! } })),
    )
  }

  const clavier = (e: React.KeyboardEvent) => {
    // DESSIN-LIBRE : le clavier appartient à la couche de dessin (Suppr, flèches, Cmd+Z n'agissent plus sur le tableau).
    if (toileSuspendue(racine.current)) return
    if (e.key === 'Escape' && annulerGlisser()) return e.preventDefault()
    const cmd = e.metaKey || e.ctrlKey
    const touche = e.key.toLowerCase()
    const min = cam.echelleMin(contenu(), vue)
    if (cmd && (e.key === '=' || e.key === '+' || e.code === 'Equal')) {
      e.preventDefault()
      return zoomerVers(cam.cranDessus(camera.echelle, min))
    }
    if (cmd && (e.key === '-' || e.code === 'Minus')) {
      e.preventDefault()
      return zoomerVers(cam.cranDessous(camera.echelle, min))
    }
    if (cmd && (e.key === '0' || e.code === 'Digit0')) {
      e.preventDefault()
      return zoomerVers(1)
    }
    // Pendant l'écriture, le clavier appartient à l'éditeur, sauf Échap qui en sort.
    if (edition) {
      if (e.key === 'Escape') {
        e.preventDefault()
        finirEdition()
      }
      return
    }
    // Un bouton de la barre garde le focus après un clic : le reste du clavier revient quand même à la toile.
    const surBouton = e.target instanceof HTMLButtonElement && e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Tab'
    // Une table dont des cellules sont choisies tient le clavier sur un nœud à elle : ce qu'elle ne prend pas revient ici.
    const surTable = e.target instanceof HTMLElement && e.target.hasAttribute('data-table-clavier')
    if (e.target !== racine.current && !surBouton && !surTable) return
    if (cmd && touche === 'f') {
      e.preventDefault()
      setRequete((r) => r ?? '')
      return setAppelRecherche((n) => n + 1)
    }
    for (const r of lectureSeule ? [] : tousLesRaccourcis()) {
      if (r(e.nativeEvent, contexte)) return e.preventDefault()
    }

    if (lectureSeule) {
      if (cmd && touche === 'a') {
        e.preventDefault()
        return setSelection(new Set(tableau.elements.filter((x) => !x.parent).map((x) => x.id)))
      }
      if (e.key === 'Escape') return setSelection(new Set())
      if (!cmd && touche === 'z' && !e.repeat) ajuster()
      return
    }
    // Cmd+Alt+V : le style de l'élément copié (sa couleur, sa largeur pour un même type) passe à la sélection.
    if (cmd && e.altKey && e.code === 'KeyV') {
      e.preventDefault()
      return collerStyle()
    }
    // Les non triés : Cmd+\ ouvre le panneau, Alt+` y met la sélection (`code`, car Alt change `key` sur Mac).
    if (cmd && e.code === 'Backslash') {
      e.preventDefault()
      return setNonTriesOuvert((o) => !o)
    }
    if (e.altKey && !cmd && e.code === 'Backquote' && selection.size > 0) {
      e.preventDefault()
      return ecarter(selection, 'nonTrie')
    }
    if (cmd && touche === 'z') {
      e.preventDefault()
      if (e.shiftKey) return void (magasin.retablir() || services.retablirNavigation?.())
      libererCoupe()
      return void (magasin.annuler() || services.annulerNavigation?.())
    }
    if (cmd && touche === 'y') {
      e.preventDefault()
      return void (magasin.retablir() || services.retablirNavigation?.())
    }
    if (cmd && touche === 'a') {
      e.preventDefault()
      // Avec des éléments choisis dans une colonne : toute la colonne ; sinon toute la toile.
      const parents = new Set(choisis().map((x) => x.parent))
      const dans = parents.size === 1 ? [...parents][0] : undefined
      return setSelection(new Set(tableau.elements.filter((x) => x.parent === dans && !prisParUnAutre.has(x.id)).map((x) => x.id)))
    }
    if (cmd && touche === 'd' && !e.shiftKey) {
      e.preventDefault()
      return dupliquer()
    }
    if (cmd && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      return changerPlan(e.key === 'ArrowUp' ? 'haut' : 'bas', true)
    }
    if (cmd && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      if (selection.size === 1) creerSuivant([...selection][0]!, true)
      return
    }
    // Cmd+Retour arrière et Cmd+Suppr mettent aussi à la corbeille.
    if (cmd && (e.key === 'Backspace' || e.key === 'Delete') && selection.size > 0) {
      e.preventDefault()
      return jeter(selection)
    }
    if (e.altKey && !cmd && e.key === 'Enter' && selection.size === 1) {
      // Alt+Entrée sur une colonne choisie : une note neuve en tête.
      const colonne = tableau.elements.find((x) => x.id === [...selection][0])
      if (colonne?.contenu.type === 'colonne' && !lectureSeule) {
        e.preventDefault()
        return noteDansColonne(colonne, null)
      }
    }
    if (cmd) return
    const pas = e.shiftKey ? 5 : 1
    const fleches: Record<string, [number, number]> = {
      ArrowLeft: [-pas, 0],
      ArrowRight: [pas, 0],
      ArrowUp: [0, -pas],
      ArrowDown: [0, pas],
    }
    if (fleches[e.key] && selection.size > 0) {
      e.preventDefault()
      const parents = new Set(choisis().map((x) => x.parent))
      const dans = parents.size === 1 ? [...parents][0] : undefined
      if (dans && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return reordonner(dans, e.key === 'ArrowUp' ? -1 : 1)
      return deplacer(...fleches[e.key]!)
    }
    // Taper sur un élément choisi seul : le type le prend (la légende d'une image, un document qui s'ouvre avec lui).
    if (selection.size === 1 && e.key.length === 1 && !cmd && !e.altKey && !e.ctrlKey && e.key !== ' ' && e.key !== '/') {
      const el = tableau.elements.find((x) => x.id === [...selection][0])
      const frappe = el && !el.verrou ? definition(el.contenu.type)?.surFrappe : undefined
      const pris = el && frappe ? frappe(el as never, e.key, contexte) : false
      if (pris !== false) {
        e.preventDefault()
        if (pris === true) return commencerEdition(el!.id)
        return
      }
    }
    switch (e.key) {
      case '/':
        e.preventDefault()
        return setRaccourcis(true)
      case 'Escape':
        return setSelection(new Set())
      case 'Enter':
        if (selection.size === 1) {
          e.preventDefault()
          const id = [...selection][0]!
          const el = tableau.elements.find((x) => x.id === id)
          const def = el && definition(el.contenu.type)
          if (el?.contenu.type === 'tableau' && !lectureSeule) return demanderRenommage(el.id)
          if (el && def?.surEntree && !lectureSeule && !el.verrou) return def.surEntree(el as never, contexte)
          if (el && def?.entreeOuvre && def.ouvrir) def.ouvrir(el, contexte)
          else commencerEdition(id)
        }
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        return jeter(selection)
      case ' ':
        e.preventDefault()
        if (!e.repeat) espaceBref.current = true
        return setEspace(true)
    }
    if (touche === 'z' && !e.repeat) ajuster()
  }

  /** Le trait d'une ligne, échantillonné sur son tracé SVG, en UG ; `null` s'il n'est pas dessiné. */
  const traceDe = (id: Id): Point[] | null => {
    const n = noeudDe(id)
    const chemin = n instanceof SVGPathElement ? n : n?.querySelector('path')
    const ecran = chemin?.getScreenCTM()
    const o = racine.current?.getBoundingClientRect()
    if (!chemin || !ecran || !o) return null
    const long = chemin.getTotalLength()
    const pas = Math.max(2, Math.min(60, Math.ceil(long / 8)))
    return Array.from({ length: pas + 1 }, (_, i) => {
      const local = chemin.getPointAtLength((long * i) / pas)
      const p = new DOMPoint(local.x, local.y).matrixTransform(ecran)
      return cam.versTableau(camera, point(p.x - o.left, p.y - o.top))
    })
  }

  const noeudDe = (id: Id) => racine.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) ?? null

  /** Arrête net la dépose qui s'anime encore et remet ses éléments à leur place. */
  const arreterDepose = () => {
    const d = depose.current
    depose.current = null
    if (!d) return
    d.envol.arreter()
    for (const id of d.ids) {
      const n = noeudDe(id)
      if (n) oublierVol(n)
    }
  }

  /** Repose ces éléments en douceur, depuis le vol où ils sont jusqu'à `base`, la place où ils sont posés. */
  const reposer = (envol: Envol, ids: Id[]) => {
    depose.current = { envol, ids }
    envol.poser(VOL_REPOS, () => {
      if (depose.current?.envol !== envol) return
      depose.current = null
      for (const id of ids) {
        const n = noeudDe(id)
        if (n) oublierVol(n)
      }
    })
  }

  const surAppuiOutil = (o: OutilDeBarre, e: React.PointerEvent) => {
    if (lectureSeule) return
    if (edition) finirEdition()
    arreterDepose()
    setRebond(null)
    racine.current!.focus({ preventScroll: true })
    geste.current = {
      type: 'outil',
      outil: o,
      fantome: o.outil.fantome(),
      prise: o.outil.prise ?? point(3, 3),
      ecran: local(e),
      coin: local(e),
      demarre: false,
    }
    setEnGeste(true)
    setBarresGardees(false)
    racine.current!.setPointerCapture(e.pointerId)
  }

  const fermerMenu = useCallback(() => setMenu(null), [])
  const ouvrirMenuRef = useRef<(e: React.MouseEvent) => void>(() => {})
  const ouvrirMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (dansEdition(racine.current, e.target)) return
    // En lecture seule, comme Milanote : aucun des deux menus. Un commentateur garde celui de la toile vide, pour y
    // poser un fil.
    const id = sous(document.elementFromPoint(e.clientX, e.clientY))
    if (lectureSeule && (id || !peutCommenter(services))) return
    const p = local(e)
    setMenu({ x: p.x, y: p.y, ou: cam.versTableau(camera, p), surElement: !!id })
  }

  ouvrirMenuRef.current = ouvrirMenu

  /** Espace relâchée sans avoir attrapé la toile : elle ouvre l'élément choisi (un tableau). */
  const relacherEspace = (e: React.KeyboardEvent) => {
    if (e.key !== ' ') return
    setEspace(false)
    const bref = espaceBref.current
    espaceBref.current = false
    if (!bref || edition || selection.size !== 1) return
    const el = tableau.elements.find((x) => selection.has(x.id))
    const ouvrir = el && definition(el.contenu.type)?.ouvrir
    if (el && ouvrir) ouvrir(el, contexte)
  }

  /** Le geste qui glisse les éléments choisis `s`, pris en `ici` (tableau) et `p` (écran). */
  const gesteGlisser = (s: ReadonlySet<Id>, ici: Point, p: Point): Extract<Geste, { type: 'glisser' }> => {
    // Un élément rangé se glisse aussi, sauf si sa colonne est choisie avec lui : il la suit.
    const origines = new Map(
      tableau.elements
        .filter((x) => s.has(x.id) && mobile(x) && !x.verrou && !(x.parent && s.has(x.parent)))
        .map((x) => {
          const r = x.parent ? rect(x.id) : null
          return [x.id, { place: placeDe(x), pos: r ? r.min : point(x.x, x.y) }] as const
        }),
    )
    return { type: 'glisser', depart: ici, ecran: p, demarre: false, origines, axe: null, d: point(0, 0), vols: [], base: point(0, 0), sorties: [] }
  }

  /**
   * Un doigt resté posé : sur un élément qui se déplace, il le décolle (un retour au doigt, l'élément choisi, prêt à
   * suivre) ; relâché sans bouger, ce sera son menu. Ailleurs, le menu du clic droit, tout de suite.
   */
  const appuiLongRef = useRef<(o: { clientX: number; clientY: number; target: EventTarget | null; pointerId?: number }) => void>(() => {})
  appuiLongRef.current = (o) => {
    const g = geste.current
    const id = g?.type === 'attraper' ? g.toucher?.id : null
    const el = id ? tableau.elements.find((x) => x.id === id) : null
    if (el && !lectureSeule && !el.verrou && mobile(el)) {
      const r = racine.current!.getBoundingClientRect()
      const p = point(o.clientX - r.left, o.clientY - r.top)
      const s = new Set([el.id])
      setSelection(s)
      setAttrape(false)
      geste.current = { ...gesteGlisser(s, cam.versTableau(camera, p), p), decolle: o }
      setBarresGardees(true)
      // Décollé, l'élément suit le doigt jusqu'au bout, même si sa carte se redessine ou change de place sous lui.
      if (o.pointerId !== undefined) {
        try {
          racine.current!.setPointerCapture(o.pointerId)
        } catch {
          // Le doigt s'est déjà levé : le relâchement le dira.
        }
      }
      services.vibrer?.()
      return
    }
    geste.current = null
    setEnGeste(false)
    setAttrape(false)
    setZoneLasso(null)
    ouvrirMenuRef.current({ preventDefault() {}, ...o } as unknown as React.MouseEvent)
  }

  const appui = (e: React.PointerEvent) => {
    // DESSIN-LIBRE : la couche de dessin tient le pointeur ; la toile ne capture rien dessous.
    if (toileSuspendue(racine.current)) return
    // En présentation, un clic sur un élément le montre en grand ; le reste de la toile se parcourt.
    if (services.presentation && e.button === 0 && !espace) {
      const id = sous(e.target)
      const n = id ? noeudDe(id) : null
      const el = id ? tableau.elements.find((x) => x.id === id) : null
      if (n && el && definition(el.contenu.type)?.calque !== 'lignes') {
        e.preventDefault()
        return setFocus({ noeud: n, depart: n.getBoundingClientRect() })
      }
    }
    if (dansEdition(racine.current, e.target)) return
    finRedim.current?.()
    if (edition) finirEdition()
    racine.current!.focus({ preventScroll: true })
    setRebond(null)
    const p = local(e)
    const idBrut = sous(e.target)
    const id = idBrut && prisParUnAutre.has(idBrut) ? null : idBrut
    const surPoignee = !!(e.target as HTMLElement).closest('[data-poignee]')
    // Au doigt, deux touchers rapprochés font ce que fait un double-clic (une note sur le vide, entrer dans une toile,
    // écrire dans une note) : la webview d'iOS n'en envoie pas de fiable, le premier toucher ayant déjà pris le geste.
    if (e.pointerType === 'touch' && e.button === 0 && !surPoignee && !espace) {
      const avant = toucher.current
      if (avant && e.timeStamp - avant.instant < DOUBLE_TOUCHER_MS && Math.hypot(e.clientX - avant.x, e.clientY - avant.y) < DOUBLE_TOUCHER_PX) {
        toucher.current = null
        e.preventDefault()
        doubleClic(e)
        doubleTouche.current = e.timeStamp
        return
      }
      toucher.current = { instant: e.timeStamp, x: e.clientX, y: e.clientY }
    }
    // Au doigt, le fond se tire d'un doigt, même posé sur un élément qu'on n'a pas choisi : le lasso n'a pas de sens
    // sous un pouce, et un élément ne part pas sous le doigt qui voulait se déplacer. Un toucher le choisit, un appui
    // long le décolle (`appuiLongRef`) ; un élément déjà choisi se glisse tout de suite, comme à la souris.
    const doigtSurLeFond = e.pointerType === 'touch' && e.button === 0 && !surPoignee && (!id || !selection.has(id))
    if (doigtSurLeFond && !espace) {
      espaceBref.current = false
      geste.current = { type: 'attraper', dernier: p, toucher: { id: id ?? null, ecran: p, bouge: false } }
      setAttrape(true)
      setEnGeste(true)
      setBarresGardees(true)
      // Pas de capture : le doigt garde sa cible, dont le clic (une case, un bouton) doit arriver.
      return
    }
    if (e.button === 1 || (e.button === 0 && espace)) {
      e.preventDefault()
      espaceBref.current = false
      geste.current = { type: 'attraper', dernier: p }
      setAttrape(true)
    } else if (e.button === 2) {
      // Le clic droit choisit ce qu'il touche, s'il ne l'était pas ; sur le vide, il désélectionne.
      if (!id) setSelection(new Set())
      else if (!selection.has(id)) setSelection(new Set([id]))
      return
    } else if (e.button === 0) {
      const ici = cam.versTableau(camera, p)
      const el = id && tableau.elements.find((x) => x.id === id)
      if (el && !lectureSeule && !el.verrou && (e.target as HTMLElement).closest('[data-poignee]') && selection.size > 1 && selection.has(el.id)) {
        // Une poignée dans une sélection de plusieurs : chacune lance le redimensionnement du groupe.
        const choisis = tableau.elements.filter((x) => selection.has(x.id))
        const rects = choisis.flatMap((x) => rect(x.id) ?? [])
        const items = choisis
          .filter((x) => !x.parent && !x.verrou && definition(x.contenu.type)?.calque !== 'lignes')
          .map((x) => {
            const def = definition(x.contenu.type)
            return { id: x.id, x: x.x, y: x.y, largeur: x.largeur, min: Math.min(largeurMinDe(def?.largeurMin, x.contenu), x.largeur), ligne: false, proportion: !!def?.proportion?.(x.contenu as never) }
          })
        const cadre = englobant(rects)
        if (cadre) geste.current = { type: 'redimensionnerGroupe', depart: ici, cadre, items }
      } else if (el && !lectureSeule && !el.verrou && (e.target as HTMLElement).closest('[data-poignee]')) {
        const def = definition(el.contenu.type)
        const min = largeurMinDe(def?.largeurMin, el.contenu)
        const n = def?.hauteurBornable && !el.parent ? noeudDe(el.id) : null
        geste.current = {
          type: 'redimensionner',
          id: el.id,
          depart: ici,
          largeurDepart: el.largeur,
          min,
          ...(n ? { borne: { de: el.hauteur, px: n.offsetHeight } } : {}),
          ...(def?.tirerPoignee || def?.cadrageLibre ? { avant: el } : {}),
        }
      } else if (id) {
        arreterDepose()
        const basculer = e.metaKey || e.ctrlKey || e.shiftKey
        const s = cliquer(selection, id, basculer)
        setSelection(s)
        // Sur un élément déjà choisi, l'appui garde le groupe pour le glisser ; le relâchement décide.
        const reduire = !basculer && selection.has(id) ? { id, seul: selection.size === 1, ou: point(e.clientX, e.clientY) } : undefined
        if (!s.has(id) || lectureSeule) return
        // Une ligne se prend par son trait et se déplace en bloc (sans l'envol des cartes).
        if (el && el.contenu.type === 'ligne' && !el.verrou && s.size === 1) {
          geste.current = { type: 'ligneEntiere', id, depart: ici, ecran: p, demarre: false, avant: el.contenu }
          setEnGeste(true)
          setBarresGardees(true)
          racine.current!.setPointerCapture(e.pointerId)
          return
        }
        geste.current = { ...gesteGlisser(s, ici, p), ...(reduire ? { reduire } : {}) }
      } else {
        const inverser = e.shiftKey || e.metaKey || e.ctrlKey
        const avant = inverser ? selection : new Set<Id>()
        setSelection(avant)
        geste.current = { type: 'lasso', depart: ici, avant, inverser }
      }
    } else return
    setEnGeste(true)
    setBarresGardees(geste.current?.type === 'attraper' || (geste.current?.type === 'glisser' && !geste.current.demarre))
    racine.current!.setPointerCapture(e.pointerId)
  }

  /** Le réglage du vol pour ces éléments : seul un élément isolé s'incline, d'autant moins qu'il est grand. */
  const reglageVol = (elements: Element[], cote: number) => {
    const seul = elements.length === 1 ? elements[0] : undefined
    const def = seul && definition(seul.contenu.type)
    // Moins de mouvement demandé : l'élément vole encore sous le pointeur, mais ne s'incline plus.
    const calme = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    return { incliner: !calme && !!def && !def.sansInclinaison && def.calque !== 'lignes', max: inclinaisonMax(cote), ...(auDoigt() ? { colle: true } : {}) }
  }

  /** La vitesse du défilement au bord (px d'écran par image), ou `null` hors de la zone et sur la barre d'outils. */
  const vitesseBord = (e: { clientX: number; clientY: number }): Point | null => {
    const r = racine.current?.getBoundingClientRect()
    if (!r || document.elementFromPoint(e.clientX, e.clientY)?.closest('.notak-barre-outils')) return null
    const axe = (v: number, min: number, max: number) =>
      v < min + BORD ? -VITESSE_BORD * Math.min(1, (min + BORD - v) / BORD) : v > max - BORD ? VITESSE_BORD * Math.min(1, (v - max + BORD) / BORD) : 0
    const v = point(axe(e.clientX, r.left, r.right), axe(e.clientY, r.top, r.bottom))
    return v.x || v.y ? v : null
  }
  const bord = useRef<{ image: number; e: React.PointerEvent } | null>(null)
  const suivreBord = (e: React.PointerEvent) => {
    const g = geste.current
    const actif = g && (g.type === 'lasso' || ((g.type === 'glisser' || g.type === 'outil') && g.demarre))
    if (!actif) return
    // Les champs utiles seulement : l'évènement de React ne survit pas à l'image suivante.
    const copie = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey }
    if (bord.current) {
      bord.current.e = copie as React.PointerEvent
      return
    }
    if (!vitesseBord(copie)) return
    const b = { image: 0, e: copie as React.PointerEvent }
    bord.current = b
    const pas = () => {
      const v = geste.current && vitesseBord(b.e)
      if (!v || bord.current !== b) {
        if (bord.current === b) bord.current = null
        return
      }
      animation.current = null
      setCamera((c) => cam.defiler(c, -v.x, -v.y))
      // Ce qu'on glisse suit la vue : on rejoue le dernier mouvement.
      mouvementCourant.current(b.e)
      b.image = requestAnimationFrame(pas)
    }
    b.image = requestAnimationFrame(pas)
  }
  const arreterBord = () => {
    if (bord.current) cancelAnimationFrame(bord.current.image)
    bord.current = null
  }
  // Le tirage d'un bout de ligne garde le pointeur pour lui : il rend la main à la toile pour défiler au bord.
  const bordTenu = useRef<{ image: number; e: { clientX: number; clientY: number }; rejouer: () => void } | null>(null)
  const suivreBordTenu = (e: { clientX: number; clientY: number }, rejouer: () => void) => {
    const copie = { clientX: e.clientX, clientY: e.clientY }
    if (bordTenu.current) {
      bordTenu.current.e = copie
      bordTenu.current.rejouer = rejouer
      return
    }
    if (!vitesseBord(copie)) return
    const b = { image: 0, e: copie, rejouer }
    bordTenu.current = b
    const pas = () => {
      const v = bordTenu.current === b ? vitesseBord(b.e) : null
      if (!v) {
        if (bordTenu.current === b) bordTenu.current = null
        return
      }
      animation.current = null
      setCamera((c) => cam.defiler(c, -v.x, -v.y))
      b.rejouer()
      b.image = requestAnimationFrame(pas)
    }
    b.image = requestAnimationFrame(pas)
  }
  const arreterBordTenu = () => {
    if (bordTenu.current) cancelAnimationFrame(bordTenu.current.image)
    bordTenu.current = null
  }

  const mouvement = (e: React.PointerEvent) => {
    dernierPointeur.current = { ecran: point(e.clientX, e.clientY), id: e.pointerId }
    if (limiteur) {
      const c = cam.versTableau(camera, local(e))
      limiteur.pousser(point(Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10))
    }
    const g = geste.current
    if (!g) return
    suivreBord(e)
    const p = local(e)
    if (g.type === 'attraper') {
      if (g.toucher && !g.toucher.bouge && Math.hypot(p.x - g.toucher.ecran.x, p.y - g.toucher.ecran.y) > SEUIL_TOUCHER) g.toucher.bouge = true
      const d = soustraire(p, g.dernier)
      g.dernier = p
      animation.current = null
      return setCamera((c) => cam.defiler(c, d.x, d.y))
    }
    const k = cam.PX_PAR_UG * camera.echelle
    if (g.type === 'outil') {
      const parcouru = Math.hypot(p.x - g.ecran.x, p.y - g.ecran.y)
      // Le fantôme est tenu à sa prise : son coin haut gauche, à l'écran.
      const coin = point(p.x - g.prise.x * k, p.y - g.prise.y * k)
      if (g.outil.outil.cliquerSeulement) {
        // Un outil qui ne se glisse pas : ni fantôme ni envol, le geste sert seulement à le dire au lâcher.
        if (parcouru >= SEUIL_GLISSER) g.demarre = true
        return
      }
      if (!g.demarre) {
        if (parcouru < SEUIL_GLISSER) return
        g.demarre = true
        const def = definition(g.fantome.contenu.type)
        const cote = Math.max(g.fantome.largeur, def?.hauteurParDefaut ?? 0) * k
        const depart: Vol = { ...VOL_REPOS, x: coin.x, y: coin.y }
        g.envol = new Envol(reglageVol([g.fantome], cote), (v) => {
          const n = calqueFantome.current
          if (n) dessinerSur(n, `${transformation(v)} scale(${etat.current.camera.echelle})`, v.ombre)
        }, depart)
        setFantome(g.fantome)
      }
      g.coin = coin
      g.envol?.viser(coin, parcouru)
      return viser(e, [g.fantome])
    }
    const ici = cam.versTableau(camera, p)
    if (g.type === 'ligneEntiere') {
      if (!g.demarre) {
        if (Math.hypot(p.x - g.ecran.x, p.y - g.ecran.y) < SEUIL_GLISSER) return
        g.demarre = true
        setBarresGardees(false)
      }
      const d = soustraire(ici, g.depart)
      const bout = (x: Extremite): Extremite => ('element' in x ? x : { x: Math.round((x.x + d.x) * 100) / 100, y: Math.round((x.y + d.y) * 100) / 100 })
      const actuel = magasin.lire().elements.find((x) => x.id === g.id)
      if (!actuel) return
      return magasin.appliquerSeulement([
        { type: 'contenu', id: g.id, avant: actuel.contenu, apres: { ...g.avant, depart: bout(g.avant.depart), arrivee: bout(g.avant.arrivee) } },
      ])
    }
    if (g.type === 'lasso') {
      const zone = depuisCoins(g.depart, ici)
      setZoneLasso(zone)
      const rects = tableau.elements.filter((x) => !x.parent && !prisParUnAutre.has(x.id)).flatMap((x): [Id, Rect | Point[]][] => {
        const trace = definition(x.contenu.type)?.calque === 'lignes' ? traceDe(x.id) : null
        if (trace) return [[x.id, trace]]
        const r = rect(x.id)
        return r ? [[x.id, r]] : []
      })
      return setPrisLasso(lasso(zone, rects, g.avant, g.inverser))
    }
    if (g.type === 'redimensionnerGroupe') {
      return magasin.appliquerSeulement(pasDuGroupe(g, ici, e.metaKey || e.ctrlKey, false))
    }
    if (g.type === 'redimensionner' && g.avant && definition(g.avant.contenu.type)?.tirerPoignee) {
      // Une poignée qui change le contenu (une table gagne des colonnes) : le type dit ce que devient l'élément.
      const el = magasin.lire().elements.find((x) => x.id === g.id)
      const r = el && definition(g.avant.contenu.type)?.tirerPoignee?.(g.avant as never, g.largeurDepart + (ici.x - g.depart.x), ici.y - g.depart.y)
      if (!el || !r) return
      return magasin.appliquerSeulement([
        { type: 'redimensionner', id: g.id, de: el.largeur, vers: r.largeur },
        { type: 'contenu', id: g.id, avant: el.contenu, apres: r.contenu as Contenu },
      ])
    }
    if (g.type === 'redimensionner') {
      // Un média garde ses proportions : on suit la plus grande des deux tractions, ramenée en largeur.
      const el = magasin.lire().elements.find((x) => x.id === g.id)
      const ratio = el && definition(el.contenu.type)?.proportion?.((g.avant ?? el).contenu as never)
      const dx = ici.x - g.depart.x
      const tire = ratio && !e.metaKey && !e.ctrlKey ? Math.max(dx, (ici.y - g.depart.y) * ratio) : dx
      const max = el && definition(el.contenu.type)?.largeurMax?.(el.contenu as never)
      // La largeur suit le pointeur sans arrondi ; la grille la rattrape au relâchement (voir `animerFin`).
      const vers = Math.max(g.min, Math.min(max ?? Infinity, g.largeurDepart + tire))
      const pas: Operation[] = [{ type: 'redimensionner', id: g.id, de: g.largeurDepart, vers }]
      // Cmd libère aussi la hauteur d'un média : le cadre se règle, l'image le recouvre (4 × 4 UG au moins).
      const libre = g.avant && definition(g.avant.contenu.type)?.cadrageLibre
      if (g.avant && libre && el) {
        const hauteur = libre.hauteur(g.avant.contenu as never, g.largeurDepart) + (ici.y - g.depart.y)
        const apres = e.metaKey || e.ctrlKey ? (libre.avec(g.avant.contenu as never, vers, hauteur) as Contenu) : g.avant.contenu
        if (!memes(el.contenu, apres)) pas.push({ type: 'contenu', id: g.id, avant: el.contenu, apres })
      }
      const n = g.borne && noeudDe(g.id)
      if (g.borne && n) {
        const h = hauteurTiree(g.borne.px + (ici.y - g.depart.y) * cam.PX_PAR_UG, hauteurNaturelle(n))
        pas.push({ type: 'borner', id: g.id, de: g.borne.de ?? null, vers: h ?? null })
      }
      return magasin.appliquerSeulement(pas)
    }
    if (!g.demarre) {
      if (Math.hypot(p.x - g.ecran.x, p.y - g.ecran.y) < SEUIL_GLISSER) return
      g.demarre = true
      setBarresGardees(false)
      g.reduire = undefined
      reduction.current = { cible: { echelle: 1, opacite: 1 }, actuel: { echelle: 1, opacite: 1 }, instant: performance.now() }
      arreterDepose()
      // Les colonnes telles qu'au départ : celle qu'on quitte et celle qu'on vise changent de taille au dépôt.
      colonnesAuDepart.current = tableau.elements.flatMap((x) => {
        const r = x.contenu.type === 'colonne' && !x.parent ? rect(x.id) : null
        return r ? [{ haut: x.id, avant: r, origines: new Map<Id, number>() }] : []
      })
      const ids = [...g.origines.keys()]
      const choisis = magasin.lire().elements.filter((x) => g.origines.has(x.id))
      g.modele = empaqueter(magasin.lire(), ids, rect)
      const r = ids.length === 1 ? rect(ids[0]!) : null
      const cote = r ? Math.max(r.max.x - r.min.x, r.max.y - r.min.y) * k : 0
      // Ce qui était rangé quitte sa colonne à l'endroit où il se trouvait à l'écran, et la colonne se resserre.
      g.sorties = [...g.origines]
        .filter(([, o]) => o.place.parent)
        .map(([id, o]): Operation => {
          const [x, y] = aimanter(o.pos)
          return { type: 'ranger', id, de: o.place, vers: { x, y } }
        })
      // Chaque élément tiré d'une colonne y laisse sa place vide jusqu'au dépôt.
      setEmpreintes(
        [...g.origines].flatMap(([id, o]): Empreinte[] => {
          if (!o.place.parent) return []
          const r = rect(id)
          const hauteur = r ? (r.max.y - r.min.y) * cam.PX_PAR_UG : 0
          return [{ id, parent: o.place.parent, ...(o.place.ordre !== undefined ? { ordre: o.place.ordre } : {}), hauteur }]
        }),
      )
      magasin.appliquerSeulement(g.sorties)
      g.vols = ids
      g.envol = new Envol(reglageVol(choisis, cote), (v) => {
        for (const id of g.vols) {
          const n = noeudDe(id)
          if (n) dessinerSur(n, transformation(v, g.base), v.ombre, reductionVol())
        }
      })
      setGlisses(new Set(ids))
    }
    const d = soustraire(ici, g.depart)
    g.axe = e.shiftKey ? choisirAxe(g.axe, d) : null
    if (g.axe === 'h') d.y = 0
    if (g.axe === 'v') d.x = 0
    g.d = d
    // L'élément suit le pointeur au pixel, dans le plan : on n'aimante qu'au dépôt.
    g.envol?.viser(point(d.x * cam.PX_PAR_UG, d.y * cam.PX_PAR_UG), Math.hypot(p.x - g.ecran.x, p.y - g.ecran.y))
    viser(e, choisis())
  }

  const mouvementCourant = useRef(mouvement)
  mouvementCourant.current = mouvement

  /** Cherche la colonne sous le pointeur, la place d'insertion, et dessine le trait. Ce qu'on glisse ne compte pas. */
  const viser = (e: React.PointerEvent, portes: readonly Element[]) => {
    const glisses = new Set(portes.map((x) => x.id))
    const div = racine.current!
    const elements = magasin.lire().elements
    let trouvee: Cible | null = null
    let nouveauTrait: { x0: number; x1: number; y: number; cadre?: number } | null = null
    let versTableau: { id: Id; noeud: HTMLElement } | null = null
    // On ne range pas un tableau en lui-même.
    const interdits = new Set(portes.flatMap((x) => (x.contenu.type === 'tableau' ? [x.contenu.cible] : [])))
    const segment = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-depot-tableau]')
    const idSegment = segment?.getAttribute('data-depot-tableau')
    if (segment && idSegment && idSegment !== tableau.id && !interdits.has(idSegment) && services.deposerDans) versTableau = { id: idSegment, noeud: segment }
    for (const n of versTableau ? [] : document.elementsFromPoint(e.clientX, e.clientY)) {
      if (calqueFantome.current?.contains(n)) continue
      const chaine = chaineDe(div, n)
      if (chaine.length === 0) continue
      const idDe = (c: HTMLElement) => c.getAttribute('data-id')!
      if (chaine.some((c) => glisses.has(idDe(c)))) continue
      const defDe = (c: HTMLElement) => {
        const el = elements.find((x) => x.id === idDe(c))
        return el && definition(el.contenu.type)
      }
      if (defDe(chaine[0]!)?.calque === 'lignes') continue
      // Sur la carte d'un tableau : ce qu'on lâche part dans ce tableau.
      const carte = elements.find((x) => x.id === idDe(chaine[0]!))
      // Rangée dans une colonne, la carte laisse 18 px en haut et en bas à l'insertion entre cartes.
      const rc = carte?.parent ? chaine[0]!.getBoundingClientRect() : null
      const dedans = !rc || (e.clientY > rc.top + 18 * camera.echelle && e.clientY < rc.bottom - 18 * camera.echelle)
      if (carte?.contenu.type === 'tableau' && dedans && services.deposerDans && !interdits.has(carte.contenu.cible)) {
        versTableau = { id: carte.contenu.cible, noeud: chaine[0]! }
        break
      }
      // Le premier élément touché décide : un conteneur qui le contient, ou la toile nue.
      const noeud = chaine.find((c) => defDe(c)?.accepte)
      const conteneur = noeud && elements.find((x) => x.id === idDe(noeud))
      const def = conteneur && definition(conteneur.contenu.type)
      if (!noeud || !conteneur || !def?.accepte) break
      // Une colonne dans le lot : la colonne refuse tout.
      if (portes.some((x) => x.contenu.type === 'colonne')) break
      const acceptes = portes.filter((x) => def.accepte!(x, conteneur)).map((x) => x.id)
      if (acceptes.length === 0) break
      const freres = elements
        .filter((x) => x.parent === conteneur.id && !glisses.has(x.id))
        .sort((a, b) => comparerOrdre(a.ordre, b.ordre))
        .flatMap((x) => {
          const r = div.querySelector(`[data-id="${CSS.escape(x.id)}"]`)?.getBoundingClientRect()
          return r ? [r] : []
        })
      const index = indexInsertion(freres.map((r) => (r.top + r.bottom) / 2), e.clientY)
      const [o, c, k] = [div.getBoundingClientRect(), noeud.getBoundingClientRect(), camera.echelle]
      let y = c.bottom
      if (freres.length === 0) {
        const zone = noeud.querySelector('[data-depot]')?.getBoundingClientRect()
        if (zone) y = (zone.top + zone.bottom) / 2
      } else y = index < freres.length ? freres[index]!.top - 6 * k : freres[freres.length - 1]!.bottom + 6 * k
      trouvee = { colonne: conteneur.id, index, acceptes }
      // Pas de trait quand le dépôt ne changerait rien : un seul élément, remis à sa place dans sa colonne.
      let sansEffet = false
      const g = geste.current
      if (glisses.size === 1 && g?.type === 'glisser') {
        const origine = g.origines.get([...glisses][0]!)
        if (origine?.place.parent === conteneur.id && origine.place.ordre !== undefined) {
          const avant = elements.filter((x) => x.parent === conteneur.id && !glisses.has(x.id) && comparerOrdre(x.ordre, origine.place.ordre!) < 0).length
          sansEffet = avant === index
        }
      }
      const vide = freres.length === 0 && conteneur.contenu.type === 'colonne' && !!conteneur.contenu.repliee === false
      if (conteneur.contenu.type === 'colonne' && (conteneur.contenu.repliee || vide)) {
        // Repliée ou vide : un cadre de 2 px autour de la colonne entière (ou de son bloc vide), pas de trait.
        const zone = (vide ? noeud.querySelector('[data-depot]') : null)?.getBoundingClientRect() ?? c
        nouveauTrait = { x0: zone.left - o.left, x1: zone.right - o.left, y: zone.top - o.top, cadre: zone.bottom - zone.top }
      } else nouveauTrait = sansEffet ? null : { x0: c.left - o.left, x1: c.right - o.left, y: y - o.top }
      break
    }
    if (tableauVise.current?.noeud !== versTableau?.noeud) {
      if (tableauVise.current) delete tableauVise.current.noeud.dataset.survolDepot
      if (versTableau) versTableau.noeud.dataset.survolDepot = ''
      oublierEntree()
      const g = geste.current
      // Un glisser qui s'attarde sur un tableau y entre, et continue dedans.
      if (versTableau && g?.type === 'glisser' && services.ouvrirTableau) {
        const vise = versTableau
        const minuteur = setTimeout(
          () => {
            vise.noeud.dataset.clignote = ''
            entree.current = { noeud: vise.noeud, minuteur: setTimeout(() => entrerEnGlissant(vise.id), ENTREE_CLIGNEMENT) }
          },
          g.enchaine ? ENTREE_SUIVANTE : ENTREE_PREMIERE,
        )
        entree.current = { noeud: vise.noeud, minuteur }
      }
    }
    tableauVise.current = versTableau
    if (versTableau) nouveauTrait = null
    // Une colonne vide ou repliée qui va recevoir : sa zone « déposer ici » prend un filet.
    const zone = !versTableau && trouvee ? (noeudDe(trouvee.colonne)?.querySelector<HTMLElement>('[data-depot]') ?? null) : null
    const videVisee = zone && (zone.classList.contains('notak-colonne-repliee') || !elements.some((x) => x.parent === trouvee!.colonne && !glisses.has(x.id))) ? zone : null
    if (zoneMarquee.current !== videVisee) {
      if (zoneMarquee.current) delete zoneMarquee.current.dataset.cibleDepot
      if (videVisee) videVisee.dataset.cibleDepot = ''
      zoneMarquee.current = videVisee
    }
    const surCorbeille = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-corbeille]')
    reduction.current.cible = versTableau || surCorbeille ? { echelle: 0.8, opacite: 0.75 } : trouvee ? { echelle: 1, opacite: 0.75 } : { echelle: 1, opacite: 1 }
    cible.current = versTableau ? null : trouvee
    setTrait((t) => (t && nouveauTrait && t.x0 === nouveauTrait.x0 && t.x1 === nouveauTrait.x1 && t.y === nouveauTrait.y && t.cadre === nouveauTrait.cadre ? t : nouveauTrait))
  }

  // — Après la création par un outil : le type dit s'il est édité, seulement choisi, ou laissé tel quel. —
  const apresCreation = (ids: Id[]) => {
    const premier = ids[0] ? magasin.lire().elements.find((x) => x.id === ids[0]) : undefined
    const mode = (premier && definition(premier.contenu.type)?.aLaCreation) ?? 'editer'
    if (mode === 'rien' || !premier) return
    setSelection(new Set(ids))
    if (mode === 'editer') commencerEdition(premier.id)
  }

  /** Lâcher un outil : l'élément naît sous le fantôme (ou dans la colonne visée), puis se pose en douceur. */
  const lacherOutil = (g: Extract<Geste, { type: 'outil' }>, e: React.PointerEvent, visee: Cible | null, versTableau?: Id) => {
    g.envol?.arreter()
    const vol = g.envol?.vol
    setFantome(null)
    if (!g.demarre) {
      const clic = g.outil.outil.clic
      // Un outil d'envoi s'ouvre au clic : ce qu'on choisit se pose au milieu de la vue.
      if (clic) return clic(cam.versTableau(camera, point(vue.largeur / 2, vue.hauteur / 2)), contexte)
      // Sur un téléphone, l'outil touché dans la feuille des outils pose son élément au milieu de la vue.
      if (enFeuille() && !g.outil.outil.cliquerSeulement) {
        const [cx, cy] = aimanter(cam.versTableau(camera, point(vue.largeur / 2, vue.hauteur / 2)))
        const pas = g.outil.outil.creer(point(cx, cy), contexte)
        const ids = pas.flatMap((op) => (op.type === 'creer' ? [op.element.id] : []))
        if (ids.length === 0) return
        magasin.faire(pas)
        apresCreation(ids)
        return
      }
      setRebond((r) => ({ libelle: g.outil.outil.libelle, n: (r?.n ?? 0) + 1 }))
      return
    }
    if (g.outil.outil.cliquerSeulement) {
      // Glissé : rien ne naît, l'outil rebondit et la bulle invite à cliquer.
      setRebond((r) => ({ libelle: g.outil.outil.libelle, n: (r?.n ?? 0) + 1, texte: 'barre.cliquer' }))
      return
    }
    const sur = document.elementFromPoint(e.clientX, e.clientY)
    if (!vol || sur?.closest('.notak-barre-outils')) return
    const [x, y] = aimanter(cam.versTableau(camera, g.coin))
    const ghost = cam.versTableau(camera, point(vol.x, vol.y))
    let pas = g.outil.outil.creer(point(x, y), contexte)
    const ids = pas.flatMap((op) => (op.type === 'creer' ? [op.element.id] : []))
    if (ids.length === 0) return
    if (versTableau && services.deposerDans) {
      // Lâché sur un tableau : l'élément naît dans ce tableau, sans être choisi.
      return services.deposerDans(versTableau, pas.flatMap((op) => (op.type === 'creer' ? [op.element] : [])))
    }
    let range = false
    if (visee) {
      const colonne = visee.colonne
      const freres = magasin.lire().elements.filter((x) => x.parent === colonne).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
      const i = Math.max(0, Math.min(visee.index, freres.length))
      const conteneur = magasin.lire().elements.find((x) => x.id === colonne)
      const accepte = conteneur && definition(conteneur.contenu.type)?.accepte
      const entrants = pas.filter((op) => op.type === 'creer' && conteneur && accepte?.(op.element, conteneur))
      const cles = clesEntre(freres[i - 1]?.ordre, freres[i]?.ordre, entrants.length)
      pas = pas.map((op) => {
        const j = entrants.indexOf(op)
        if (j < 0 || op.type !== 'creer') return op
        range = true
        return { ...op, element: { ...op.element, parent: colonne, ordre: cles[j]! } }
      })
    }
    magasin.faire(pas)
    apresCreation(ids)
    if (range) return
    // Le nouvel élément part de là où était le fantôme, et rejoint sa case de grille.
    const ecart = point((ghost.x - x) * cam.PX_PAR_UG, (ghost.y - y) * cam.PX_PAR_UG)
    const fantomeVol = { ...vol, x: ecart.x, y: ecart.y }
    const def = definition(g.fantome.contenu.type)
    const envol = new Envol(reglageVol([g.fantome], 0), (v) => {
      for (const id of ids) {
        const n = noeudDe(id)
        if (n) dessinerSur(n, transformation(v), v.ombre)
      }
    }, fantomeVol)
    if (def?.calque === 'lignes') envol.arreter()
    else reposer(envol, ids)
  }

  /** Échap pendant un glisser : tout revient à sa place, en douceur. */
  const annulerGlisser = () => {
    const g = geste.current
    if (g?.type === 'redimensionnerGroupe') {
      // Échap rend à chacun sa place et sa largeur de départ.
      magasin.appliquerSeulement(g.items.flatMap((i): Operation[] => [
        { type: 'deplacer', id: i.id, de: [i.x, i.y], vers: [i.x, i.y] },
        { type: 'redimensionner', id: i.id, de: i.largeur, vers: i.largeur },
      ]))
      geste.current = null
      setEnGeste(false)
      return true
    }
    if (g?.type === 'ligneEntiere') {
      const el = magasin.lire().elements.find((x) => x.id === g.id)
      if (el && g.demarre) magasin.appliquerSeulement([{ type: 'contenu', id: g.id, avant: el.contenu, apres: g.avant }])
      geste.current = null
      setEnGeste(false)
      return true
    }
    if (g?.type === 'redimensionner') {
      // Échap rend la taille de départ ; rien n'entre dans l'historique.
      const el = magasin.lire().elements.find((x) => x.id === g.id)
      if (el) {
        const pas: Operation[] = [{ type: 'redimensionner', id: g.id, de: el.largeur, vers: g.largeurDepart }]
        if (g.avant && !memes(el.contenu, g.avant.contenu)) pas.push({ type: 'contenu', id: g.id, avant: el.contenu, apres: g.avant.contenu })
        if (g.borne) pas.push({ type: 'borner', id: g.id, de: el.hauteur ?? null, vers: g.borne.de ?? null })
        magasin.appliquerSeulement(pas)
      }
      geste.current = null
      setEnGeste(false)
      return true
    }
    if (g?.type === 'outil') {
      g.envol?.arreter()
      setFantome(null)
    } else if (g?.type === 'glisser' && g.demarre && g.envol) {
      magasin.appliquerSeulement([...(g.copies ?? []), ...g.sorties].toReversed().map(inverse))
      g.base = point(0, 0)
      g.vols = g.vols.filter((id) => !g.sorties.some((op) => op.type === 'ranger' && op.id === id))
      reposer(g.envol, g.vols)
    } else return false
    geste.current = null
    cible.current = null
    if (tableauVise.current) delete tableauVise.current.noeud.dataset.survolDepot
    tableauVise.current = null
    oublierEntree()
    setTrait(null)
    setGlisses(null)
    setEmpreintes(AUCUNE)
    setEnGeste(false)
    return true
  }

  /**
   * La fin d'un redimensionnement : positions et largeurs rejoignent la grille en parcourant 30 % de l'écart par image.
   * Un groupe se pose l'un après l'autre, du haut gauche au bas droit (500 ms en tout, 50 ms d'écart au plus, d'un
   * coup au-delà de 50 éléments). `conclure` inscrit le geste ; un nouveau geste ou un zoom y mettent fin d'emblée.
   */
  const animerFin = (cibles: { id: Id; x: number; y: number; largeur: number; ligne: boolean }[], conclure: () => void) => {
    finRedim.current?.()
    const ordre = [...cibles].sort((a, b) => a.y - b.y || a.x - b.x)
    const ecart = ordre.length > 1 && ordre.length <= 50 ? Math.min(50, 500 / ordre.length) : 0
    const depart = performance.now()
    let image = 0
    const poser = (final: boolean) => {
      const t = magasin.lire()
      const pas = ordre.flatMap((c, rang): Operation[] => {
        const el = t.elements.find((x) => x.id === c.id)
        if (!el || (!final && performance.now() - depart < rang * ecart)) return []
        const vers = (v: number, but: number) => (final || Math.abs(but - v) < 0.05 ? but : v + (but - v) * 0.3)
        const [x, y, largeur] = [vers(el.x, c.x), vers(el.y, c.y), c.ligne ? el.largeur : vers(el.largeur, c.largeur)]
        const sorties: Operation[] = []
        if (x !== el.x || y !== el.y) sorties.push({ type: 'deplacer', id: c.id, de: [el.x, el.y], vers: [x, y] })
        if (largeur !== el.largeur) sorties.push({ type: 'redimensionner', id: c.id, de: el.largeur, vers: largeur })
        return sorties
      })
      if (pas.length > 0) magasin.appliquerSeulement(pas)
      return pas.length === 0 && performance.now() - depart >= ordre.length * ecart
    }
    const fin = () => {
      cancelAnimationFrame(image)
      finRedim.current = null
      poser(true)
      conclure()
    }
    finRedim.current = fin
    const pas = () => {
      if (poser(false)) return fin()
      image = requestAnimationFrame(pas)
    }
    image = requestAnimationFrame(pas)
  }
  annulerRedimRef.current = () => {
    const g = geste.current
    if (g?.type === 'redimensionner' || g?.type === 'redimensionnerGroupe') annulerGlisser()
  }

  const relache = (e: React.PointerEvent) => {
    arreterBord()
    const g = geste.current
    geste.current = null
    setEnGeste(false)
    setAttrape(false)
    setZoneLasso(null)
    // Un doigt posé et relevé sans bouger : un toucher, qui choisit l'élément touché ou vide le choix.
    if (g?.type === 'attraper' && g.toucher && !g.toucher.bouge && e.type === 'pointerup') {
      setSelection(g.toucher.id ? new Set([g.toucher.id]) : new Set())
      return
    }
    if (g?.type === 'lasso') {
      setPrisLasso((pris) => {
        if (pris) setSelection(pris)
        return null
      })
      return
    }
    if (g?.type === 'redimensionnerGroupe') {
      // Les éléments se posent sur la grille l'un après l'autre, du haut gauche au bas droit.
      const minimum = new Map(g.items.map((i) => [i.id, i.min]))
      const cibles = magasin.lire().elements.flatMap((el) => (minimum.has(el.id) ? [{ id: el.id, x: Math.round(el.x), y: Math.round(el.y), largeur: Math.max(minimum.get(el.id)!, Math.round(el.largeur)), ligne: g.items.find((i) => i.id === el.id)!.ligne }] : []))
      const conclure = () => {
        // Le pas inscrit va du départ à la fin du geste, quel que soit le chemin parcouru.
        const t = magasin.lire()
        const pas: Operation[] = []
        for (const i of g.items) {
          const el = t.elements.find((x) => x.id === i.id)
          if (!el) continue
          if (el.x !== i.x || el.y !== i.y) pas.push({ type: 'deplacer', id: i.id, de: [i.x, i.y], vers: [el.x, el.y] })
          if (el.largeur !== i.largeur) pas.push({ type: 'redimensionner', id: i.id, de: i.largeur, vers: el.largeur })
        }
        magasin.inscrire(pas)
      }
      animerFin(cibles, conclure)
      return
    }
    if (g?.type === 'ligneEntiere') {
      const el = magasin.lire().elements.find((x) => x.id === g.id)
      if (g.demarre && el && !memes(el.contenu, g.avant)) magasin.inscrire([{ type: 'contenu', id: g.id, avant: g.avant, apres: el.contenu }])
      return
    }
    if (g?.type === 'redimensionner') {
      const el = magasin.lire().elements.find((x) => x.id === g.id)
      if (!el) return
      const conclure = () => {
        const el = magasin.lire().elements.find((x) => x.id === g.id)
        if (!el) return
        const pas: Operation[] = []
        if (el.largeur !== g.largeurDepart) pas.push({ type: 'redimensionner', id: g.id, de: g.largeurDepart, vers: el.largeur })
        if (g.avant && !memes(el.contenu, g.avant.contenu)) pas.push({ type: 'contenu', id: g.id, avant: g.avant.contenu, apres: el.contenu })
        if (g.borne && !memeHauteur(el.hauteur, g.borne.de)) {
          pas.push({ type: 'borner', id: g.id, de: g.borne.de ?? null, vers: el.hauteur ?? null })
        }
        magasin.inscrire(pas)
      }
      // Une poignée qui change le contenu travaille déjà en entiers ; les autres rejoignent la grille en douceur.
      if (g.avant) return conclure()
      animerFin([{ id: g.id, x: el.x, y: el.y, largeur: largeurTiree(el.largeur, g.min), ligne: false }], conclure)
      return
    }
    const visee = cible.current
    const versTableau = tableauVise.current
    cible.current = null
    if (versTableau) delete versTableau.noeud.dataset.survolDepot
    tableauVise.current = null
    oublierEntree()
    setTrait(null)
    if (zoneMarquee.current) delete zoneMarquee.current.dataset.cibleDepot
    zoneMarquee.current = null
    setGlisses(null)
    setEmpreintes(AUCUNE)
    reduction.current.cible = { echelle: 1, opacite: 1 }
    if (g?.type === 'outil') return lacherOutil(g, e, visee, versTableau?.id)
    if (g?.type !== 'glisser') return
    if (g.demarre) {
      aRemesurer.current.push(...colonnesAuDepart.current)
      colonnesAuDepart.current = []
    }
    if (g.demarre && versTableau && services.deposerDans) {
      // Lâché sur un tableau : tout part dans ce tableau, colonnes et lignes comprises.
      g.envol?.arreter()
      for (const id of g.vols) {
        const n = noeudDe(id)
        if (n) oublierVol(n)
      }
      magasin.appliquerSeulement(g.sorties.toReversed().map(inverse))
      const cibleId = versTableau.id
      const n = g.origines.size
      envoyerDans(cibleId, [...g.origines.keys()])
      const titre = services.tableau?.(cibleId)?.titre || t('commun.sansTitre')
      annoncer({
        texte: tn('toile.deplaces', n, { titre }),
        ...(services.ouvrirTableau ? { action: { libelle: t('commun.ouvrir'), faire: () => services.ouvrirTableau!(cibleId) } } : {}),
      })
      return
    }
    if (g.demarre && document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-corbeille]')) {
      // Lâché sur la corbeille : on remet d'abord ce qui sortait d'une colonne, la corbeille le prend de là.
      g.envol?.arreter()
      for (const id of g.vols) {
        const n = noeudDe(id)
        if (n) oublierVol(n)
      }
      magasin.appliquerSeulement(g.sorties.toReversed().map(inverse))
      return jeter(g.origines.keys())
    }
    // Un fil lâché sur un autre élément s'y attache en épingle, à l'endroit du dépôt.
    if (g.demarre && !lectureSeule && !visee && g.origines.size === 1) {
      const filId = [...g.origines.keys()][0]!
      const sur = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((n) => n.closest<HTMLElement>('.notak-carte[data-id]'))
        .find((c) => c && c.dataset.id !== filId && !calqueFantome.current?.contains(c))
      if (sur && tableau.elements.find((x) => x.id === filId)?.contenu.type === 'commentaire') {
        const r = sur.getBoundingClientRect()
        const echelle = sur.offsetWidth > 0 ? r.width / sur.offsetWidth : 1
        const p = pointDePose((e.clientX - r.left) / echelle, (e.clientY - r.top) / echelle, sur.offsetWidth, sur.offsetHeight)
        const pas = attacherFil(magasin.lire(), filId, sur.dataset.id!, p.x, p.y)
        if (pas) {
          g.envol?.arreter()
          for (const id of g.vols) {
            const n = noeudDe(id)
            if (n) oublierVol(n)
          }
          magasin.appliquerSeulement(g.sorties.toReversed().map(inverse))
          magasin.faire(pas)
          setSelection(new Set([sur.dataset.id!]))
          return
        }
      }
    }
    if (!g.demarre) {
      // Décollé au doigt, puis relâché sur place : son menu.
      if (g.decolle) return ouvrirMenu({ preventDefault() {}, ...g.decolle } as unknown as React.MouseEvent)
      // Un clic sans glisser sur un élément déjà choisi : il devient seul choisi, ou s'édite s'il l'était déjà.
      const r = g.reduire
      if (!r) return
      const el = tableau.elements.find((x) => x.id === r.id)
      const surTitre = el?.contenu.type !== 'colonne' || !!document.elementFromPoint(r.ou.x, r.ou.y)?.closest('.notak-colonne-titre')
      if (r.seul && el && !lectureSeule && surTitre && defEcrite(el, tableau)?.editable && !definition(el.contenu.type)?.ouvreAuDoubleClic && e.type === 'pointerup') commencerEdition(r.id, r.ou)
      else setSelection(new Set([r.id]))
      return
    }
    // On aimante maintenant : chaque élément tombe sur la case de grille la plus proche du déplacement voulu.
    const ds = point(Math.round(g.d.x), Math.round(g.d.y))
    const lu = magasin.lire()
    magasin.appliquerSeulement(
      [...g.origines].flatMap(([id]): Operation[] => {
        const el = lu.elements.find((x) => x.id === id)
        return el ? [{ type: 'deplacer', id, de: [el.x, el.y], vers: aimanter(point(el.x + ds.x, el.y + ds.y)) }] : []
      }),
    )
    // Un seul pas, de la place d'origine à la place finale, même si l'élément a quitté sa colonne en route.
    const deplaces = [...g.origines].map(([id, o]): Deplace => ({ id, de: o.place, lecture: o.pos }))
    const pas = pasDeDepot(magasin.lire(), deplaces, visee)
    magasin.appliquerSeulement(pas)
    magasin.remplacer(auPremierPlan(magasin.lire(), g.origines.keys()))
    // Alt est lue au dépôt : tenue à cet instant, une copie reste à la place de départ et l'original arrive.
    if (e.altKey && g.modele) {
      g.copies = deballer(g.modele, point(0, 0)).map((element): Operation => ({ type: 'creer', element }))
      magasin.appliquerSeulement(g.copies)
    }
    magasin.inscrire([...(g.copies ?? []), ...pas])
    // Ce qui entre dans une colonne y prend sa place tout de suite ; le reste se pose en douceur.
    const entres = new Set(pas.flatMap((op) => (op.type === 'ranger' && op.vers.parent ? [op.id] : [])))
    g.vols = g.vols.filter((id) => !entres.has(id))
    g.base = point(ds.x * cam.PX_PAR_UG, ds.y * cam.PX_PAR_UG)
    if (g.envol) {
      // Pendant la dépose, le vol se mesure depuis la place où l'élément est posé.
      g.envol.vol = { ...g.envol.vol, x: g.envol.vol.x - g.base.x, y: g.envol.vol.y - g.base.y }
      g.base = point(0, 0)
      g.envol.redessiner()
      reposer(g.envol, g.vols)
    }
  }

  /** Une note neuve dans la colonne, à la place visée (le pied de la colonne : à la fin) ; une colonne repliée n'en reçoit pas. */
  const noteDansColonne = (colonne: Element, clientY: number | null) => {
    if (lectureSeule || (colonne.contenu.type === 'colonne' && colonne.contenu.repliee)) return
    const div = racine.current
    const freres = tableau.elements.filter((x) => x.parent === colonne.id).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
    const centres = freres.map((x) => {
      const r = div?.querySelector(`[data-id="${CSS.escape(x.id)}"]`)?.getBoundingClientRect()
      return r ? (r.top + r.bottom) / 2 : 0
    })
    const index = clientY === null ? 0 : indexInsertion(centres, clientY)
    const note = { ...nouvelleNote(colonne.x, colonne.y), parent: colonne.id, ordre: cleEntre(freres[index - 1]?.ordre, freres[index]?.ordre) }
    magasin.faire([{ type: 'creer', element: note }])
    setSelection(new Set([note.id]))
    commencerEdition(note.id)
  }

  const doubleClic = (e: React.MouseEvent) => {
    // Le double-clic que la webview tirerait de deux touchers déjà comptés (`appui`) ne pose pas une seconde note.
    if (e.type === 'dblclick' && e.timeStamp - doubleTouche.current < 600) return
    // DESSIN-LIBRE : sous la couche de dessin, la toile ne fait rien (pas de note, pas d'ouverture).
    if (toileSuspendue(racine.current)) return
    if (dansEdition(racine.current, e.target)) return
    // Une partie de l'élément qui a son double-clic à elle (l'aperçu d'un lien en « média seul »).
    const touche = document.elementFromPoint(e.clientX, e.clientY)
    const porteur = tableau.elements.find((x) => x.id === sous(touche))
    if (porteur && definition(porteur.contenu.type)?.surDoubleClic?.(porteur as never, touche as HTMLElement | null, contexte)) return
    if (lectureSeule) {
      const el = tableau.elements.find((x) => x.id === sous(document.elementFromPoint(e.clientX, e.clientY)))
      const ouvrir = el && definition(el.contenu.type)?.ouvrir
      if (el && ouvrir) ouvrir(el, contexte)
      return
    }
    // Le pointeur est capturé par la toile : la cible du double-clic n'est pas fiable, on regarde sous le curseur.
    if (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-poignee]')) {
      const el = tableau.elements.find((x) => selection.has(x.id))
      const def = el && definition(el.contenu.type)
      if (!el || !def) return
      // Un cadrage libre (Cmd + poignée) se retire d'abord : l'image retrouve ses proportions.
      const sans = def.cadrageLibre?.retire(el.contenu as never)
      if (sans) return magasin.faire([{ type: 'contenu', id: el.id, avant: el.contenu, apres: sans as Contenu }])
      const vers = largeurDoubleClic(el.largeur, def.largeurNaturelle?.(el.contenu), largeurMinDe(def.largeurMin, el.contenu))
      if (vers !== el.largeur) magasin.faire([{ type: 'redimensionner', id: el.id, de: el.largeur, vers }])
      return
    }
    // La zone « déposer ici » d'une colonne : un double-clic y crée une note, à la fin de la colonne (sauf repliée).
    const zone = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-depot]')
    if (zone && !zone.classList.contains('notak-colonne-repliee')) {
      const colonne = tableau.elements.find((x) => x.id === sous(zone))
      if (colonne?.contenu.type === 'colonne') {
        const dernier = tableau.elements.filter((x) => x.parent === colonne.id).sort((a, b) => comparerOrdre(a.ordre, b.ordre)).at(-1)
        const note = { ...nouvelleNote(colonne.x, colonne.y), parent: colonne.id, ordre: cleEntre(dernier?.ordre, undefined) }
        magasin.faire([{ type: 'creer', element: note }])
        neSous.current = note.id
        commencerEdition(note.id)
        return
      }
    }
    const id = sous(document.elementFromPoint(e.clientX, e.clientY))
    if (id && prisParUnAutre.has(id)) return
    if (id) {
      const el = tableau.elements.find((x) => x.id === id)
      // Un double-clic sur le trait ou le libellé d'une ligne la redresse ; une ligne ne s'écrit pas.
      if (el?.contenu.type === 'ligne') {
        if (el.contenu.courbe && !el.verrou) {
          const { courbe: _c, ...droite } = el.contenu
          magasin.faire([{ type: 'contenu', id: el.id, avant: el.contenu, apres: droite }])
        }
        return
      }
      const ouvrir = el && definition(el.contenu.type)?.ouvrir
      if (el?.contenu.type === 'colonne' && !document.elementFromPoint(e.clientX, e.clientY)?.closest('.notak-colonne-tete')) return noteDansColonne(el, e.clientY)
      return ouvrir ? ouvrir(el, contexte) : commencerEdition(id, point(e.clientX, e.clientY))
    }
    if (services.doubleClicCreeNote === false) return
    const [x, y] = aimanter(cam.versTableau(camera, local(e)))
    const note = nouvelleNote(x, y)
    magasin.faire([{ type: 'creer', element: note }])
    commencerEdition(note.id)
  }

  /** Une image du bureau au-dessus d'une image de la toile : elle prépare le voile « Remplacer l'image » (voir `survolDepot`). */
  const survolDepot = (e: React.DragEvent) => {
    const id = !lectureSeule && glisseUneImage(e.dataTransfer) ? sous(document.elementFromPoint(e.clientX, e.clientY)) : null
    const el = id ? tableau.elements.find((x) => x.id === id) : undefined
    survolerImage(el && el.contenu.type === 'image' && !el.verrou && el.corbeille === undefined ? el.id : null)
  }

  const deposer = (e: React.DragEvent) => {
    e.preventDefault()
    figerDepot()
    const nonTrie = e.dataTransfer.getData(GLISSER_NON_TRIE)
    if (nonTrie) return poserNonTrie(nonTrie, cam.versTableau(camera, local(e)))
    // Déposé sur une colonne : ce qui arrive s'y range.
    const colonne = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.notak-carte[data-type="colonne"]')
    void recevoir(e.dataTransfer, cam.versTableau(camera, local(e)), colonne?.dataset.id, true).finally(libererDepot)
  }

  // La sélection ne garde que ce qui existe encore (après une suppression, une annulation).
  useEffect(() => {
    setSelection((s) => {
      const ids = new Set(tableau.elements.map((e) => e.id))
      return [...s].every((id) => ids.has(id)) ? s : new Set([...s].filter((id) => ids.has(id)))
    })
  }, [tableau])

  // [vue] Revenir à 100 % sur ce qu'on regarde, et dire à l'en-tête (bouton « Vue ») où en est le zoom.
  const remettreA100 = () => lancerAnimation(cam.centree(cam.centreCamera(camera, vue), 1, vue))
  usePublierVue(
    { echelle: camera.echelle },
    {
      details: () => {
        const cadre = cam.ajuster(contenu(), vue)
        return { min: cam.echelleMin(contenu(), vue), toutAffiche: !!cadre && cam.revenirA100(camera.echelle, cadre.echelle) && Math.abs(camera.echelle - 1) > 1e-3 }
      },
      zoomer: zoomerVers,
      tout: ajuster,
      cent: remettreA100,
    },
  )

  const k = cam.PX_PAR_UG * camera.echelle
  const grille = Math.abs(camera.echelle - 1) < 1e-3 && !anime && pointsAllumes(fondVoulu)
  const fondLibre = estLibre(fondVoulu?.couleur) ? fondVoulu.couleur : undefined
  // La grille ne paraît qu'à 100 % : elle revient en fondu quand on y retombe (voir `.notak-toile::before`).
  const styleRacine = {
    '--notak-grille-pas': `${cam.PX_PAR_UG}px`,
    '--notak-grille-x': `${-camera.origine.x * k}px`,
    '--notak-grille-y': `${-camera.origine.y * k}px`,
    // Une couleur libre : les points s'éclaircissent sur un fond sombre.
    ...(fondLibre ? { '--notak-fond': fondLibre, '--notak-point': estSombre(fondLibre) ? 'rgb(255 255 255 / 0.22)' : 'rgb(0 0 0 / 0.18)' } : {}),
  } as React.CSSProperties
  const versEcran = (r: Rect) => ({ min: cam.versEcran(camera, r.min), max: cam.versEcran(camera, r.max) })
  const lassoEcran = zoneLasso && versEcran(zoneLasso)

  // Qui et quoi sort de la vue : le curseur des autres, et ce qu'ils viennent de toucher.
  const ciblesBord = useMemo<CibleBord[]>(
    () => [
      ...autres.flatMap((a): CibleBord[] => (a.curseur ? [{ id: `p${a.client}`, ou: a.curseur, genre: 'personne', nom: a.utilisateur.nom, couleur: a.utilisateur.couleur }] : [])),
      ...[...nonVus].flatMap(([id, v]): CibleBord[] => {
        const r = rect(id)
        return r ? [{ id: `a${id}`, ou: centre(r), genre: 'activite', nom: v.nom }] : []
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autres, nonVus, tableau],
  )
  const elementsChoisis = choisis()
  const barresCachees = enGeste && !barresGardees
  const cadreChoisis = !barresCachees && !edition && elementsChoisis.length > 0
    ? englobant(elementsChoisis.flatMap((x) => rect(x.id) ?? []))
    : null
  const barre = cadreChoisis && !lectureSeule && versEcran(cadreChoisis)

  // [barre d'édition à gauche] En édition, la barre de gauche prend les outils de l'élément (la note : ses outils de
  // texte, par un portail) ; un type sans outils d'édition garde la barre de sa sélection.
  const elementEnEdition = edition && !barresCachees ? tableau.elements.find((x) => x.id === edition) : undefined
  const editionAGauche = !!services.barreAGauche && !lectureSeule && !!elementEnEdition
  const barreEdition = editionAGauche && !!defEcrite(elementEnEdition!, tableau)?.outilsEdition
  const selectionEnEdition = editionAGauche && !barreEdition ? [elementEnEdition!] : null
  const emplacementEdition = useMemo(() => ({ attendue: barreEdition, cible: barreEdition ? cibleEdition : null }), [barreEdition, cibleEdition])

  // Pendant un lasso, ce qu'il va prendre paraît déjà choisi.
  const vueChoix = prisLasso ?? selection
  const rangement = useMemo<Rangement>(
    () => ({ elements: masques ? tableau.elements.filter((x) => !masques.has(x.id)) : tableau.elements, empreintes, selection: vueChoix, edition, brouillon: surBrouillon, changer: surChanger }),
    [tableau, masques, empreintes, vueChoix, edition, surBrouillon, surChanger],
  )
  // Ce qui est verrouillé reste dessous.
  const cartes = [...tableau.elements.filter((x) => libre(x) && x.verrou && !masques?.has(x.id)), ...tableau.elements.filter((x) => libre(x) && !x.verrou && !masques?.has(x.id))]
  const seule = !edition && selection.size === 1 && !tableau.elements.find((x) => selection.has(x.id))?.verrou ? [...selection][0] : undefined
  // L'empilement suit l'ordre du plan : une ligne s'intercale avec les cartes (chacune dans son calque SVG), et ses
  // poignées vont dans un calque au-dessus de tout.
  // Une ligne dont un bout tient à un élément coupé disparaît avec lui.
  const ligneVisible = (e: Element) =>
    !masques?.has(e.id) && !(masques && e.contenu.type === 'ligne' && accroches(e.contenu).some((a) => masques.has(a)))
  const pile = [
    ...cartes.filter((x) => x.verrou),
    ...tableau.elements.filter((x) => (libre(x) && !x.verrou && !masques?.has(x.id)) || (definition(x.contenu.type)?.calque === 'lignes' && ligneVisible(x))),
  ]

  const rendreLigne = (e: Element) => {
    const Rendu = definition(e.contenu.type)!.Rendu
    return (
      <Rendu
        element={e}
        choisie={vueChoix.has(e.id)}
        enEdition={edition === e.id}
        contexte={contexte}
        brouillon={(c) => surBrouillon(e, c)}
        changer={(c) => surChanger(e, c)}
      />
    )
  }

  return (
    <ContexteBarreEdition.Provider value={emplacementEdition}>
    <div
      ref={racine}
      className="notak-toile"
      data-attraper={espace || attrape || undefined}
      data-attrape={attrape || undefined}
      data-grille={grille || undefined}
      data-fond={estNomme(fondVoulu?.couleur) ? fondVoulu.couleur : undefined}
      tabIndex={0}
      style={styleRacine}
      onKeyDown={clavier}
      onKeyUp={relacherEspace}
      onBlur={() => setEspace(false)}
      onPointerDown={appui}
      onPointerMove={mouvement}
      onPointerUp={relache}
      onPointerCancel={relache}
      onPointerLeave={() => limiteur?.forcer(null)}
      onDoubleClick={doubleClic}
      onContextMenu={ouvrirMenu}
      onDragOver={(e) => {
        e.preventDefault()
        survolDepot(e)
      }}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node) || !racine.current?.contains(e.relatedTarget)) survolerImage(null)
      }}
      onDrop={deposer}
    >
      <div className="notak-glisse" style={{ transform: `translate(${-camera.origine.x * k}px, ${-camera.origine.y * k}px)` }}>
      <div
        className="notak-plan"
        style={{
          transform: `scale(${camera.echelle})`,
          ['--notak-zoom-inverse' as string]: 1 / camera.echelle,
        }}
      >
        <ContexteRangement.Provider value={rangement}>
          {pile.map((e) => definition(e.contenu.type)?.calque === 'lignes' ? (
            <svg key={e.id} className="notak-calque-lignes" aria-hidden>
              <GardeElement element={e} repli={null}>
                {rendreLigne(e)}
              </GardeElement>
            </svg>
          ) : (
            <Cadre
              key={e.id}
              element={e}
              choisie={vueChoix.has(e.id)}
              seule={e.id === seule}
              enEdition={edition === e.id}
              poignee={!lectureSeule && !e.verrou && !edition && definition(e.contenu.type)?.redimensionnable !== false && (e.id === seule || !selection.has(e.id) || selection.size > 1)}
              audessus={glisses?.has(e.id)}
              contexte={contexte}
              brouillon={surBrouillon}
              changer={surChanger}
            />
          ))}
        </ContexteRangement.Provider>
        {[...nonVus].map(([id, v]) => {
          const r = rect(id)
          if (!r) return null
          return (
            <PointActivite
              key={`activite:${id}`}
              texte={t('toile.modifiePar', { nom: v.nom, age: ageCourt(v.quand) })}
              gauche={r.max.x * cam.PX_PAR_UG - 6 - 7}
              haut={r.min.y * cam.PX_PAR_UG + 6}
            />
          )
        })}
        {autres.flatMap((a) =>
          [...new Set([...a.selection, ...(a.edition ? [a.edition] : [])])].flatMap((id) => {
            const n = noeudDe(id)
            const el = n?.classList.contains('notak-carte') ? tableau.elements.find((x) => x.id === id) : undefined
            return n && el
              ? [
                  <PastilleAutre
                    key={`${a.client}:${id}`}
                    noeud={n}
                    presence={a}
                    type={el.contenu.type}
                    adressePhoto={services.adressePhoto}
                    lacher={lectureSeule ? undefined : () => presence?.forcerDeselection?.(a.client, [id])}
                  />,
                ]
              : []
          }),
        )}
        <svg className="notak-calque-lignes notak-calque-poignees" aria-hidden />
        {autres.map((a) => (a.curseur ? <CurseurAutre key={a.client} presence={a} echelle={camera.echelle} /> : null))}
      </div>
      </div>
      {lassoEcran && (
        <div
          className="notak-lasso"
          style={{
            left: lassoEcran.min.x,
            top: lassoEcran.min.y,
            width: lassoEcran.max.x - lassoEcran.min.x,
            height: lassoEcran.max.y - lassoEcran.min.y,
          }}
        />
      )}
      {trait && trait.cadre === undefined && <div className="notak-trait-depot" style={{ left: trait.x0, top: trait.y - 1, width: trait.x1 - trait.x0 }} />}
      {trait && trait.cadre !== undefined && <div className="notak-cadre-depot" style={{ left: trait.x0, top: trait.y, width: trait.x1 - trait.x0, height: trait.cadre }} />}
      {barre && (
        <BarreSelection
          elements={elementsChoisis}
          contexte={contexte}
          position={{ x: (barre.min.x + barre.max.x) / 2, y: Math.max(8, barre.min.y - MARGE_BARRE) }}
          {...(services.barreAGauche ? { aGauche: true } : {})}
        />
      )}
      {/* [barre d'édition à gauche] */}
      {selectionEnEdition && (
        <BarreSelection elements={selectionEnEdition} contexte={contexte} position={{ x: 0, y: 0 }} aGauche />
      )}
      {barreEdition && (
        <BarreEdition
          cible={setCibleEdition}
          corbeille={{ nombre: corbeille.length, ouverte: corbeilleOuverte, basculer: () => setCorbeilleOuverte((o) => !o) }}
          nonTries={{ nombre: nonTries.length, ouverte: nonTriesOuvert, basculer: () => setNonTriesOuvert((o) => !o) }}
        />
      )}
      {fantome && (
        <div ref={calqueFantome} className="notak-fantome" aria-hidden>
          {definition(fantome.contenu.type)?.calque === 'lignes' ? (
            <svg className="notak-calque-lignes">{rendreFantome(fantome, contexte)}</svg>
          ) : (
            <Cadre element={fantome} choisie={false} enEdition={false} contexte={contexte} brouillon={rien} changer={rien} />
          )}
        </div>
      )}
      {(!lectureSeule || services.apercuModele) && !(services.barreAGauche && (barre || editionAGauche)) && (
        <BarreOutils
          grisee={lectureSeule}
          surAppui={surAppuiOutil}
          rebond={rebond}
          corbeille={{ nombre: corbeille.length, ouverte: corbeilleOuverte, basculer: () => setCorbeilleOuverte((o) => !o) }}
          nonTries={{ nombre: nonTries.length, ouverte: nonTriesOuvert, basculer: () => setNonTriesOuvert((o) => !o) }}
        />
      )}
      {nonTriesOuvert && !lectureSeule && (
        <PanneauNonTries
          elements={nonTries}
          contexte={contexte}
          poser={(x) => poserNonTrie(x.id, contexte.centreVue())}
          fermer={() => setNonTriesOuvert(false)}
        />
      )}
      {corbeilleOuverte && !lectureSeule && (
        <PanneauCorbeille elements={corbeille} contexte={contexte} restaurer={restaurer} vider={viderCorbeille} fermer={() => setCorbeilleOuverte(false)} />
      )}
      {!lectureSeule && <PanneauBanque contexte={contexte} libelleOutil={t('outil.image')} />}
      {!lectureSeule && <PanneauEnvoi contexte={contexte} libelleOutil={t('outil.fichier')} />}
      <BandeauAvis />
      {focus && <CoucheFocus noeud={focus.noeud} depart={focus.depart} fermer={() => setFocus(null)} />}
      {raccourcis && <FenetreRaccourcis fermer={fermerRaccourcis} />}
      {menu && <MenuContextuel x={menu.x} y={menu.y} entrees={entreesMenu()} fermer={fermerMenu} />}
      {requete !== null && (
        <Recherche
          requete={requete}
          appel={appelRecherche}
          nombre={trouves.length}
          rang={rangTrouve}
          changer={(r) => {
            setRequete(r)
            setRangTrouve(-1)
          }}
          aller={allerAuTrouve}
          fermer={fermerRecherche}
          {...(services.rechercherPartout ? { partout: services.rechercherPartout } : {})}
          {...(services.ouvrirTableau ? { ouvrirTableau: services.ouvrirTableau } : {})}
          {...(toutLeTableau.id ? { ici: toutLeTableau.id } : {})}
        />
      )}
      {/* Qui commente n'est pas en lecture seule : il écrit ses fils, et rien d'autre. */}
      {lectureSeule && !services.presentation && (
        <div className="notak-lecture">{t(aFiltrer(services.droits) && peutCommenter(services) ? 'toile.commentaireSeul' : 'toile.lectureSeule')}</div>
      )}
      <PointeursBord cibles={ciblesBord} camera={camera} vue={vue} aller={(ou) => lancerAnimation(cam.centree(ou, camera.echelle, vue))} />
      <PastilleZoom echelle={camera.echelle} remettre={remettreA100} />
      {!services.presentation && (
        <Minicarte
          lieu="tableau"
          version={tableau}
          formes={() => tableau.elements.filter(libre).flatMap((x) => rect(x.id) ?? []).map((r) => ({ x: r.min.x, y: r.min.y, l: r.max.x - r.min.x, h: r.max.y - r.min.y }))}
          vue={{ x: camera.origine.x, y: camera.origine.y, l: vue.largeur / k, h: vue.hauteur / k }}
          fenetre={{ l: vue.largeur, h: vue.hauteur }}
          aller={(ou) => {
            animation.current = null
            setCamera((c) => cam.centree(point(ou.x, ou.y), c.echelle, etat.current.vue))
          }}
        />
      )}
    </div>
    </ContexteBarreEdition.Provider>
  )
}
