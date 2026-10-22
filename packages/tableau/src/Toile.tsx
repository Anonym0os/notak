import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BarreOutils, BarreSelection, type OutilDeBarre, outilsDeBarre } from './Barres'
import { Cadre, ContexteRangement, type Rangement } from './Cadre'
import * as cam from './coeur/camera'
import { type Point, type Rect, chevauche, depuisCoins, englobant, point, soustraire } from './coeur/geometrie'
import { creerLimiteur } from './coeur/limiteur'
import { type Magasin, enLectureSeule, sansCorbeille } from './coeur/magasin'
import { largeurDoubleClic, largeurTiree, LARGEUR_MIN_DEFAUT } from './coeur/largeur'
import { type Cible, type Deplace, cleEntre, clesEntre, comparerOrdre, indexInsertion, pasDeDepot } from './coeur/ordre'
import { cliquer, lasso } from './coeur/selection'
import { type Paquet, TYPE_PAQUET, decalageDeCollage, deballer, empaqueter, texteDuPaquet } from './coeur/pressePapiers'
import { type Entree, MenuContextuel, PanneauCorbeille } from './Menus'
import { VOL_REPOS, type Vol, inclinaisonMax, transformation } from './coeur/vol'
import { Envol, dessinerSur, oublierVol } from './envol'
import {
  type Contenu,
  type Element,
  type Id,
  type Operation,
  type Tableau,
  HAUTEUR_NOTE_MIN,
  aLaCorbeille,
  aimanter,
  auDernierPlan,
  auPremierPlan,
  dUnCran,
  inverse,
  nouvelleNote,
  placeDe,
} from './coeur/tableau'
import './elements'
import { definition, tousLesRaccourcis, tousLesRecepteurs, tousLesTypes, toutesLesEntreesMenu } from './elements/registre'
import type { ContexteToile, Presence, Services } from './elements/types'

type Geste =
  | { type: 'attraper'; dernier: Point }
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
      /** Le déplacement voulu, en UG, sans aimantation : on n'aimante qu'au dépôt. */
      d: Point
      envol?: Envol
      /** Les nœuds qui volent, et la place où ils sont déjà posés pendant la dépose, en pixels du plan. */
      vols: Id[]
      base: Point
      /** Ce qui a quitté une colonne au départ du geste, pour le remettre si on annule. */
      sorties: Operation[]
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
  | { type: 'redimensionner'; id: Id; depart: Point; largeurDepart: number; min: number }

/** Le verrou d'axe de Maj : choisi d'après le plus grand déplacement, il ne bascule que si l'autre le dépasse franchement. */
function choisirAxe(actuel: 'h' | 'v' | null, d: Point): 'h' | 'v' {
  const [ax, ay] = [Math.abs(d.x), Math.abs(d.y)]
  if (actuel === 'h' && ay < ax * 2) return 'h'
  if (actuel === 'v' && ax < ay * 2) return 'v'
  return ax >= ay ? 'h' : 'v'
}

/** Sous ce déplacement (pixels écran), un appui reste un clic : rien ne bouge, rien ne quitte sa colonne. */
const SEUIL_GLISSER = 3

/** Le dernier paquet copié, gardé d'un tableau à l'autre : le menu « Coller » s'en sert. */
const copie: { paquet: Paquet | null; collages: number } = { paquet: null, collages: 0 }
function retenirPaquet(p: Paquet) {
  if (copie.paquet !== p) copie.collages = 0
  copie.paquet = p
}

const sansEcoute = () => () => {}
const rien = () => {}

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

