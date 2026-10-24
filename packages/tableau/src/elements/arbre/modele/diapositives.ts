import type { Id, ReglagesDiapo } from '../../../coeur/tableau'
import { type Lecture, descendDe, enfantsDe, profondeur } from './sujets'

/**
 * Le mode Pitch (docs/XMIND.md § 9) : une carte devient une suite de diapositives, une par sujet que les réglages
 * montrent, plus une « liste » par sujet qui a des sous-sujets. Ce module ne dessine rien : il décide quelles
 * diapositives existent, dans quel ordre, et en combien d'étapes chacune se découvre.
 */

export type Visibilite = 'visible' | 'masque'
export type Livraison = NonNullable<ReglagesDiapo['livraison']>
export type MiseEnPage = NonNullable<ReglagesDiapo['miseEnPage']>
export type PlaceImage = NonNullable<ReglagesDiapo['image']>
export type ChampVisibilite = 'sujet' | 'resume' | 'liste'

/** Les mises en page d'une liste, dans l'ordre du sélecteur. */
export const MISES_EN_PAGE: readonly MiseEnPage[] = ['accolade', 'puces', 'paroles', 'arete', 'chronologie']
export const LIVRAISONS: readonly Livraison[] = ['percer', 'un-par-un', 'tout']
export const PLACES_IMAGE: readonly PlaceImage[] = ['gauche', 'droite', 'dessus', 'dessous', 'fond']

/** Ce que Auto décide quand rien n'est dit. */
export const MISE_EN_PAGE_DEFAUT: MiseEnPage = 'puces'
export const LIVRAISON_DEFAUT: Livraison = 'un-par-un'
export const IMAGE_DEFAUT: PlaceImage = 'gauche'

/** Un réglage tel qu'il s'applique : sa valeur, et si c'est Auto qui l'a décidée. */
export interface Resolu<T> {
  valeur: T
  auto: boolean
}

/**
 * La visibilité d'une diapositive pour ce sujet. Auto : le central et les sujets principaux (et les flottants) sont
 * des diapositives, les sous-sujets non ; un résumé en est une ; une liste existe quand le sujet est une diapositive
 * et qu'il a des sous-sujets. Un sujet de résumé suit « résumé » plutôt que « sujet » tant que « sujet » n'est pas dit.
 */
export function visibilite(l: Lecture, id: Id, champ: ChampVisibilite): Resolu<Visibilite> {
  const s = l.sujets.get(id)
  const d = s?.diapo
  const dit = d?.[champ]
  if (dit) return { valeur: dit, auto: false }
  if (champ === 'resume') return { valeur: 'visible', auto: true }
  if (champ === 'sujet') {
    if (s?.genre === 'resume') return { valeur: visibilite(l, id, 'resume').valeur, auto: true }
    return { valeur: profondeur(l, id) <= 1 ? 'visible' : 'masque', auto: true }
  }
  const avecEnfants = enfantsDe(l, id).length > 0
  return { valeur: avecEnfants && visibilite(l, id, 'sujet').valeur === 'visible' ? 'visible' : 'masque', auto: true }
}

export const livraisonDe = (l: Lecture, id: Id): Resolu<Livraison> => {
  const v = l.sujets.get(id)?.diapo?.livraison
  return v ? { valeur: v, auto: false } : { valeur: LIVRAISON_DEFAUT, auto: true }
}

export const miseEnPageDe = (l: Lecture, id: Id): Resolu<MiseEnPage> => {
  const v = l.sujets.get(id)?.diapo?.miseEnPage
  return v ? { valeur: v, auto: false } : { valeur: MISE_EN_PAGE_DEFAUT, auto: true }
}

export const placeImageDe = (l: Lecture, id: Id): Resolu<PlaceImage> => {
  const v = l.sujets.get(id)?.diapo?.image
  return v ? { valeur: v, auto: false } : { valeur: IMAGE_DEFAUT, auto: true }
}

/** Un sujet qui a sa propre diapositive : la liste de son parent s'arrête à lui au lieu de le dérouler. */
function aSaDiapo(l: Lecture, id: Id): boolean {
  return visibilite(l, id, 'sujet').valeur === 'visible' || (enfantsDe(l, id).length > 0 && visibilite(l, id, 'liste').valeur === 'visible')
}

export interface ItemListe {
  id: Id
  /** 0 pour un sous-sujet direct, 1 pour son enfant… */
  niveau: number
  /** L'étape (à partir de 1) où il paraît : il reste ensuite. */
  etape: number
}

export interface DiapoSujet {
  type: 'sujet'
  sujet: Id
  etapes: 1
}

export interface DiapoListe {
  type: 'liste'
  sujet: Id
  miseEnPage: MiseEnPage
  livraison: Livraison
  items: ItemListe[]
  etapes: number
}

export type Diapo = DiapoSujet | DiapoListe

