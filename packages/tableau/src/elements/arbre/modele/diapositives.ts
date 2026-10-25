import { type Arbre, type Id, type Sujet, texteBrut } from '../../../coeur/tableau'
import type { RatioPitch } from '../themesPitch'
import {
  type Commande,
  type Disposition,
  type Effet,
  type Gabarit,
  type Livraison,
  type MiseEnPage,
  type Niveau,
  type PlaceImage,
  dispositionDeListe,
  effetDeTransition,
  estPortrait,
  formeDuResume,
  gabaritDeListe,
  gabaritDeResume,
  gabaritDeSujet,
  miseEnPageParDefaut,
  placeImageAuto,
  titreCourt,
} from './gabarits'
import { type Lecture, enfantsDe } from './sujets'

/**
 * Le mode Pitch (docs/XMIND.md § 12, relevé 10) : une carte devient une suite de diapositives. Chaque étape d'une
 * liste est une diapositive à elle ; une liste ne montre que les enfants directs, et la séquence de chaque enfant
 * s'intercale entre ses étapes. Une diapositive peut exister et être sautée : elle reste dans la suite, la navigation
 * la franchit.
 *
 * Xmind construit une liste doublement chaînée, paresseusement, dont les maillons s'appellent par des alias
 * (`introOfTopic`, `startOfTopic`, `endOfTopic`, `outroOfTopic`…). Notak la calcule d'avance, à plat : chaque lien de
 * Xmind relie deux voisins de cette suite, si bien que « suivante » et « précédente » sont l'indice d'à côté, et les
 * alias deviennent des tables d'indices. La séquence est la même.
 */

export type { Gabarit, Livraison, MiseEnPage, Niveau, PlaceImage } from './gabarits'
export type Visibilite = 'visible' | 'masque'
export type ChampVisibilite = 'sujet' | 'resume' | 'liste'

/** Les mises en page d'une liste, dans l'ordre du sélecteur. */
export const MISES_EN_PAGE: readonly MiseEnPage[] = ['accolade', 'puces', 'paroles', 'arete', 'chronologie']
export const LIVRAISONS: readonly Livraison[] = ['percer', 'un-par-un', 'tout']
export const PLACES_IMAGE: readonly PlaceImage[] = ['gauche', 'droite', 'dessus', 'dessous', 'fond']

/** Ce que Auto décide quand rien n'est dit : Xmind perce. */
export const LIVRAISON_DEFAUT: Livraison = 'percer'

/** Un réglage tel qu'il s'applique : sa valeur, et si c'est Auto qui l'a décidée. */
export interface Resolu<T> {
  valeur: T
  auto: boolean
}

/** Ce qui, hors de la carte, change les diapositives. */
export interface Contexte {
  /** Le rapport des diapositives (16:9 si absent) : le portrait change les gabarits et la place des images. */
  ratio?: RatioPitch | undefined
  /** Les plages des résumés (`Arbre.resumes`) : sans elles, un résumé couvre tous les enfants de son sujet. */
  resumes?: Arbre['resumes'] | undefined
  /** Le titre de ce sujet est tronqué dans la liste de son parent (une mesure du dessin) ; jamais si absent. */
  titreTronque?: ((id: Id) => boolean) | undefined
}

// — Les sujets vus par le mode Pitch —

/** Flottant, central, résumé, sous-sujet (son parent a un parent), sinon principal (relevé 10 § 1.4). */
export function niveauDe(l: Lecture, id: Id): Niveau {
  if (l.flottants.includes(id)) return 'flottant'
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined) return 'central'
  if (s.genre === 'resume') return 'resume'
  return l.sujets.get(s.parent)?.parent !== undefined ? 'sous-sujet' : 'principal'
}

