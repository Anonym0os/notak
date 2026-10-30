import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import * as cam from '../../coeur/camera'
import type { Dessin, Element, Trait } from '../../coeur/tableau'
import { BarreEpaisseur, VoletCouleur, VoletEpaisseur, curseurCrayon } from '../croquis/partage'
import {
  COULEURS_TRAIT,
  EPAISSEURS_TRAIT,
  EPAISSEUR_DEFAUT,
  type TraceEnCours,
  affinageDe,
  attributsTrait,
  commencerTrace,
  dessinTrait,
  couleurAffichee,
  ecrireReglage,
  epaisseurFeuille,
  gommer,
  lireReglage,
  pressionsDe,
  prolongerTrace,
  traitFini,
  traitVise,
} from '../croquis/trace'
import { couleursDuTableau } from '../couleur/suggestions'
import { BoutonOutil } from '../../BoutonOutil'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { type Historique, defaire, historiqueVide, noter, refaire } from './historique'
import { type ActionDoubleToucher, EVENEMENT_DOUBLE_TOUCHER, crayonVu, dessinLibreOuvert, noterCrayon, poserDessinLibre, reglerOuvertureAuCrayon } from './mode'
import { dessinsDepuis, operationsApresEdition, presDuBas, traitsDe } from './trace'
import { appliquerAuChoix, appuiSurTrait, decalageFleche, deplacerTraits, sansTraits, traitsDansMarquise } from '../croquis/selection'
import { t } from '../../langue'
import { ico } from '../../icones'

export function RenduDessin({ element }: PropsRendu<Dessin>) {
  const c = element.contenu
  return (
    <svg className="notak-dessin" viewBox={`0 0 ${c.largeurOrigine} ${c.hauteurOrigine}`} style={{ aspectRatio: `${c.largeurOrigine} / ${c.hauteurOrigine}` }}>
      {c.traits.map((tr, i) => (
        <path key={i} {...attributsTrait(dessinTrait(tr.points, tr.epaisseur, tr.affinage, true, pressionsDe(tr)), couleurAffichee(tr.couleur, true))} />
      ))}
    </svg>
  )
}

const CLE_COULEUR = 'notak.dessin.couleur'
const CLE_EPAISSEUR = 'notak.dessin.epaisseur'
const ROUGE_GOMME = '#ff0000'
/** Le rayon de la gomme et la zone de capture d'un trait pour la sélection, en pixels d'écran. */
const GOMME_PX = 7
const CAPTURE_PX = 6
/** Les contours (trait visé par la gomme, trait choisi) débordent de ce nombre de pixels d'écran de chaque côté. */
const CONTOUR_PX = 3
/** Le cernage rouge de la gomme : 1 px de chaque côté, comme Milanote. */
const CONTOUR_GOMME_PX = 1

/** Ce que la couche garde pour elle : rien de ce qui s'y passe ne doit atteindre la toile dessous. */
const EVENEMENTS_ARRETES = ['dblclick', 'click', 'contextmenu', 'wheel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup'] as const

/** Un doigt qui bouge moins que ça, et se relève assez vite, a touché : il n'a pas tiré la vue. */
const TOUCHER_PX = 8
const TOUCHER_MS = 350

/**
 * Le dessin libre : toute la toile devient une feuille. On y trace au crayon, on gomme (le trait entier), on choisit
 * et déplace des traits, on défait et on refait (100 pas). Rien n'existe sur le tableau avant « Enregistrer » : les
 * traits se rangent alors par proximité, un élément par groupe. `existant` : un dessin posé qu'on rouvre ; il se met
 * à jour sur place, ou disparaît s'il ne reste aucun trait.
 *
 * `appui` : l'Apple Pencil s'est posé sur la toile (`dessinerAuCrayon`, mode.ts) ; la couche s'ouvre sous lui et son
 * trait commence là, sans passer par l'outil. Un toucher du doigt enregistre alors et referme.
 */
