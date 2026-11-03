import type { Trait } from '../../coeur/tableau'
import { VERSION_EPURE } from './trace'

/**
 * Le relevé des derniers traits du dessin : tout ce que le stylet a envoyé, tel quel (chaque `pointermove`, ses points
 * groupés par `getCoalescedEvents`, leurs instants et pressions, le nombre de points prédits), et le trait qui en est
 * sorti. Il reste en mémoire, rien n'en part : Réglages › Apple Pencil le copie, pour le coller dans un signalement et
 * rejouer le trait ailleurs que sur l'appareil. C'est ce qui manquait pour savoir comment WebKit livre les points du
 * Pencil au lieu de le deviner.
 */

/** Un point brut : instant (ms depuis l'appui), x et y d'écran (px, relatifs à la couche), pression, type. */
type PointBrut = [t: number, x: number, y: number, p: number]

interface EvenementBrut {
  /** d : appui, m : mouvement, u : levé, c : annulé. */
  k: 'd' | 'm' | 'u' | 'c'
  t: number
  x: number
  y: number
  p: number
  /** Les points groupés, s'il y en a (le dernier est d'habitude l'événement lui-même). */
  g?: PointBrut[]
  /** Combien de points prédits. */
  pr?: number
}

export interface ReleveTrait {
  type: string
  /** Pixels par unité de grille au moment du trait, et l'origine de la vue : de quoi passer de l'écran au tableau. */
  echelle: number
  origine: { x: number; y: number }
  /** L'épaisseur du trait, en unités de grille, et son affinage. */
  epaisseur: number
  affinage: number
  evenements: EvenementBrut[]
  trait?: Trait
}

/** Assez pour quelques traits de plusieurs secondes, sans peser. */
const TRAITS_GARDES = 3
const EVENEMENTS_MAX = 4000

let traits: ReleveTrait[] = []
let enCours: { releve: ReleveTrait; depart: number; gauche: number; haut: number } | null = null

const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000

function brut(e: PointerEvent, k: EvenementBrut['k']): EvenementBrut {
  const c = enCours!
  const point = (q: PointerEvent): PointBrut => [r2(q.timeStamp - c.depart), r2(q.clientX - c.gauche), r2(q.clientY - c.haut), r3(q.pressure)]
  const groupes = k === 'm' ? (e.getCoalescedEvents?.() ?? []) : []
  const predits = k === 'm' ? (e.getPredictedEvents?.() ?? []) : []
  const [t, x, y, p] = point(e)
  return { k, t, x, y, p, ...(groupes.length ? { g: groupes.map(point) } : {}), ...(predits.length ? { pr: predits.length } : {}) }
}

/** Un trait commence : `couche` est l'élément dont les coordonnées d'écran partent. */
export function releverDebut(e: PointerEvent, couche: { getBoundingClientRect(): { left: number; top: number } }, vue: Omit<ReleveTrait, 'type' | 'evenements' | 'trait'>) {
  const r = couche.getBoundingClientRect()
  enCours = { releve: { type: e.pointerType, ...vue, evenements: [] }, depart: e.timeStamp, gauche: r.left, haut: r.top }
  enCours.releve.evenements.push(brut(e, 'd'))
  traits = [...traits.slice(-(TRAITS_GARDES - 1)), enCours.releve]
}

export function releverMouvement(e: PointerEvent) {
  if (enCours && enCours.releve.evenements.length < EVENEMENTS_MAX) enCours.releve.evenements.push(brut(e, 'm'))
}

/** Le trait se finit : levé (avec le trait gardé) ou annulé. */
export function releverFin(e: PointerEvent | null, trait?: Trait) {
  if (!enCours) return
  if (e) enCours.releve.evenements.push(brut(e, trait ? 'u' : 'c'))
  if (trait) enCours.releve.trait = trait
  enCours = null
}

/** Le relevé, en texte à coller : l'appareil, la version de l'épuration, et les derniers traits. */
export function releveEnTexte(): string {
  return JSON.stringify({
    agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    densite: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    epure: VERSION_EPURE,
    traits,
  })
}

export const nombreDeTraitsReleves = () => traits.length

/** Pour les essais : repartir de rien. */
export function oublierReleves() {
  traits = []
  enCours = null
}