/** Les sous-sujets d'un sujet à plat, en profondeur d'abord ; on ne descend pas dans ceux qui ont leur propre diapositive. */
function itemsDe(l: Lecture, racine: Id, livraison: Livraison): { items: ItemListe[]; etapes: number } {
  const items: ItemListe[] = []
  let principaux = 0
  const visiter = (id: Id, niveau: number) => {
    if (niveau === 0) principaux++
    const rang = items.length + 1
    // Percer : une étape par sujet. Un par un : une étape par sous-sujet direct, avec ce qu'il porte. Tout : d'un coup.
    items.push({ id, niveau, etape: livraison === 'tout' ? 1 : livraison === 'un-par-un' ? principaux : rang })
    if (aSaDiapo(l, id)) return
    for (const e of enfantsDe(l, id)) visiter(e, niveau + 1)
  }
  for (const e of enfantsDe(l, racine)) visiter(e, 0)
  const etapes = Math.max(1, ...items.map((i) => i.etape))
  return { items, etapes }
}

/** Les diapositives d'une carte, dans l'ordre où on les présente. Au moins une : le sujet central. */
export function diapositives(l: Lecture): Diapo[] {
  const sortie: Diapo[] = []
  const resumesDe = (id: Id) => l.resumes.filter((r) => l.sujets.get(r)?.parent === id)
  const visiter = (id: Id) => {
    if (visibilite(l, id, 'sujet').valeur === 'visible') sortie.push({ type: 'sujet', sujet: id, etapes: 1 })
    if (enfantsDe(l, id).length > 0 && visibilite(l, id, 'liste').valeur === 'visible') {
      const livraison = livraisonDe(l, id).valeur
      sortie.push({ type: 'liste', sujet: id, miseEnPage: miseEnPageDe(l, id).valeur, livraison, ...itemsDe(l, id, livraison) })
    }
    for (const e of enfantsDe(l, id)) visiter(e)
    for (const r of resumesDe(id)) visiter(r)
  }
  if (l.central) {
    visiter(l.central)
    for (const f of l.flottants) visiter(f)
  }
  return sortie.length > 0 ? sortie : l.central ? [{ type: 'sujet', sujet: l.central, etapes: 1 }] : []
}

/** Un pas de la présentation : une diapositive, à une de ses étapes (à partir de 1). */
export interface Pas {
  diapo: number
  etape: number
}

export const pasDe = (diapos: readonly Diapo[]): Pas[] => diapos.flatMap((d, diapo) => Array.from({ length: d.etapes }, (_, i) => ({ diapo, etape: i + 1 })))

/** Où commencer en partant d'un sujet : sa diapositive, sinon la première de sa branche, sinon celle d'un ancêtre. */
export function pasDeDepart(l: Lecture, diapos: readonly Diapo[], pas: readonly Pas[], id: Id | undefined): number {
  if (id === undefined) return 0
  const premier = (garde: (d: Diapo) => boolean) => {
    const i = diapos.findIndex(garde)
    return i < 0 ? -1 : pas.findIndex((p) => p.diapo === i)
  }
  let x = premier((d) => d.sujet === id)
  if (x >= 0) return x
  x = premier((d) => descendDe(l, d.sujet, id))
  if (x >= 0) return x
  for (let p = l.sujets.get(id)?.parent; p !== undefined; p = l.sujets.get(p)?.parent) {
    x = premier((d) => d.sujet === p)
    if (x >= 0) return x
  }
  return 0
}

/** « Passer la branche actuelle » : le premier pas dont le sujet n'est ni celui de la diapositive ni dessous ; `null` s'il n'y en a plus. */
export function pasApresBranche(l: Lecture, diapos: readonly Diapo[], pas: readonly Pas[], courant: number): number | null {
  const ici = diapos[pas[courant]?.diapo ?? -1]
  if (!ici) return null
  const dehors = ici.sujet === l.central ? (d: Diapo) => d.sujet !== ici.sujet : (d: Diapo) => !descendDe(l, d.sujet, ici.sujet)
  // Le central a une diapositive de sujet puis une liste : on saute seulement ce qui est à lui.
  for (let i = courant + 1; i < pas.length; i++) if (dehors(diapos[pas[i]!.diapo]!)) return i
  return null
}

/** « Retour au sujet parent » : la diapositive du sujet d'une liste, sinon celle de l'ancêtre le plus proche qui en a une. */
export function pasParent(l: Lecture, diapos: readonly Diapo[], pas: readonly Pas[], courant: number): number {
  const ici = diapos[pas[courant]?.diapo ?? -1]
  if (!ici) return 0
  if (ici.type === 'liste') {
    const sujet = diapos.findIndex((d) => d.type === 'sujet' && d.sujet === ici.sujet)
    if (sujet >= 0) return pas.findIndex((p) => p.diapo === sujet)
  }
  for (let p = l.sujets.get(ici.sujet)?.parent; p !== undefined; p = l.sujets.get(p)?.parent) {
    const i = diapos.findIndex((d) => d.sujet === p)
    if (i >= 0) return pas.findIndex((x) => x.diapo === i)
  }
  return 0
}