/** L'image d'un sujet telle que le Pitch la voit : une image, une illustration ou une équation (vectorielles). */
export function imageDe(s: Sujet | undefined): { largeur: number; hauteur: number; svg: boolean } | null {
  if (!s) return null
  if (s.image && s.image.l > 0 && s.image.h > 0) return { largeur: s.image.l, hauteur: s.image.h, svg: false }
  if (s.vignette && s.vignette.l > 0 && s.vignette.h > 0) return { largeur: s.vignette.l, hauteur: s.vignette.h, svg: true }
  if (s.equation) return { largeur: 0, hauteur: 0, svg: true }
  return null
}

/** « Illustré » : une image, et pas de titre. */
export const illustre = (s: Sujet | undefined): boolean => !!imageDe(s) && !s?.titre.trim()

/**
 * La chaîne d'enfants uniques : les ancêtres consécutifs qui n'ont qu'un enfant (en partant du parent), plus les
 * descendants consécutifs uniques (en partant du sujet). À 3 ou plus, le sujet a sa diapositive et ses listes sautent.
 */
export function chaine(l: Lecture, id: Id): number {
  let n = 0
  for (let p = attacheA(l, id); p !== undefined && enfantsDe(l, p).length === 1; p = attacheA(l, p)) n++
  for (let x: Id | undefined = id; x !== undefined && enfantsDe(l, x).length === 1; x = enfantsDe(l, x)[0]) n++
  return n
}

/** Le parent d'un sujet attaché ; un flottant ou un résumé n'est pas dans les enfants du sien. */
function attacheA(l: Lecture, id: Id): Id | undefined {
  const s = l.sujets.get(id)
  return s?.genre ? undefined : s?.parent
}

const ARETES = new Set(['arete-gauche', 'arete-droite'])
const CHRONOLOGIES = new Set(['chronologie-horizontale', 'chronologie-verticale'])

/** La mise en page qu'impose la structure du sujet sur la carte (la sienne, pas celle d'un ancêtre). */
function structureImposee(l: Lecture, id: Id): 'arete' | 'chronologie' | null {
  const st = l.sujets.get(id)?.structure
  return st && ARETES.has(st) ? 'arete' : st && CHRONOLOGIES.has(st) ? 'chronologie' : null
}

// — Les réglages résolus —

export const livraisonDe = (l: Lecture, id: Id): Resolu<Livraison> => {
  const v = l.sujets.get(id)?.diapo?.livraison
  return v ? { valeur: v, auto: false } : { valeur: LIVRAISON_DEFAUT, auto: true }
}

/** La mise en page par défaut d'une liste (relevé 10 § 6.2). */
export function miseEnPageAuto(l: Lecture, id: Id): MiseEnPage {
  const enfants = enfantsDe(l, id)
  return miseEnPageParDefaut({
    niveau: niveauDe(l, id),
    enfants: enfants.length,
    titresCourts: [id, ...enfants].every((x) => titreCourt(l.sujets.get(x)?.titre ?? '')),
    structure: structureImposee(l, id),
    livraison: livraisonDe(l, id).valeur,
  })
}

/** La mise en page choisie dans l'onglet : le réglage, sinon Auto. Les têtes d'arête et de chronologie n'en sont pas. */
export const miseEnPageDe = (l: Lecture, id: Id): Resolu<MiseEnPage> => {
  const v = l.sujets.get(id)?.diapo?.miseEnPage
  return v ? { valeur: v, auto: false } : { valeur: miseEnPageAuto(l, id), auto: true }
}

/** Ce que le parent dit de sa liste, pour l'héritage d'arête et de chronologie : son réglage, sinon sa structure. */
function aretesDuParent(l: Lecture, parent: Id): 'arete' | 'chronologie' | null {
  const m = l.sujets.get(parent)?.diapo?.miseEnPage
  if (m === 'arete' || m === 'chronologie') return m
  return m ? null : structureImposee(l, parent)
}

/** La disposition effective d'une liste : avec les têtes héritées et le réglage admissible (relevé 10 § 6.2). */
export function dispositionDe(l: Lecture, id: Id): Disposition {
  const s = l.sujets.get(id)
  const parent = attacheA(l, id)
  const livraison = livraisonDe(l, id).valeur
  const heritage = parent !== undefined && !listeSautee(l, parent) ? aretesDuParent(l, parent) : null
  return dispositionDeListe({ defaut: miseEnPageAuto(l, id), reglage: s?.diapo?.miseEnPage, livraison, heritage })
}