export function Toile({ magasin: source, services = {}, cameraInitiale, surCamera }: PropsToile) {
  const lectureSeule = !!services.lectureSeule
  // Tout le tableau, corbeille comprise ; la toile, elle, ne voit pas la corbeille.
  const complet = useMemo(() => (lectureSeule ? enLectureSeule(source) : source), [source, lectureSeule])
  const magasin = useMemo(() => sansCorbeille(complet), [complet])
  const toutLeTableau = useSyncExternalStore(complet.ecouter, complet.lire)
  const corbeille = useMemo(() => aLaCorbeille(toutLeTableau), [toutLeTableau])
  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; ou: Point; surElement: boolean } | null>(null)
  const presence = services.presence
  const autres = useSyncExternalStore(
    presence?.ecouter ?? sansEcoute,
    presence ? presence.autres : aucun,
  )
  const tableau = useSyncExternalStore(magasin.ecouter, magasin.lire)
  const [camera, setCamera] = useState<cam.Camera>(cameraInitiale ?? cam.CAMERA_DEPART)
  const [vue, setVue] = useState<cam.Vue>({ largeur: 1, hauteur: 1 })
  const [selection, setSelection] = useState<ReadonlySet<Id>>(new Set())
  const [edition, setEdition] = useState<Id | null>(null)
  const [zoneLasso, setZoneLasso] = useState<Rect | null>(null)
  const [espace, setEspace] = useState(false)
  /** Espace vient d'être appuyée, et n'a encore rien attrapé. */
  const espaceBref = useRef(false)
  const [anime, setAnime] = useState(false)
  const [enGeste, setEnGeste] = useState(false)
  const [glisses, setGlisses] = useState<ReadonlySet<Id> | null>(null)
  /** Le trait qui montre la place d'insertion dans une colonne, en pixels de la toile. */
  const [trait, setTrait] = useState<{ x0: number; x1: number; y: number } | null>(null)
  const cible = useRef<Cible | null>(null)

  const racine = useRef<HTMLDivElement>(null)
  const geste = useRef<Geste | null>(null)
  const gesteZoom = useRef(new cam.GesteZoom())
  const animation = useRef<{ depart: cam.Camera; cible: cam.Camera; debut: number } | null>(null)
  /** Ce qu'on écrit : le contenu d'avant l'édition (un seul pas d'historique à la sortie), et le dernier état. */
  const brouillon = useRef<{ id: Id; debut: Contenu; contenu: Contenu } | null>(null)
  const pointEdition = useRef<Point | null>(null)
  /** Le fantôme de l'outil qu'on glisse depuis la barre. */
  const [fantome, setFantome] = useState<Element | null>(null)
  const calqueFantome = useRef<HTMLDivElement>(null)
  const [rebond, setRebond] = useState<{ libelle: string; n: number } | null>(null)
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
  useEffect(() => () => presence?.signaler({ curseur: null, selection: [] }), [presence])

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
    // Toute l'édition, d'un seul pas : annuler rend le contenu d'avant.
    if (!memes(b.debut, b.contenu)) m.inscrire([{ type: 'contenu', id: b.id, avant: b.debut, apres: b.contenu }])
  }, [])
  const commencerEdition = useCallback(
    (id: Id, ou?: Point) => {
      if (etat.current.services.lectureSeule) return
      // Le magasin, pas l'état rendu : l'élément vient peut-être d'être créé.
      const el = etat.current.magasin.lire().elements.find((x) => x.id === id)
      if (!el || !definition(el.contenu.type)?.editable) return
      if (etat.current.edition) finirEdition()
      brouillon.current = null
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
    const neuf = def?.suivant ? def.suivant(el as never, places, format, contexteRef.current!) : nouvelleNote(places.dessous.x, places.dessous.y)
    if (!neuf) return
    let element: Element = def?.suivant ? neuf : { ...neuf, largeur: el.largeur }
    // Dans une colonne, l'élément neuf se range juste après.
    if (el.parent) {
      const freres = t.elements.filter((x) => x.parent === el.parent).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
      const apres = freres[freres.findIndex((x) => x.id === id) + 1]
      element = { ...element, parent: el.parent, ordre: cleEntre(el.ordre, apres?.ordre) }
    }
    m.faire([{ type: 'creer', element }])
    setSelection(new Set([element.id]))
    commencerEdition(element.id)
  }, [finirEdition, rect, commencerEdition])
  const contexteRef = useRef<ContexteToile | null>(null)

  const jeter = useCallback(
    (ids: Iterable<Id>) => {
      if (etat.current.services.lectureSeule) return
      const m = etat.current.magasin
      const t = m.lire()
      const voulus = new Set(ids)
      // Un élément verrouillé reste ; les lignes accrochées partent avec ; une colonne garde son contenu.
      const partants = avecLiees(t.elements.filter((e) => voulus.has(e.id) && !e.verrou), t)
      const dedans = new Set(partants.map((e) => e.id))
      const date = Date.now()
      const pas = partants
        .filter((e) => !(e.parent && dedans.has(e.parent)))
        .map((e): Operation => {
          const r = e.parent ? rect(e.id) : null
          const [x, y] = r ? aimanter(r.min) : [e.x, e.y]
          return { type: 'ranger', id: e.id, de: placeDe(e), vers: { x, y, corbeille: date } }
        })
      m.faire(pas)
    },
    [rect],
  )
  const surBrouillon = useCallback(
    (el: Element, apres: Contenu) => {
      const b = brouillon.current
      const debut = b?.id === el.id ? b.debut : (etat.current.magasin.lire().elements.find((x) => x.id === el.id)?.contenu ?? el.contenu)
      brouillon.current = { id: el.id, debut, contenu: apres }
      if (!etat.current.services.lectureSeule) ecritureDirecte.pousser(el.id)
    },
    [ecritureDirecte],
  )
  const surChanger = useCallback((el: Element, apres: Contenu) => {
    if (etat.current.services.lectureSeule) return
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
      jeter,
      creerSuivant,
      prendrePointEdition: () => {
        const p = pointEdition.current
        pointEdition.current = null
        return p
      },
      finirEdition,
    }),
    [rect, commencerEdition, finirEdition, creerSuivant, jeter],
  )
  contexteRef.current = contexte

  const recevoir = async (original: DataTransfer, ou: Point) => {
    if (lectureSeule) return
    // Le navigateur vide le presse-papiers dès que l'événement est fini : on le recopie avant d'attendre
    // le premier récepteur.
    const donnees = new DataTransfer()
    for (const type of original.types) if (type !== 'Files') donnees.setData(type, original.getData(type))
    for (const f of original.files) donnees.items.add(f)
    for (const r of tousLesRecepteurs()) {
      const pas = await r.recevoir(donnees, ou, contexte)
      if (pas && pas.length > 0) {
        magasin.faire(pas)
        setSelection(new Set(pas.flatMap((op) => (op.type === 'creer' ? [op.element.id] : []))))
        return
      }
    }
  }

  useLayoutEffect(() => {
    const div = racine.current!
    const obs = new ResizeObserver(() => setVue({ largeur: div.clientWidth, hauteur: div.clientHeight }))
    obs.observe(div)
    return () => obs.disconnect()
  }, [])

  // Molette et pincement : il faut un écouteur non passif pour empêcher le zoom du navigateur.
  useEffect(() => {
    const div = racine.current!
    const molette = (e: WheelEvent) => {
      if (etat.current.edition && dansEdition(div, e.target) && !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      animation.current = null
      const { camera: c, vue: v } = etat.current
      if (e.ctrlKey || e.metaKey) {
        // Le pincement du trackpad arrive en Ctrl+molette, à petits pas : on le rend trois fois plus vif.
        const facteur = Math.exp(-e.deltaY * (e.metaKey ? 0.0025 : 0.0075))
        const echelle = gesteZoom.current.appliquer(c.echelle, facteur, cam.echelleMin(contenu(), v), e.timeStamp)
        setCamera(cam.echelleAutour(c, echelle, cam.pointFixe(echelle, local(e), v)))
      } else {
        setCamera(cam.defiler(c, -e.deltaX, -e.deltaY))
      }
    }
    div.addEventListener('wheel', molette, { passive: false })
    return () => div.removeEventListener('wheel', molette)
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
      if (p) return collerPaquet(p)
      void recevoir(e.clipboardData, contexte.centreVue())
    }
    const copier = (couper: boolean) => (e: ClipboardEvent) => {
      if (!actif() || !e.clipboardData || etat.current.selection.size === 0) return
      const p = empaqueter(etat.current.magasin.lire(), etat.current.selection, rect)
      if (!p) return
      e.preventDefault()
      retenirPaquet(p)
      e.clipboardData.setData(TYPE_PAQUET, JSON.stringify(p))
      e.clipboardData.setData('text/plain', texteDuPaquet(p))
      if (couper && !etat.current.services.lectureSeule) jeter(etat.current.selection)
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

  /** Colle un paquet : à `ou` s'il est dit (le menu), sinon décalé de l'original s'il est en vue, ou au centre. */
  const collerPaquet = (p: Paquet, ou?: Point) => {
    if (lectureSeule) return
    const n = (copie.paquet === p || JSON.stringify(copie.paquet) === JSON.stringify(p) ? copie.collages : 0) + 1
    retenirPaquet(p)
    copie.collages = n
    const vueUG = { min: cam.versTableau(camera, point(0, 0)), max: cam.versTableau(camera, point(vue.largeur, vue.hauteur)) }
    const enVue = p.tableau === tableau.id && chevauche(vueUG, p.cadre)
    const d = ou ? point(Math.round(ou.x - p.cadre.min.x), Math.round(ou.y - p.cadre.min.y)) : decalageDeCollage(p, enVue, n, contexte.centreVue())
    const neufs = deballer(p, d)
    magasin.faire(neufs.map((element): Operation => ({ type: 'creer', element })))
    setSelection(new Set(neufs.filter((x) => !x.parent).map((x) => x.id)))
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

  const restaurer = (e: Element) => {
    complet.faire([{ type: 'ranger', id: e.id, de: placeDe(e), vers: { x: e.x, y: e.y } }])
    magasin.remplacer(auPremierPlan(magasin.lire(), [e.id]))
    setSelection(new Set([e.id]))
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

  const entreesMenu = (): Entree[] => {
    if (!menu) return []
    const ou = menu.ou
    const avecPaquet = !lectureSeule && copie.paquet ? [{ libelle: 'Coller', raccourci: '⌘V', faire: () => collerPaquet(copie.paquet!, ou) }] : []
    if (!menu.surElement) {
      const creer = lectureSeule
        ? []
        : outilsDeBarre().map((o) => ({
            libelle: o.outil.libelle,
            faire: () => {
              const pas = o.outil.creer(point(Math.round(ou.x), Math.round(ou.y)), contexte)
              magasin.faire(pas)
              const ids = pas.flatMap((op) => (op.type === 'creer' ? [op.element.id] : []))
              setSelection(new Set(ids))
              if (ids[0]) commencerEdition(ids[0])
            },
          }))
      return [
        ...avecPaquet,
        null,
        ...(lectureSeule ? [] : [{ libelle: 'Annuler', raccourci: '⌘Z', faire: () => void magasin.annuler() }, { libelle: 'Rétablir', raccourci: '⇧⌘Z', faire: () => void magasin.retablir() }]),
        { libelle: 'Tout sélectionner', raccourci: '⌘A', faire: () => setSelection(new Set(tableau.elements.filter((x) => !x.parent).map((x) => x.id))) },
        null,
        ...creer,
      ]
    }
    const els = choisis()
    if (lectureSeule) return [{ libelle: 'Copier', raccourci: '⌘C', faire: () => document.execCommand('copy') }]
    const verrouilles = els.length > 0 && els.every((x) => x.verrou)
    const seul = els.length === 1 ? els[0] : undefined
    const defSeul = seul && definition(seul.contenu.type)
    return [
      { libelle: 'Couper', raccourci: '⌘X', faire: () => document.execCommand('cut') },
      { libelle: 'Copier', raccourci: '⌘C', faire: () => document.execCommand('copy') },
      ...avecPaquet,
      { libelle: 'Dupliquer', raccourci: '⌘D', faire: dupliquer },
      null,
      ...(seul && defSeul?.ouvrir ? [{ libelle: 'Ouvrir', raccourci: 'Espace', faire: () => defSeul.ouvrir!(seul, contexte) }] : []),
      ...(seul && defSeul?.editable ? [{ libelle: 'Modifier', raccourci: '↩', faire: () => commencerEdition(seul.id) }] : []),
      null,
      ...toutesLesEntreesMenu()
        .filter((x) => x.visible(els, contexte))
        .map((x) => ({ libelle: x.libelle, ...(x.raccourci ? { raccourci: x.raccourci } : {}), faire: () => x.faire(els, contexte) })),
      null,
      { libelle: 'Verrouiller la position', coche: verrouilles, faire: () => verrouiller(!verrouilles) },
      { libelle: 'Premier plan', raccourci: '⇧⌘↑', faire: () => changerPlan('haut', false) },
      { libelle: 'Arrière-plan', raccourci: '⇧⌘↓', faire: () => changerPlan('bas', false) },
      null,
      { libelle: 'Mettre à la corbeille', raccourci: '⌫', faire: () => jeter(selection) },
    ]
  }

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
    lancerAnimation(cam.dejaAjuste(camera, cible) ? cam.centree(cam.centreCamera(camera, vue), 1, vue) : cible)
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

  const clavier = (e: React.KeyboardEvent) => {
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
    if (e.target !== racine.current) return
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
    if (cmd && touche === 'z') {
      e.preventDefault()
      return e.shiftKey ? magasin.retablir() : magasin.annuler()
    }
    if (cmd && touche === 'y') {
      e.preventDefault()
      return magasin.retablir()
    }
    if (cmd && touche === 'a') {
      e.preventDefault()
      return setSelection(new Set(tableau.elements.filter((x) => !x.parent).map((x) => x.id)))
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
      return deplacer(...fleches[e.key]!)
    }
    switch (e.key) {
      case 'Escape':
        return setSelection(new Set())
      case 'Enter':
        if (selection.size === 1) {
          e.preventDefault()
          commencerEdition([...selection][0]!)
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
    racine.current!.setPointerCapture(e.pointerId)
  }

  const fermerMenu = useCallback(() => setMenu(null), [])
  const ouvrirMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (dansEdition(racine.current, e.target)) return
    const p = local(e)
    const id = sous(document.elementFromPoint(e.clientX, e.clientY))
    setMenu({ x: p.x, y: p.y, ou: cam.versTableau(camera, p), surElement: !!id })
  }

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

  const appui = (e: React.PointerEvent) => {
    if (dansEdition(racine.current, e.target)) return
    if (edition) finirEdition()
    racine.current!.focus({ preventScroll: true })
    setRebond(null)
    const p = local(e)
    const id = sous(e.target)
    if (e.button === 1 || (e.button === 0 && espace)) {
      e.preventDefault()
      espaceBref.current = false
      geste.current = { type: 'attraper', dernier: p }
    } else if (e.button === 2) {
      // Le clic droit choisit ce qu'il touche, s'il ne l'était pas ; sur le vide, il désélectionne.
      if (!id) setSelection(new Set())
      else if (!selection.has(id)) setSelection(new Set([id]))
      return
    } else if (e.button === 0) {
      const ici = cam.versTableau(camera, p)
      const el = id && tableau.elements.find((x) => x.id === id)
      if (el && !lectureSeule && !el.verrou && (e.target as HTMLElement).closest('[data-poignee]')) {
        const min = definition(el.contenu.type)?.largeurMin ?? LARGEUR_MIN_DEFAUT
        geste.current = { type: 'redimensionner', id: el.id, depart: ici, largeurDepart: el.largeur, min }
      } else if (id) {
        arreterDepose()
        const basculer = e.metaKey || e.ctrlKey || e.shiftKey
        const s = cliquer(selection, id, basculer)
        setSelection(s)
        // Sur un élément déjà choisi, l'appui garde le groupe pour le glisser ; le relâchement décide.
        const reduire = !basculer && selection.has(id) ? { id, seul: selection.size === 1, ou: point(e.clientX, e.clientY) } : undefined
        if (!s.has(id) || lectureSeule) return
        // Un élément rangé se glisse aussi, sauf si sa colonne est choisie avec lui : il la suit.
        const origines = new Map(
          tableau.elements
            .filter((x) => s.has(x.id) && mobile(x) && !x.verrou && !(x.parent && s.has(x.parent)))
            .map((x) => {
              const r = x.parent ? rect(x.id) : null
              return [x.id, { place: placeDe(x), pos: r ? r.min : point(x.x, x.y) }] as const
            }),
        )
        geste.current = {
          type: 'glisser',
          depart: ici,
          ecran: p,
          demarre: false,
          origines,
          axe: null,
          d: point(0, 0),
          vols: [],
          base: point(0, 0),
          sorties: [],
          ...(reduire ? { reduire } : {}),
        }
      } else {
        const inverser = e.shiftKey || e.metaKey || e.ctrlKey
        const avant = inverser ? selection : new Set<Id>()
        setSelection(avant)
        geste.current = { type: 'lasso', depart: ici, avant, inverser }
      }
    } else return
    setEnGeste(true)
    racine.current!.setPointerCapture(e.pointerId)
  }

  /** Le réglage du vol pour ces éléments : seul un élément isolé s'incline, d'autant moins qu'il est grand. */
  const reglageVol = (elements: Element[], cote: number) => {
    const seul = elements.length === 1 ? elements[0] : undefined
    const def = seul && definition(seul.contenu.type)
    return { incliner: !!def && !def.sansInclinaison && def.calque !== 'lignes', max: inclinaisonMax(cote) }
  }

  const mouvement = (e: React.PointerEvent) => {
    if (limiteur) {
      const c = cam.versTableau(camera, local(e))
      limiteur.pousser(point(Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10))
    }
    const g = geste.current
    if (!g) return
    const p = local(e)
    if (g.type === 'attraper') {
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
    if (g.type === 'lasso') {
      const zone = depuisCoins(g.depart, ici)
      setZoneLasso(zone)
      const rects = tableau.elements.filter((x) => !x.parent).flatMap((x): [Id, Rect][] => {
        const r = rect(x.id)
        return r ? [[x.id, r]] : []
      })
      return setSelection(lasso(zone, rects, g.avant, g.inverser))
    }
    if (g.type === 'redimensionner') {
      const vers = largeurTiree(g.largeurDepart + ici.x - g.depart.x, g.min)
      return magasin.appliquerSeulement([{ type: 'redimensionner', id: g.id, de: g.largeurDepart, vers }])
    }
    if (!g.demarre) {
      if (Math.hypot(p.x - g.ecran.x, p.y - g.ecran.y) < SEUIL_GLISSER) return
      g.demarre = true
      g.reduire = undefined
      arreterDepose()
      const ids = [...g.origines.keys()]
      const choisis = magasin.lire().elements.filter((x) => g.origines.has(x.id))
      const r = ids.length === 1 ? rect(ids[0]!) : null
      const cote = r ? Math.max(r.max.x - r.min.x, r.max.y - r.min.y) * k : 0
      // Ce qui était rangé quitte sa colonne à l'endroit où il se trouvait à l'écran, et la colonne se resserre.
      g.sorties = [...g.origines]
        .filter(([, o]) => o.place.parent)
        .map(([id, o]): Operation => {
          const [x, y] = aimanter(o.pos)
          return { type: 'ranger', id, de: o.place, vers: { x, y } }
        })
      magasin.appliquerSeulement(g.sorties)
      g.vols = ids
      g.envol = new Envol(reglageVol(choisis, cote), (v) => {
        for (const id of g.vols) {
          const n = noeudDe(id)
          if (n) dessinerSur(n, transformation(v, g.base), v.ombre)
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

  /** Cherche la colonne sous le pointeur, la place d'insertion, et dessine le trait. Ce qu'on glisse ne compte pas. */
  const viser = (e: React.PointerEvent, portes: readonly Element[]) => {
    const glisses = new Set(portes.map((x) => x.id))
    const div = racine.current!
    const elements = magasin.lire().elements
    let trouvee: Cible | null = null
    let nouveauTrait: { x0: number; x1: number; y: number } | null = null
    for (const n of document.elementsFromPoint(e.clientX, e.clientY)) {
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
      // Le premier élément touché décide : un conteneur qui le contient, ou la toile nue.
      const noeud = chaine.find((c) => defDe(c)?.accepte)
      const conteneur = noeud && elements.find((x) => x.id === idDe(noeud))
      const def = conteneur && definition(conteneur.contenu.type)
      if (!noeud || !conteneur || !def?.accepte) break
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
      } else y = index < freres.length ? freres[index]!.top - 4 * k : freres[freres.length - 1]!.bottom + 4 * k
      trouvee = { colonne: conteneur.id, index, acceptes }
      nouveauTrait = { x0: c.left - o.left + 8 * k, x1: c.right - o.left - 8 * k, y: y - o.top }
      break
    }
    cible.current = trouvee
    setTrait((t) => (t && nouveauTrait && t.x0 === nouveauTrait.x0 && t.x1 === nouveauTrait.x1 && t.y === nouveauTrait.y ? t : nouveauTrait))
  }

  /** Lâcher un outil : l'élément naît sous le fantôme (ou dans la colonne visée), puis se pose en douceur. */
  const lacherOutil = (g: Extract<Geste, { type: 'outil' }>, e: React.PointerEvent, visee: Cible | null) => {
    g.envol?.arreter()
    const vol = g.envol?.vol
    setFantome(null)
    if (!g.demarre) {
      setRebond((r) => ({ libelle: g.outil.outil.libelle, n: (r?.n ?? 0) + 1 }))
      return
    }
    const sur = document.elementFromPoint(e.clientX, e.clientY)
    if (!vol || sur?.closest('.notak-barre-outils')) return
    const [x, y] = aimanter(cam.versTableau(camera, g.coin))
    const ghost = cam.versTableau(camera, point(vol.x, vol.y))
    let pas = g.outil.outil.creer(point(x, y), contexte)
    const ids = pas.flatMap((op) => (op.type === 'creer' ? [op.element.id] : []))
    if (ids.length === 0) return
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
    setSelection(new Set(ids))
    commencerEdition(ids[0]!)
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
    if (g?.type === 'outil') {
      g.envol?.arreter()
      setFantome(null)
    } else if (g?.type === 'glisser' && g.demarre && g.envol) {
      magasin.appliquerSeulement(g.sorties.toReversed().map(inverse))
      g.base = point(0, 0)
      g.vols = g.vols.filter((id) => !g.sorties.some((op) => op.type === 'ranger' && op.id === id))
      reposer(g.envol, g.vols)
    } else return false
    geste.current = null
    cible.current = null
    setTrait(null)
    setGlisses(null)
    setEnGeste(false)
    return true
  }

  const relache = (e: React.PointerEvent) => {
    const g = geste.current
    geste.current = null
    setEnGeste(false)
    setZoneLasso(null)
    if (g?.type === 'redimensionner') {
      const el = magasin.lire().elements.find((x) => x.id === g.id)
      if (el && el.largeur !== g.largeurDepart) {
        magasin.inscrire([{ type: 'redimensionner', id: g.id, de: g.largeurDepart, vers: el.largeur }])
      }
      return
    }
    const visee = cible.current
    cible.current = null
    setTrait(null)
    setGlisses(null)
    if (g?.type === 'outil') return lacherOutil(g, e, visee)
    if (g?.type !== 'glisser') return
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
    if (!g.demarre) {
      // Un clic sans glisser sur un élément déjà choisi : il devient seul choisi, ou s'édite s'il l'était déjà.
      const r = g.reduire
      if (!r) return
      const el = tableau.elements.find((x) => x.id === r.id)
      if (r.seul && el && !lectureSeule && definition(el.contenu.type)?.editable && e.type === 'pointerup') commencerEdition(r.id, r.ou)
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
    magasin.inscrire(pas)
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

  const doubleClic = (e: React.MouseEvent) => {
    if (dansEdition(racine.current, e.target)) return
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
      const vers = largeurDoubleClic(el.largeur, def.largeurNaturelle?.(el.contenu), def.largeurMin)
      if (vers !== el.largeur) magasin.faire([{ type: 'redimensionner', id: el.id, de: el.largeur, vers }])
      return
    }
    const id = sous(document.elementFromPoint(e.clientX, e.clientY))
    if (id) {
      const el = tableau.elements.find((x) => x.id === id)
      const ouvrir = el && definition(el.contenu.type)?.ouvrir
      return ouvrir ? ouvrir(el, contexte) : commencerEdition(id, point(e.clientX, e.clientY))
    }
    const [x, y] = aimanter(cam.versTableau(camera, local(e)))
    const note = nouvelleNote(x, y)
    magasin.faire([{ type: 'creer', element: note }])
    commencerEdition(note.id)
  }

  const deposer = (e: React.DragEvent) => {
    e.preventDefault()
    void recevoir(e.dataTransfer, cam.versTableau(camera, local(e)))
  }

  // La sélection ne garde que ce qui existe encore (après une suppression, une annulation).
  useEffect(() => {
    setSelection((s) => {
      const ids = new Set(tableau.elements.map((e) => e.id))
      return [...s].every((id) => ids.has(id)) ? s : new Set([...s].filter((id) => ids.has(id)))
    })
  }, [tableau])

  const k = cam.PX_PAR_UG * camera.echelle
  const grille = Math.abs(camera.echelle - 1) < 1e-3 && !anime
  const styleRacine = grille
    ? {
        backgroundSize: `${cam.PX_PAR_UG}px ${cam.PX_PAR_UG}px`,
        backgroundPosition: `${-camera.origine.x * k}px ${-camera.origine.y * k}px`,
      }
    : { backgroundImage: 'none' }
  const versEcran = (r: Rect) => ({ min: cam.versEcran(camera, r.min), max: cam.versEcran(camera, r.max) })
  const lassoEcran = zoneLasso && versEcran(zoneLasso)

  const elementsChoisis = choisis()
  const cadreChoisis = !enGeste && !edition && elementsChoisis.length > 0
    ? englobant(elementsChoisis.flatMap((x) => rect(x.id) ?? []))
    : null
  const barre = cadreChoisis && !lectureSeule && versEcran(cadreChoisis)

  const rangement = useMemo<Rangement>(
    () => ({ elements: tableau.elements, selection, edition, brouillon: surBrouillon, changer: surChanger }),
    [tableau, selection, edition, surBrouillon, surChanger],
  )
  // Ce qui est verrouillé reste dessous.
  const cartes = [...tableau.elements.filter((x) => libre(x) && x.verrou), ...tableau.elements.filter((x) => libre(x) && !x.verrou)]
  const seule = !edition && selection.size === 1 && !tableau.elements.find((x) => selection.has(x.id))?.verrou ? [...selection][0] : undefined
  const lignes = tableau.elements.filter((e) => definition(e.contenu.type)?.calque === 'lignes')

  return (
    <div
      ref={racine}
      className="notak-toile"
      data-attraper={espace || undefined}
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
      onDragOver={(e) => e.preventDefault()}
      onDrop={deposer}
    >
      <div
        className="notak-plan"
        style={{
          transform: `translate(${-camera.origine.x * k}px, ${-camera.origine.y * k}px) scale(${camera.echelle})`,
        }}
      >
        <ContexteRangement.Provider value={rangement}>
          {cartes.map((e) => (
            <Cadre
              key={e.id}
              element={e}
              choisie={selection.has(e.id)}
              enEdition={edition === e.id}
              poignee={e.id === seule}
              audessus={glisses?.has(e.id)}
              contexte={contexte}
              brouillon={surBrouillon}
              changer={surChanger}
            />
          ))}
        </ContexteRangement.Provider>
        <svg className="notak-calque-lignes" aria-hidden>
          {lignes.map((e) => {
            const Rendu = definition(e.contenu.type)!.Rendu
            return (
              <Rendu
                key={e.id}
                element={e}
                choisie={selection.has(e.id)}
                enEdition={edition === e.id}
                contexte={contexte}
                brouillon={(c) => surBrouillon(e, c)}
                changer={(c) => surChanger(e, c)}
              />
            )
          })}
        </svg>
        {autres.map((a) =>
          a.curseur ? (
            <div
              key={a.client}
              className="notak-curseur"
              style={{
                left: a.curseur.x * cam.PX_PAR_UG,
                top: a.curseur.y * cam.PX_PAR_UG,
                transform: `scale(${1 / camera.echelle})`,
                ['--notak-autre' as string]: a.utilisateur.couleur,
              }}
            >
              <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden>
                <path d="M1 1l13 8.5-5.6 1.4L6.2 17z" fill="currentColor" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span>{a.utilisateur.nom}</span>
            </div>
          ) : null,
        )}
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
      {trait && <div className="notak-trait-depot" style={{ left: trait.x0, top: trait.y - 1, width: trait.x1 - trait.x0 }} />}
      {barre && (
        <BarreSelection
          elements={elementsChoisis}
          contexte={contexte}
          position={{ x: (barre.min.x + barre.max.x) / 2, y: Math.max(8, barre.min.y - MARGE_BARRE) }}
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
      {!lectureSeule && (
        <BarreOutils
          surAppui={surAppuiOutil}
          rebond={rebond}
          corbeille={{ nombre: corbeille.length, ouverte: corbeilleOuverte, basculer: () => setCorbeilleOuverte((o) => !o) }}
        />
      )}
      {corbeilleOuverte && !lectureSeule && (
        <PanneauCorbeille elements={corbeille} contexte={contexte} restaurer={restaurer} vider={viderCorbeille} fermer={() => setCorbeilleOuverte(false)} />
      )}
      {menu && <MenuContextuel x={menu.x} y={menu.y} entrees={entreesMenu()} fermer={fermerMenu} />}
      {lectureSeule && <div className="notak-lecture">Lecture seule</div>}
      <div className="notak-echelle">{Math.round(camera.echelle * 100)} %</div>
    </div>
  )
}