export function ouvrirDessinLibre(contexte: ContexteToile, existant?: Element<Dessin>, appui?: PointerEvent) {
  const toile = document.querySelector<HTMLElement>('.notak-toile')
  if (!toile || contexte.services.lectureSeule || dessinLibreOuvert()) return
  const hote = document.createElement('div')
  hote.className = 'notak-dessin-libre'
  toile.append(hote)
  poserDessinLibre(true)
  const racine = createRoot(hote)
  const fermer = (traits: Trait[] | null) => {
    if (traits) {
      if (existant) {
        contexte.magasin.faire(operationsApresEdition(existant, traits))
        contexte.choisir(traits.some((tr) => tr.points.length >= 2) ? [existant.id] : [])
      } else {
        const els = dessinsDepuis(traits)
        if (els.length > 0) {
          contexte.magasin.faire(els.map((element) => ({ type: 'creer' as const, element })))
          contexte.choisir(els.map((e) => e.id))
        }
      }
    }
    racine.unmount()
    hote.remove()
    poserDessinLibre(false)
    toile.focus({ preventScroll: true })
  }
  const couche = <Couche contexte={contexte} hote={hote} fermer={fermer} depart={existant ? traitsDe(existant) : []} masque={existant?.id ?? null} appui={appui} />
  // Sous le Pencil, la couche doit exister avant le mouvement suivant : elle se dessine tout de suite.
  if (appui) flushSync(() => racine.render(couche))
  else racine.render(couche)
}

reglerOuvertureAuCrayon((contexte, appui) => ouvrirDessinLibre(contexte, undefined, appui))

type Outil = 'crayon' | 'selection' | 'gomme'
type Volet = 'couleur' | 'epaisseur' | null
type Geste =
  | { type: 'trace'; trace: TraceEnCours; epaisseur: number; affinage: number }
  | { type: 'gomme'; avant: Trait[] }
  | { type: 'deplacer'; depart: { x: number; y: number }; avant: Trait[]; choix: ReadonlySet<Trait> }
  | { type: 'marquise'; depart: { x: number; y: number }; ecran: { x: number; y: number }; ajoute: boolean; base: ReadonlySet<Trait> }

const couleurValide = (v: string | null): v is string => v !== null && /^#[0-9a-f]{6}$/i.test(v)

/** Une caméra utilisable (un contexte d'essai n'en donne parfois qu'une moitié). */
const cameraDe = (c: Partial<cam.Camera> | undefined): cam.Camera => ({ origine: c?.origine ?? { x: 0, y: 0 }, echelle: c?.echelle ?? 1 })

type PointEcran = { x: number; y: number }
/** Les doigts qui mènent la vue : la caméra et leur milieu, leur écart au moment où le geste a (re)commencé. */
type Navigation = { camera: cam.Camera; milieu: PointEcran; ecart: number }