/** La place qu'Auto donne à l'image du sujet (relevé 10 § 6.1), sans regarder le réglage. */
export function placeImageAutoDe(l: Lecture, id: Id, ratio: RatioPitch = '16:9'): PlaceImage {
  const im = imageDe(l.sujets.get(id))
  return placeImageAuto({ portrait: estPortrait(ratio), largeur: im?.largeur ?? 0, hauteur: im?.hauteur ?? 0, svg: im?.svg ?? false })
}

/** La place de l'image sur la diapositive du sujet : le réglage, sinon Auto. */
export function placeImageDe(l: Lecture, id: Id, ratio: RatioPitch = '16:9'): Resolu<PlaceImage> {
  const v = l.sujets.get(id)?.diapo?.image
  return v ? { valeur: v, auto: false } : { valeur: placeImageAutoDe(l, id, ratio), auto: true }
}

// — La visibilité (relevé 10 § 2) —

/** Toutes les listes de ce sujet sautent : par son réglage, ou par la chaîne d'enfants uniques. */
function listeSautee(l: Lecture, id: Id): boolean {
  return l.sujets.get(id)?.diapo?.liste === 'masque' || chaine(l, id) >= 3
}

/**
 * La diapositive du sujet porte-t-elle ce que la diapositive qui l'introduit ne montre pas ? La liste du parent (ou la
 * diapositive de résumé) montre son titre et ses marqueurs (trois au plus) ; une note, des étiquettes, une image qu'elle
 * ne montre pas, un titre qu'elle tronque, c'est du neuf.
 */
function porteDuNeuf(l: Lecture, id: Id, c: Contexte): boolean {
  const s = l.sujets.get(id)
  if (!s) return false
  if (s.note && texteBrut(s.note).trim()) return true
  if (s.etiquettes?.some((e) => e.trim())) return true
  if ((s.marqueurs?.length ?? 0) > 3) return true
  if (c.titreTronque?.(id)) return true
  if (imageDe(s)) {
    // La liste ne montre les images que si tous les enfants sont illustrés (ses variantes à galerie).
    const parent = s.genre === 'resume' ? undefined : s.parent
    const galerie = parent !== undefined && illustre(s) && enfantsDe(l, parent).every((x) => illustre(l.sujets.get(x)))
    if (!galerie) return true
  }
  return false
}

/** Les règles Auto d'une diapositive de sujet, après le réglage : la chaîne, le niveau, puis le contenu. */
function sujetAuto(l: Lecture, id: Id, c: Contexte): Visibilite {
  if (chaine(l, id) >= 3) return 'visible'
  const niveau = niveauDe(l, id)
  if (niveau === 'central' || niveau === 'flottant') return 'visible'
  const s = l.sujets.get(id)!
  if (niveau === 'principal') {
    const d = dispositionDe(l, s.parent!)
    if (d !== 'arete' && d !== 'chronologie') return 'visible'
  }
  // La règle du contenu : comparé à ce que montre la diapositive qui l'introduit.
  if (niveau === 'resume') {
    if (l.sujets.get(id)?.diapo?.resume === 'masque') return 'visible'
  } else if (listeSautee(l, s.parent!)) return 'visible'
  return porteDuNeuf(l, id, c) ? 'visible' : 'masque'
}

/**
 * La visibilité d'une diapositive pour ce sujet. Le réglage l'emporte, sauf « Visible » sur une liste, que Xmind ne
 * force pas : la liste reste aux règles Auto (la chaîne d'enfants uniques la saute encore).
 */
export function visibilite(l: Lecture, id: Id, champ: ChampVisibilite, c: Contexte = {}): Resolu<Visibilite> {
  const dit = l.sujets.get(id)?.diapo?.[champ]
  if (dit && !(champ === 'liste' && dit === 'visible')) return { valeur: dit, auto: false }
  const auto = visibiliteAuto(l, id, champ, c)
  return dit ? { valeur: auto, auto: false } : { valeur: auto, auto: true }
}

/**
 * Ce que « Auto (…) » affiche dans l'onglet : la règle recalculée sans le réglage du sujet. Une liste n'y est
 * « Masqué » que si la chaîne d'enfants uniques la saute ; un sujet sans enfants n'a pas de liste.
 */
export function visibiliteAuto(l: Lecture, id: Id, champ: ChampVisibilite, c: Contexte = {}): Visibilite {
  if (champ === 'resume') return 'visible'
  if (champ === 'sujet') return sujetAuto(l, id, c)
  return enfantsDe(l, id).length > 0 && chaine(l, id) < 3 ? 'visible' : 'masque'
}

const sujetVisible = (l: Lecture, id: Id, c: Contexte): boolean => {
  const dit = l.sujets.get(id)?.diapo?.sujet
  return dit ? dit === 'visible' : sujetAuto(l, id, c) === 'visible'
}

// — Les diapositives —

/** L'état d'un enfant sur une étape de liste : caché, déjà vu, l'enfant courant, ou montré sans être encore visité. */
export type EtatItem = 'cache' | 'passe' | 'courant' | 'visible'

export interface ItemListe {
  id: Id
  etat: EtatItem
}

interface Commun {
  sujet: Id
  niveau: Niveau
  gabarit: Gabarit
  /** Elle existe dans la suite, mais la navigation la franchit. */
  sautee: boolean
  /** Atteinte en avançant (ou en reculant), elle passe d'elle-même à la suivante (relevé 10 § 5.4). */
  enchaine: { avant: boolean; arriere: boolean }
}

export interface DiapoSujet extends Commun {
  type: 'sujet'
  /** Quand le gabarit porte une image. */
  placeImage?: PlaceImage
}

export interface DiapoListe extends Commun {
  type: 'liste'
  livraison: Livraison
  disposition: Disposition
  /** Les enfants directs, tous, chacun avec son état à cette étape. */
  items: ItemListe[]
  /** Les enfants d'indice 0 à `montre` sont visibles (`numberOfVisibleTopics`). */
  montre: number
  /** L'enfant sur lequel la liste se centre quand elle déborde. */
  centre: number
  /** La première étape (`listOfTopic X 0`) : celle qui fait paraître la liste. */
  premiere: boolean
  /** L'enfant (ou le résumé) dont elle est l'entrée, celui dont elle est la sortie. */
  entreeDe?: Id
  sortieDe?: Id
}

export interface DiapoResume extends Commun {
  type: 'resume'
  /** Les frères résumés, dans l'ordre. */
  plage: Id[]
  forme: 'accolade' | 'trait'
  /** La première (on entre dans le résumé) ou la seconde (on en sort, elle s'enchaîne). */
  moment: 'entree' | 'sortie'
}

/** L'`epilogue` : « Merci », traité comme un sujet central ; il porte l'identifiant de la dernière racine. */
export interface DiapoFin extends Commun {
  type: 'fin'
}

export type Diapo = DiapoSujet | DiapoListe | DiapoResume | DiapoFin

/** La suite des diapositives, et les alias de Xmind devenus des indices dans cette suite. */
export interface Sequence {
  diapos: Diapo[]
  /** `startOfTopic` : la diapositive de sujet. */
  debut: ReadonlyMap<Id, number>
  /** `introOfTopic` : l'étape de la liste du parent où le sujet paraît (pour un flottant, la fin de la racine d'avant). */
  entree: ReadonlyMap<Id, number>
  /** `endOfTopic` : la dernière diapositive de sa séquence. */
  fin: ReadonlyMap<Id, number>
  /** `outroOfTopic` : où l'on revient en sortant du sujet. */
  sortie: ReadonlyMap<Id, number>
  /** `introOfSummary`, `outroOfSummary` : les étapes de liste autour d'un résumé. */
  entreeResume: ReadonlyMap<Id, number>
  sortieResume: ReadonlyMap<Id, number>
}