function Couche({
  contexte,
  hote,
  fermer,
  depart,
  masque,
  appui,
}: {
  contexte: ContexteToile
  hote: HTMLElement
  fermer(traits: Trait[] | null): void
  depart: Trait[]
  /** Le dessin rouvert : il se cache du tableau le temps de l'édition. */
  masque: string | null
  /** L'appui de Pencil qui a ouvert la couche : son trait commence là. */
  appui?: PointerEvent
}) {
  const [traits, setTraits] = useState<Trait[]>(depart)
  const [histo, setHisto] = useState<Historique<Trait[]>>(historiqueVide)
  const [outil, setOutil] = useState<Outil>('crayon')
  /** L'outil d'avant : le double toucher du Pencil y revient. */
  const outilAvant = useRef<Outil>('gomme')
  const [couleur, setCouleur] = useState<string>(() => {
    const v = lireReglage(CLE_COULEUR)
    return couleurValide(v) ? v : COULEURS_TRAIT[0]
  })
  const [precedente, setPrecedente] = useState(couleur)
  const [epaisseur, setEpaisseur] = useState<number>(() => {
    const n = Number(lireReglage(CLE_EPAISSEUR))
    return Number.isInteger(n) && n >= 0 && n < EPAISSEURS_TRAIT.length ? n : EPAISSEUR_DEFAUT
  })
  const [volet, setVolet] = useState<Volet>(null)
  const [choix, setChoix] = useState<ReadonlySet<Trait>>(new Set())
  const [vise, setVise] = useState<Trait | null>(null)
  const [enCours, setEnCours] = useState<TraceEnCours | null>(null)
  const [marquise, setMarquise] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [effacee, setEffacee] = useState(false)
  // Les couleurs déjà employées sur le tableau, relevées à l'ouverture, sous la palette.
  const suggerees = useMemo(() => couleursDuTableau(contexte.magasin.lire().elements, { exclure: COULEURS_TRAIT }), [contexte])
  const geste = useRef<Geste | null>(null)
  /** Le pointeur qui mène le geste d'outil (le Pencil, la souris, ou le doigt tant qu'aucun stylet ne s'est montré). */
  const pointeur = useRef<{ id: number; type: string } | null>(null)
  /** Les doigts posés sur la feuille, en coordonnées de la toile, et la navigation qu'ils mènent. */
  const doigts = useRef(new Map<number, PointEcran>())
  const navigation = useRef<Navigation | null>(null)
  /** Un doigt seul qui vient de se poser : s'il se relève sur place, c'est un toucher. */
  const toucher = useRef<{ x: number; y: number; t: number } | null>(null)
  /**
   * La caméra de la couche : les doigts la déplacent, et la toile dessous suit (`poserCamera`). Les chemins des traits
   * sont calculés pour `cameraTraits` ; pendant un geste des doigts, un simple transform les fait suivre.
   */
  const [camera, setCamera] = useState<cam.Camera>(() => cameraDe(contexte.camera))
  const [cameraTraits, setCameraTraits] = useState<cam.Camera>(camera)
  const modifie = histo.passe.length > 0

  // Tout ce qu'un écouteur du document doit lire à jour.
  const etat = { traits, histo, outil, couleur, precedente, epaisseur, volet, choix, modifie, camera }
  const sur = useRef(etat)
  sur.current = etat

  // La couche garde pour elle ses gestes : la toile dessous ne reçoit ni double-clic, ni molette, ni appui.
  useEffect(() => {
    const arreter = (e: Event) => {
      e.stopPropagation()
      if (e.type === 'contextmenu' || e.type === 'wheel') e.preventDefault()
    }
    for (const n of EVENEMENTS_ARRETES) hote.addEventListener(n, arreter, { passive: false })
    return () => {
      for (const n of EVENEMENTS_ARRETES) hote.removeEventListener(n, arreter)
    }
  }, [hote])

  const echelle = cam.PX_PAR_UG * camera.echelle
  const origine = camera.origine
  const ici = (e: { clientX: number; clientY: number }) => cam.versTableau(sur.current.camera, ecran(e))
  const ecran = (e: { clientX: number; clientY: number }) => {
    const r = hote.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const versEcran = (points: readonly number[]) => points.map((v, i) => (v - (i % 2 === 0 ? origine.x : origine.y)) * echelle)

  const choisirOutil = (o: Outil) => {
    const actuel = sur.current.outil
    if (o === actuel) return
    outilAvant.current = actuel
    setOutil(o)
  }

  const valider = (suite: Trait[], avant: Trait[]) => {
    setHisto((h) => noter(h, avant))
    setTraits(suite)
  }
  const annuler = () => {
    const r = defaire(sur.current.histo, sur.current.traits)
    if (!r) return
    setHisto(r.historique)
    setTraits(r.etat)
    setChoix(new Set())
  }
  const retablir = () => {
    const r = refaire(sur.current.histo, sur.current.traits)
    if (!r) return
    setHisto(r.historique)
    setTraits(r.etat)
    setChoix(new Set())
  }
  const enregistrer = () => {
    if (sur.current.modifie) fermer(sur.current.traits)
  }
  const abandonner = () => fermer(null)

  /** Applique un changement de couleur ou d'épaisseur aux traits choisis : un seul pas. */
  const surChoix = (f: (t: Trait) => Trait) => {
    const { traits: tous, choix: c } = sur.current
    if (c.size === 0) return false
    const { traits: apres, choix: suivants } = appliquerAuChoix(tous, c, f)
    valider(apres, tous)
    setChoix(suivants)
    return true
  }
  const choisirCouleur = (c: string) => {
    const { couleur: actuelle, outil: o } = sur.current
    if (o === 'gomme') return
    if (o === 'selection') {
      if (!surChoix((tr) => ({ ...tr, couleur: c }))) return
    }
    if (c !== actuelle) setPrecedente(actuelle)
    setCouleur(c)
    ecrireReglage(CLE_COULEUR, c)
  }
  const choisirEpaisseur = (i: number) => {
    setEpaisseur(i)
    choisirOutil('crayon')
    ecrireReglage(CLE_EPAISSEUR, String(i))
  }
  const supprimerChoix = () => {
    const { traits: tous, choix: c } = sur.current
    if (c.size === 0) return
    valider(sansTraits(tous, c), tous)
    setChoix(new Set())
  }
  const decaler = (dx: number, dy: number) => {
    const { traits: tous, choix: c } = sur.current
    if (c.size === 0) return
    const r = deplacerTraits(tous, c, dx, dy)
    valider(r.traits, tous)
    setChoix(r.choix)
  }

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      // Le tableau dessous n'entend rien du clavier tant que le mode est ouvert.
      e.stopPropagation()
      const s = sur.current
      const cmd = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const pris = () => {
        e.preventDefault()
      }
      if (cmd && k === 'z') {
        pris()
        if (e.shiftKey) retablir()
        else annuler()
        return
      }
      if (cmd && k === 's') {
        pris()
        enregistrer()
        return
      }
      if (cmd && k === 'a') {
        pris()
        if (s.outil === 'selection') setChoix(new Set(s.traits))
        return
      }
      if (cmd && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        pris()
        return
      }
      if (e.key === 'Escape') {
        pris()
        if (s.volet) setVolet(null)
        else if (s.outil === 'selection' && s.choix.size > 0) setChoix(new Set())
        else abandonner()
        return
      }
      if (cmd || e.altKey || (e.target as HTMLElement).tagName === 'INPUT') return
      if (k === 'd' || k === 'm' || k === 'b') choisirOutil('crayon')
      else if (k === 'v' || k === 's') choisirOutil('selection')
      else if (k === 'e') choisirOutil('gomme')
      else if (k === 'c') setVolet((v) => (v === 'couleur' ? null : s.outil === 'gomme' ? null : 'couleur'))
      else if (k === 'x') choisirCouleur(s.precedente)
      else if (k >= '1' && k <= '4') choisirEpaisseur(Number(k) - 1)
      else if (s.outil === 'selection' && (k === 'delete' || k === 'backspace')) supprimerChoix()
      else if (s.outil === 'selection' && k.startsWith('arrow')) {
        const d = decalageFleche(k, e.shiftKey, 1 / (contexte.camera.echelle * 10))
        if (d) decaler(d[0], d[1])
      } else return
      pris()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
    // Les actions lisent `sur` : l'écouteur se pose une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rayon = (px: number) => px / echelle
  const largeurTrait = () => epaisseurFeuille(EPAISSEURS_TRAIT[epaisseur]!.px, echelle)

  const abandonnerGeste = () => {
    const g = geste.current
    geste.current = null
    pointeur.current = null
    setEnCours(null)
    setMarquise(null)
    setEffacee(false)
    if (g && (g.type === 'gomme' || g.type === 'deplacer')) setTraits(g.avant)
    if (g?.type === 'deplacer') setChoix(g.choix)
  }

  /** Pose la caméra : la toile dessous la suit (et la borne), la couche reprend celle que la toile a gardée. */
  const poserCamera = (c: cam.Camera, enCours: boolean) => {
    const gardee = contexte.poserCamera?.(c, enCours) ?? c
    setCamera(gardee)
    sur.current.camera = gardee
    if (!enCours) setCameraTraits(gardee)
    return gardee
  }
  const mesure = (): { milieu: PointEcran; ecart: number } => {
    const tous = [...doigts.current.values()]
    const milieu = { x: tous.reduce((n, p) => n + p.x, 0) / tous.length, y: tous.reduce((n, p) => n + p.y, 0) / tous.length }
    const [a, b] = tous
    return { milieu, ecart: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 }
  }
  /** Les doigts (re)prennent la vue d'où elle est : un doigt posé ou levé en route ne la fait pas sauter. */
  const commencerNavigation = () => {
    navigation.current = { camera: sur.current.camera, ...mesure() }
  }
  const naviguer = () => {
    const n = navigation.current
    if (!n || doigts.current.size === 0) return
    const m = mesure()
    let c = n.camera
    if (n.ecart > 0 && m.ecart > 0) {
      const k = Math.min(cam.ECHELLE_MAX, Math.max(cam.ECHELLE_MIN_PLAFOND, (n.camera.echelle * m.ecart) / n.ecart))
      c = cam.echelleAutour(n.camera, k, n.milieu)
    }
    c = cam.defiler(c, m.milieu.x - n.milieu.x, m.milieu.y - n.milieu.y)
    const tc = toucher.current
    if (tc && Math.hypot(m.milieu.x - tc.x, m.milieu.y - tc.y) > TOUCHER_PX) toucher.current = null
    poserCamera(c, true)
  }
  /** Un toucher du doigt quand la couche est venue sous le Pencil : on enregistre (ou on referme s'il n'y a rien). */
  const toucherSurLaFeuille = () => {
    if (!appui) return
    if (sur.current.modifie) enregistrer()
    else abandonner()
  }

  /**
   * Un appui sur la feuille. Les doigts mènent la vue dès qu'un stylet s'est montré sur l'appareil, ou à deux ; sinon
   * un doigt seul dessine comme une souris. Pendant que le Pencil écrit, une paume posée ne fait rien.
   */
  const debut = (e: PointerEvent, cible: globalThis.Element | null) => {
    noterCrayon(e)
    if (e.pointerType === 'touch') {
      doigts.current.set(e.pointerId, ecran(e))
      const p = pointeur.current
      if (p && p.type !== 'touch') return
      if (p && doigts.current.size >= 2) abandonnerGeste()
      if (doigts.current.size >= 2 || crayonVu()) {
        toucher.current = doigts.current.size === 1 ? { ...ecran(e), t: e.timeStamp } : null
        try {
          cible?.setPointerCapture(e.pointerId)
        } catch {
          // Sans capture, les doigts mènent la vue tant qu'ils restent sur la couche.
        }
        return commencerNavigation()
      }
    }
    if (e.button !== 0 || geste.current) return
    // Le Pencil se pose pendant que les doigts tiraient la vue : elle reste où elle est, le trait commence.
    if (navigation.current) {
      navigation.current = null
      poserCamera(sur.current.camera, false)
    }
    setVolet(null)
    try {
      cible?.setPointerCapture(e.pointerId)
    } catch {
      // Sans capture, le trait suit tant que le pointeur reste sur la couche.
    }
    pointeur.current = { id: e.pointerId, type: e.pointerType }
    const p = ici(e)
    if (outil === 'crayon') {
      const trace = commencerTrace(p.x, p.y, e)
      geste.current = { type: 'trace', trace, epaisseur: largeurTrait(), affinage: affinageDe(epaisseur) }
      setEnCours(trace)
    } else if (outil === 'gomme') {
      geste.current = { type: 'gomme', avant: traits }
      setVise(null)
      effacer(p.x, p.y)
    } else {
      const i = traitVise(traits, p.x, p.y, rayon(CAPTURE_PX))
      const ajoute = e.shiftKey || e.metaKey || e.ctrlKey
      if (i >= 0) {
        const trait = traits[i]!
        const { choix: suite, glisse } = appuiSurTrait(choix, trait, ajoute)
        setChoix(suite)
        // Retirer un trait de la sélection n'ouvre pas de glisser.
        if (glisse) geste.current = { type: 'deplacer', depart: p, avant: traits, choix: suite }
      } else {
        if (!ajoute) setChoix(new Set())
        geste.current = { type: 'marquise', depart: p, ecran: ecran(e), ajoute, base: ajoute ? choix : new Set() }
      }
    }
  }
  /** La gomme enlève les traits entiers qu'elle touche, une seule fois chacun. */
  const effacer = (x: number, y: number) => setTraits((tous) => gommer(tous, x, y, rayon(GOMME_PX)))
  const deplacement = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && doigts.current.has(e.pointerId)) {
      doigts.current.set(e.pointerId, ecran(e))
      if (navigation.current) return naviguer()
    }
    const p0 = pointeur.current
    if (p0 && p0.id !== e.pointerId) return
    const g = geste.current
    if (g) setEffacee(presDuBas(e.clientY, window.innerHeight))
    if (!g) {
      if (outil === 'gomme' && e.pointerType !== 'touch') {
        const p = ici(e)
        const i = traitVise(traits, p.x, p.y, rayon(GOMME_PX))
        const v = i < 0 ? null : traits[i]!
        setVise((anc) => (anc === v ? anc : v))
      }
      return
    }
    // Le navigateur regroupe plusieurs mouvements en un (le Pencil en donne 240 par seconde) : on les reprend tous.
    const evenements = e.getCoalescedEvents?.() ?? []
    const sources = evenements.length > 0 ? evenements : [e]
    if (g.type === 'trace') {
      let suite = g.trace
      for (const m of sources) {
        const p = ici(m)
        suite = prolongerTrace(suite, p.x, p.y, m)
      }
      if (suite !== g.trace) {
        g.trace = suite
        setEnCours(suite)
      }
    } else if (g.type === 'gomme') {
      for (const m of sources) {
        const p = ici(m)
        effacer(p.x, p.y)
      }
    } else if (g.type === 'deplacer') {
      const p = ici(e)
      const r = deplacerTraits(g.avant, g.choix, p.x - g.depart.x, p.y - g.depart.y)
      setTraits(r.traits)
      setChoix(r.choix)
    } else {
      const s = ecran(e)
      setMarquise({ x0: g.ecran.x, y0: g.ecran.y, x1: s.x, y1: s.y })
    }
  }
  /** Un doigt levé : la vue se pose quand le dernier part, ou repart des doigts qui restent. Rend vrai s'il menait la vue. */
  const leverDoigt = (e: PointerEvent): boolean => {
    if (e.pointerType !== 'touch' || !doigts.current.delete(e.pointerId)) return false
    if (!navigation.current) return false
    if (doigts.current.size > 0) {
      toucher.current = null
      commencerNavigation()
      return true
    }
    navigation.current = null
    poserCamera(sur.current.camera, false)
    const tc = toucher.current
    toucher.current = null
    if (tc && e.timeStamp - tc.t < TOUCHER_MS) toucherSurLaFeuille()
    return true
  }
  const fin = (e: PointerEvent) => {
    if (leverDoigt(e)) return
    const p0 = pointeur.current
    if (!p0 || p0.id !== e.pointerId) return
    pointeur.current = null
    const g = geste.current
    geste.current = null
    setEffacee(false)
    if (!g) return
    if (g.type === 'trace') {
      setEnCours(null)
      valider([...traits, traitFini(g.trace, couleur, g.epaisseur, g.affinage)], traits)
    } else if (g.type === 'gomme') {
      if (traits !== g.avant) setHisto((h) => noter(h, g.avant))
    } else if (g.type === 'deplacer') {
      if (traits !== g.avant) setHisto((h) => noter(h, g.avant))
    } else {
      const m = marquise
      setMarquise(null)
      if (!m) return
      const c = sur.current.camera
      const a = cam.versTableau(c, { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1) })
      const b = cam.versTableau(c, { x: Math.max(m.x0, m.x1), y: Math.max(m.y0, m.y1) })
      const dedans = traitsDansMarquise(traits, { x0: a.x, y0: a.y, x1: b.x, y1: b.y })
      setChoix(new Set([...g.base, ...dedans]))
    }
  }
  const annulerPointeur = (e: PointerEvent) => {
    if (leverDoigt(e)) return
    if (pointeur.current?.id === e.pointerId) abandonnerGeste()
  }

  // Les écouteurs posés hors de React (le Pencil hérité de la toile, la molette, le double toucher) appellent la
  // dernière version des gestes.
  const gestes = useRef({ debut, deplacement, fin, annulerPointeur })
  gestes.current = { debut, deplacement, fin, annulerPointeur }

  // Le Pencil qui a ouvert la couche : son trait commence là où il s'est posé. Ses mouvements visent encore ce qu'il a
  // touché sur la toile (iOS garde le pointeur à sa première cible) : on les prend au document, avant tout le monde.
  useLayoutEffect(() => {
    if (!appui) return
    const id = appui.pointerId
    gestes.current.debut(appui, null)
    const prendre = (f: (e: PointerEvent) => void, dernier: boolean) => (e: PointerEvent) => {
      if (e.pointerId !== id) return
      e.stopPropagation()
      f(e)
      if (dernier) arreter()
    }
    const bouge = prendre((e) => gestes.current.deplacement(e), false)
    const leve = prendre((e) => gestes.current.fin(e), true)
    const annule = prendre((e) => gestes.current.annulerPointeur(e), true)
    const arreter = () => {
      document.removeEventListener('pointermove', bouge, true)
      document.removeEventListener('pointerup', leve, true)
      document.removeEventListener('pointercancel', annule, true)
    }
    document.addEventListener('pointermove', bouge, true)
    document.addEventListener('pointerup', leve, true)
    document.addEventListener('pointercancel', annule, true)
    return arreter
    // L'appui ne change pas pendant la vie de la couche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Le double toucher du Pencil change d'outil, comme dans Notes : la gomme et retour, l'outil d'avant, ou un volet.
  useEffect(() => {
    const double = (ev: Event) => {
      const action = (ev as CustomEvent<ActionDoubleToucher>).detail
      const s = sur.current
      if (action === 'gomme') choisirOutil(s.outil === 'gomme' ? (outilAvant.current === 'gomme' ? 'crayon' : outilAvant.current) : 'gomme')
      else if (action === 'precedent') choisirOutil(outilAvant.current)
      else if (action === 'couleurs') setVolet((v) => (v === 'couleur' ? null : 'couleur'))
      else if (action === 'epaisseur') setVolet((v) => (v === 'epaisseur' ? null : 'epaisseur'))
    }
    window.addEventListener(EVENEMENT_DOUBLE_TOUCHER, double)
    return () => window.removeEventListener(EVENEMENT_DOUBLE_TOUCHER, double)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La molette et le trackpad déplacent la vue ; Ctrl (le pincement du trackpad) zoome autour du pointeur.
  const feuille = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const f = feuille.current
    if (!f) return
    let minuteur: ReturnType<typeof setTimeout> | undefined
    const molette = (e: WheelEvent) => {
      const c = sur.current.camera
      const suite = e.ctrlKey
        ? cam.echelleAutour(c, Math.min(cam.ECHELLE_MAX, Math.max(cam.ECHELLE_MIN_PLAFOND, c.echelle * Math.exp(-e.deltaY * 0.03))), ecran(e))
        : cam.defiler(c, -e.deltaX, -e.deltaY)
      poserCamera(suite, true)
      clearTimeout(minuteur)
      minuteur = setTimeout(() => poserCamera(sur.current.camera, false), 150)
    }
    f.addEventListener('wheel', molette, { passive: true })
    return () => {
      clearTimeout(minuteur)
      f.removeEventListener('wheel', molette)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Les chemins se refont quand les traits changent, ou quand la vue se pose : pendant que les doigts la tirent, un
  // transform les fait suivre sans rien recalculer.
  const kTraits = cam.PX_PAR_UG * cameraTraits.echelle
  const chemins = useMemo(
    () =>
      new Map(
        traits.map((tr) => [
          tr,
          dessinTrait(
            tr.points.map((v, i) => (v - (i % 2 === 0 ? cameraTraits.origine.x : cameraTraits.origine.y)) * kTraits),
            tr.epaisseur * kTraits,
            tr.affinage,
            true,
            pressionsDe(tr),
          ),
        ]),
      ),
    [traits, cameraTraits, kTraits],
  )
  const glisse = echelle / kTraits
  const suivre =
    camera === cameraTraits
      ? undefined
      : `translate(${(cameraTraits.origine.x - origine.x) * echelle} ${(cameraTraits.origine.y - origine.y) * echelle}) scale(${glisse})`
  const px = (tr: Trait) => tr.epaisseur * echelle
  const enCoursTrait: Trait | null = enCours
    ? { points: enCours.points, ...(enCours.pressions ? { pressions: enCours.pressions } : {}), couleur, epaisseur: largeurTrait(), affinage: affinageDe(epaisseur) }
    : null

  const desactive = { couleur: outil === 'gomme' || (outil === 'selection' && choix.size === 0), epaisseur: outil !== 'crayon' }
  /** Un bouton grisé garde ses événements (aria-disabled, pas disabled) : un double-clic ne le traverse jamais vers la toile. */
  const agir = (grise: boolean, f: () => void) => () => {
    if (!grise) f()
  }
  return (
    <>
      {masque && <style>{`.notak-toile [data-id="${masque}"] { visibility: hidden; }`}</style>}
      <svg
        ref={feuille}
        className="notak-dessin-libre-feuille"
        data-outil={outil}
        style={outil === 'crayon' ? { cursor: curseurCrayon(couleur) } : undefined}
        onPointerDown={(e) => debut(e.nativeEvent, e.currentTarget)}
        onPointerMove={(e) => deplacement(e.nativeEvent)}
        onPointerUp={(e) => fin(e.nativeEvent)}
        onPointerCancel={(e) => annulerPointeur(e.nativeEvent)}
        onPointerLeave={() => setVise(null)}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <g transform={suivre}>
          {traits.map((tr, i) => (
            <g key={i}>
              {outil === 'gomme' && vise === tr && (
                <path {...attributsTrait(chemins.get(tr)!, ROUGE_GOMME, (2 * CONTOUR_GOMME_PX) / glisse)} />
              )}
              {outil === 'selection' && choix.has(tr) && (
                <path {...attributsTrait(chemins.get(tr)!, 'var(--notak-accent)', (2 * CONTOUR_PX) / glisse)} />
              )}
              <path {...attributsTrait(chemins.get(tr)!, couleurAffichee(tr.couleur, true))} />
            </g>
          ))}
        </g>
        {enCoursTrait && (
          <path
            {...attributsTrait(
              dessinTrait(versEcran(enCoursTrait.points), px(enCoursTrait), enCoursTrait.affinage, false, enCoursTrait.pressions),
              couleurAffichee(couleur, true),
            )}
          />
        )}
        {marquise && (
          <rect
            className="notak-dessin-libre-marquise"
            x={Math.min(marquise.x0, marquise.x1)}
            y={Math.min(marquise.y0, marquise.y1)}
            width={Math.abs(marquise.x1 - marquise.x0)}
            height={Math.abs(marquise.y1 - marquise.y0)}
          />
        )}
      </svg>
      <div
        className="notak-croquis-barre notak-dessin-libre-barre"
        role="toolbar"
        aria-label={t('dessin.surToile')}
        data-effacee={effacee || undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button type="button" title={`${t('dessin.crayon')} (D)`} aria-label={t('dessin.crayon')} aria-pressed={outil === 'crayon'} onClick={() => choisirOutil('crayon')}>
          {ico('croquis')}
        </button>
        <button type="button" title={`${t('dessin.selection')} (V)`} aria-label={t('dessin.selection')} aria-pressed={outil === 'selection'} onClick={() => choisirOutil('selection')}>
          {ico('pointeur')}
        </button>
        <button type="button" title={`${t('dessin.gomme')} (E)`} aria-label={t('dessin.gomme')} aria-pressed={outil === 'gomme'} onClick={() => choisirOutil('gomme')}>
          {ico('gomme')}
        </button>
        <span className="notak-croquis-sep" role="separator" />
        <span className="notak-croquis-volet-hote">
          <button
            type="button"
            title={`${t('couleur.titre')} (C)`}
            aria-label={t('couleur.titre')}
            aria-expanded={volet === 'couleur'}
            aria-disabled={desactive.couleur || undefined}
            onClick={agir(desactive.couleur, () => setVolet(volet === 'couleur' ? null : 'couleur'))}
          >
            <span className="notak-croquis-pastille" style={{ background: couleur }} />
          </button>
          {volet === 'couleur' && !desactive.couleur && <VoletCouleur couleur={couleur} choisir={choisirCouleur} suggerees={suggerees} />}
        </span>
        <span className="notak-croquis-volet-hote">
          <button
            type="button"
            title={`${t('croquis.epaisseur')} (1-4)`}
            aria-label={t('croquis.epaisseur')}
            aria-expanded={volet === 'epaisseur'}
            aria-disabled={desactive.epaisseur || undefined}
            onClick={agir(desactive.epaisseur, () => setVolet(volet === 'epaisseur' ? null : 'epaisseur'))}
          >
            <BarreEpaisseur i={epaisseur} />
          </button>
          {volet === 'epaisseur' && !desactive.epaisseur && <VoletEpaisseur epaisseur={epaisseur} choisir={choisirEpaisseur} />}
        </span>
        <span className="notak-croquis-sep" role="separator" />
        <button type="button" title={`${t('espace.annuler')} (⌘Z)`} aria-label={t('espace.annuler')} aria-disabled={histo.passe.length === 0 || undefined} onClick={agir(histo.passe.length === 0, annuler)}>
          {ico('annuler')}
        </button>
        <button type="button" title={`${t('espace.retablir')} (⌘⇧Z)`} aria-label={t('espace.retablir')} aria-disabled={histo.futur.length === 0 || undefined} onClick={agir(histo.futur.length === 0, retablir)}>
          {ico('retablir')}
        </button>
        <span className="notak-croquis-espace" />
        <button type="button" className="notak-croquis-texte" title="Esc" onClick={abandonner}>
          {modifie ? t('croquis.abandonner') : t('commun.annuler')}
        </button>
        <button type="button" className="notak-croquis-texte notak-croquis-enregistrer" title="⌘S" aria-disabled={!modifie || undefined} onClick={agir(!modifie, enregistrer)}>
          {t('croquis.enregistrer')}
        </button>
      </div>
    </>
  )
}

/** « Modifier le dessin », dans la barre de sélection : rouvre le dessin dans le mode, avec ses traits. */
export function OutilsDessin({ elements, contexte }: PropsOutils<Dessin>) {
  if (contexte.services.lectureSeule || elements.length !== 1) return null
  return <BoutonOutil icone="dessin" titre={t('dessin.modifier')} libelle={t('dessin.modifier')} onClick={() => ouvrirDessinLibre(contexte, elements[0]!)} />
}