const RIEN = { avant: false, arriere: false }

/** Les résumés d'un sujet, avec l'indice du premier et du dernier enfant couvert. */
function resumesDe(l: Lecture, id: Id, c: Contexte): { id: Id; de: number; a: number }[] {
  const enfants = enfantsDe(l, id)
  const plages = Object.values(c.resumes ?? {})
  const sortie: { id: Id; de: number; a: number }[] = []
  for (const r of l.resumes) {
    if (l.sujets.get(r)?.parent !== id) continue
    const p = plages.find((x) => x?.sujet === r)
    const de = p ? enfants.indexOf(p.de) : 0
    const a = p ? (p.a !== undefined ? enfants.indexOf(p.a) : de) : enfants.length - 1
    if (de >= 0 && a >= de) sortie.push({ id: r, de, a })
  }
  return sortie
}

/** Les diapositives d'une carte, dans l'ordre où on les présente : le central, ses flottants, puis « Merci ». */
export function sequence(l: Lecture, c: Contexte = {}): Sequence {
  const ratio = c.ratio ?? '16:9'
  const portrait = estPortrait(ratio)
  const diapos: Diapo[] = []
  const debut = new Map<Id, number>()
  const entree = new Map<Id, number>()
  const fin = new Map<Id, number>()
  const sortie = new Map<Id, number>()
  const entreeResume = new Map<Id, number>()
  const sortieResume = new Map<Id, number>()
  const pousser = (d: Diapo) => diapos.push(d) - 1
  /** Une diapositive au moins est montrée dans [de, a[. */
  const montreeEntre = (de: number, a: number) => diapos.slice(de, a).some((d) => !d.sautee)

  const sujetDe = (id: Id) => {
    debut.set(id, diapos.length)
    const s = l.sujets.get(id)
    const avecImage = !!imageDe(s)
    pousser({
      type: 'sujet',
      sujet: id,
      niveau: niveauDe(l, id),
      gabarit: gabaritDeSujet(avecImage),
      sautee: !sujetVisible(l, id, c),
      enchaine: RIEN,
      ...(avecImage ? { placeImage: placeImageDe(l, id, ratio).valeur } : {}),
    })
    if (enfantsDe(l, id).length > 0) listesDe(id)
    fin.set(id, diapos.length - 1)
  }

  const resumeDe = (r: Id, plage: Id[]) => {
    const commun = { sujet: r, niveau: 'resume' as const, gabarit: gabaritDeResume(portrait), plage, forme: formeDuResume(plage.length) }
    const masque = l.sujets.get(r)?.diapo?.resume === 'masque'
    pousser({ type: 'resume', ...commun, moment: 'entree', sautee: masque, enchaine: RIEN })
    sujetDe(r)
    sortie.set(r, pousser({ type: 'resume', ...commun, moment: 'sortie', sautee: masque, enchaine: { avant: true, arriere: false } }))
  }

  const listesDe = (p: Id) => {
    const enfants = enfantsDe(l, p)
    const n = enfants.length
    const livraison = livraisonDe(l, p).valeur
    const percer = livraison === 'percer'
    const disposition = dispositionDe(l, p)
    const gabarit = gabaritDeListe(disposition, {
      portrait,
      enfants: n,
      parentIllustre: illustre(l.sujets.get(p)),
      enfantsIllustres: enfants.every((x) => illustre(l.sujets.get(x))),
    })
    const sautees = listeSautee(l, p)
    const niveau = niveauDe(l, p)
    const resumes = resumesDe(l, p, c)
    let premiere = true
    const etape = (montre: number, courant: number | null, role: { entreeDe?: Id; sortieDe?: Id } = {}) => {
      const items = enfants.map((id, i): ItemListe => ({ id, etat: i > montre ? 'cache' : courant === null ? 'visible' : i === courant ? 'courant' : i < courant ? 'passe' : 'visible' }))
      const d: DiapoListe = { type: 'liste', sujet: p, niveau, gabarit, sautee: sautees, enchaine: { ...RIEN }, livraison, disposition, items, montre, centre: courant ?? 0, premiere, ...role }
      premiere = false
      return pousser(d)
    }

    // Les étapes de révélation (relevé 10 § 4).
    if (percer) {
      const l0 = etape(0, 0)
      diapos[l0]!.enchaine = { avant: true, arriere: true }
    } else if (livraison === 'un-par-un') for (let k = 0; k < n; k++) etape(k, k)
    else etape(n - 1, null)

    let unVisite = false
    enfants.forEach((e, i) => {
      const montre = percer ? i : n - 1
      const iEntree = etape(montre, i, { entreeDe: e })
      entree.set(e, iEntree)
      sujetDe(e)
      const aVu = montreeEntre(iEntree + 1, diapos.length)
      const entreeD = diapos[iEntree] as DiapoListe
      if (!percer) {
        // Hors perçage, l'entrée n'est qu'un passage vers l'enfant, et seulement s'il a quelque chose à lui.
        entreeD.enchaine = { avant: true, arriere: false }
        if (!aVu) entreeD.sautee = true
      }
      // Les résumés qui finissent à cet enfant, le plus court d'abord ; chaque étape sort du précédent et entre dans le suivant.
      let precedent: { id: Id; resume: boolean; depuis: number } = { id: e, resume: false, depuis: iEntree }
      const dernierResume = (i: number) => resumes.filter((r) => r.a === i).sort((x, y) => y.de - x.de)
      const sortir = (role: { entreeDe?: Id }, dernierEnfant: boolean) => {
        const vu = montreeEntre(precedent.depuis + 1, diapos.length)
        const k = etape(montre, i, { sortieDe: precedent.id, ...role })
        const d = diapos[k] as DiapoListe
        if (!sautees) d.sautee = !(vu || (!percer && dernierEnfant && unVisite && !role.entreeDe))
        ;(precedent.resume ? sortieResume : sortie).set(precedent.id, k)
        return k
      }
      for (const r of dernierResume(i)) {
        const k = sortir({ entreeDe: r.id }, false)
        // Hors perçage, toute entrée s'enchaîne, celle d'un résumé comme celle d'un enfant.
        if (!percer) diapos[k]!.enchaine = { avant: true, arriere: false }
        entreeResume.set(r.id, k)
        resumeDe(r.id, enfants.slice(r.de, r.a + 1))
        precedent = { id: r.id, resume: true, depuis: k }
      }
      if (aVu) unVisite = true
      const k = sortir({}, i === n - 1)
      // Une sortie qui n'est pas la dernière est suivie de l'entrée de l'enfant suivant, une liste : elle s'enchaîne.
      if (i < n - 1) diapos[k]!.enchaine = { avant: true, arriere: true }
    })
  }

  if (l.central) {
    const racines = [l.central, ...l.flottants]
    racines.forEach((r, k) => {
      if (k > 0) {
        // Un flottant entre par la fin de la racine d'avant, et sa diapositive est la sortie de celle-ci.
        entree.set(r, diapos.length - 1)
        sortie.set(racines[k - 1]!, diapos.length)
      }
      sujetDe(r)
    })
    const derniere = racines.at(-1)!
    sortie.set(derniere, pousser({ type: 'fin', sujet: derniere, niveau: 'central', gabarit: 'sujet', sautee: false, enchaine: RIEN }))
  }
  return { diapos, debut, entree, fin, sortie, entreeResume, sortieResume }
}

// — La navigation (relevé 10 § 5) —

/** Où en est la présentation : une diapositive, ou l'écran de fin. */
export type Position = number | 'ecran-de-fin'

/** Un pas joué : d'où, vers où (`terminer` : la présentation est finie), avec quel effet, et s'il s'est enchaîné tout seul. */
export interface Saut {
  de: Position | null
  vers: Position | 'terminer'
  effet: Effet
  automatique: boolean
}

/** Où l'on arrive en partant d'un sujet : sa diapositive, même sautée ; sans sujet, celle du central. */
export function depart(s: Sequence, l: Lecture, id?: Id): number {
  return s.debut.get(id ?? l.central) ?? s.debut.get(l.central) ?? 0
}

/** La prochaine diapositive montrée ; `null` s'il n'y en a plus. */
export function suivante(s: Sequence, i: number): number | null {
  for (let j = i + 1; j < s.diapos.length; j++) if (!s.diapos[j]!.sautee) return j
  return null
}

export function precedente(s: Sequence, i: number): number | null {
  for (let j = i - 1; j >= 0; j--) if (!s.diapos[j]!.sautee) return j
  return null
}

/** « Passer la branche actuelle » : la sortie du sujet (du résumé, sur une diapositive de résumé), à défaut sa fin. */
export function apresBranche(s: Sequence, i: number): number | null {
  const d = s.diapos[i]
  if (!d) return null
  const x = (d.type === 'resume' ? s.sortieResume.get(d.sujet) : s.sortie.get(d.sujet)) ?? s.fin.get(d.sujet)
  return x === undefined || x === i ? null : x
}

/** « Retour au sujet parent » : l'étape de la liste du parent où le sujet a paru, à défaut sa diapositive. */
export function versParent(s: Sequence, i: number): number | null {
  const d = s.diapos[i]
  if (!d) return null
  const x = (d.type === 'resume' ? s.entreeResume.get(d.sujet) : s.entree.get(d.sujet)) ?? s.debut.get(d.sujet)
  return x === undefined || x === i ? null : x
}

/**
 * Ce que joue une commande depuis une position : le pas demandé, puis les pas qui s'enchaînent d'eux-mêmes (une
 * sortie de liste vers l'entrée suivante, la première étape d'un perçage…), chacun avec son effet. Vide : on reste.
 * `null` : rien n'est encore montré (le premier « suivant » va au départ).
 */
export function trajet(s: Sequence, l: Lecture, de: Position | null, commande: Exclude<Commande, 'depart'>, anime = true): Saut[] {
  const bout = (p: Position | null) => (typeof p === 'number' ? s.diapos[p]! : null)
  const effet = (a: Position | null, b: Position | 'terminer', c: Commande) => effetDeTransition(bout(a), b === 'terminer' ? null : bout(b), c, anime)
  let vers: Position | 'terminer' | null
  if (de === 'ecran-de-fin') vers = commande === 'avancer' ? 'terminer' : commande === 'reculer' ? s.diapos.length - 1 : null
  else if (de === null) vers = commande === 'avancer' ? depart(s, l) : null
  else if (commande === 'avancer') vers = suivante(s, de) ?? 'ecran-de-fin'
  else if (commande === 'reculer') vers = precedente(s, de)
  else if (commande === 'passer') vers = apresBranche(s, de)
  else vers = versParent(s, de)
  if (vers === null) return []
  const premier: Saut = { de, vers, effet: de === 'ecran-de-fin' ? effetDeTransition(null, null, 'reculer', anime) : effet(de, vers, de === null ? 'depart' : commande), automatique: false }
  const sauts = [premier]
  const avant = commande === 'avancer' || commande === 'passer'
  for (let ici = vers; typeof ici === 'number' && sauts.length <= s.diapos.length; ) {
    const d = s.diapos[ici]!
    if (!(avant ? d.enchaine.avant : d.enchaine.arriere)) break
    const la: Position | null = avant ? (suivante(s, ici) ?? 'ecran-de-fin') : precedente(s, ici)
    if (la === null) break
    sauts.push({ de: ici, vers: la, effet: effet(ici, la, avant ? 'avancer' : 'reculer'), automatique: true })
    ici = la
  }
  return sauts
}

/** Où l'on s'arrête au bout d'une commande ; la position donnée si rien ne bouge. */
export function arrivee(sauts: readonly Saut[], de: Position | null): Position | 'terminer' | null {
  return sauts.at(-1)?.vers ?? de
}
