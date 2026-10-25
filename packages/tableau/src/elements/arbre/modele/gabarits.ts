import type { Id, ReglagesDiapo } from '../../../coeur/tableau'
import type { RatioPitch } from '../themesPitch'

/**
 * Ce qui décide de la forme d'une diapositive du mode Pitch (docs/XMIND.md § 12, relevés 10 § 6 et § 7, 11 § 0.9) :
 * le gabarit final de chaque diapositive, la place d'une image quand l'utilisateur ne l'a pas dite, et l'effet de
 * transition entre deux diapositives. Rien n'est dessiné ici : le dessin (lot B) et les transitions (lot D) lisent
 * ces décisions.
 */

export type MiseEnPage = NonNullable<ReglagesDiapo['miseEnPage']>
export type Livraison = NonNullable<ReglagesDiapo['livraison']>
export type PlaceImage = NonNullable<ReglagesDiapo['image']>

/** Le niveau d'un sujet, dans l'ordre où Xmind le teste : flottant, central, résumé, sous-sujet, sinon principal. */
export type Niveau = 'central' | 'flottant' | 'principal' | 'sous-sujet' | 'resume'

/** La mise en page d'une liste avant sa variante : les cinq qu'on choisit, et les deux têtes qui se déduisent du parent. */
export type Disposition = MiseEnPage | 'tete-arete' | 'tete-chronologie'

/** Les gabarits de diapositive, chacun avec l'identifiant de Xmind en regard. */
export type Gabarit =
  | 'sujet' // topic-slide
  | 'sujet-image' // image-topic-slide
  | 'accolade' // brace-list
  | 'puces' // bullet-list
  | 'paroles' // lyric-list
  | 'arbre' // tree-chart
  | 'enfant-unique' // only-child
  | 'resume' // summary
  | 'resume-defilant' // scrollable-summary
  | 'arete' // fishbone
  | 'tete-arete' // fishbone-head
  | 'chronologie' // timeline
  | 'tete-chronologie' // timeline-head
  | 'parent-illustre' // imageable-parent-slide
  | 'enfant-unique-parent-illustre' // only-child-imageable-parent
  | 'enfants-illustres' // imageable-children-slide
  | 'liste-illustree' // imageable-list-slide
  | 'enfant-unique-illustre' // only-imageable-child

/** Une diapositive est « portrait » quand elle est moins large que haute : 9:16 et 3:4. */
export const estPortrait = (r: RatioPitch): boolean => r === '9:16' || r === '3:4'

/** Au-delà, un titre empêche l'accolade par défaut (relevé 10 § 6.2). */
export const TITRE_COURT = 24

export const titreCourt = (titre: string): boolean => titre.length <= TITRE_COURT

/** Ce qu'il faut savoir d'un sujet pour choisir la mise en page par défaut de sa liste. */
export interface FaitsDeListe {
  niveau: Niveau
  /** Combien d'enfants directs. */
  enfants: number
  /** Son titre et ceux de tous ses enfants font au plus 24 caractères. */
  titresCourts: boolean
  /** Sa structure sur la carte, quand elle en impose une. */
  structure: 'arete' | 'chronologie' | null
  livraison: Livraison
}

/**
 * La mise en page qu'Auto donne à une liste (`computeDefaultListSlideLayout`) : celle de la structure de la carte
 * (arête, chronologie), sinon l'accolade pour le central et pour un principal court qui a plus d'un enfant, sinon les
 * puces en « tout à la fois », sinon les paroles.
 */
export function miseEnPageParDefaut(f: FaitsDeListe): MiseEnPage {
  if (f.structure) return f.structure
  if (f.niveau === 'central' || (f.niveau === 'principal' && f.enfants > 1 && f.titresCourts)) return 'accolade'
  return f.livraison === 'tout' ? 'puces' : 'paroles'
}

/** Les paroles ne se jouent pas en « tout à la fois ». */
export const admissible = (m: MiseEnPage, livraison: Livraison): boolean => !(m === 'paroles' && livraison === 'tout')

/**
 * La disposition d'une liste : la tête d'arête ou de chronologie si le parent est en arête ou en chronologie (règle qui
 * passe avant tout réglage), sinon le réglage s'il est admissible, sinon le défaut.
 */
export function dispositionDeListe(o: { defaut: MiseEnPage; reglage: MiseEnPage | undefined; livraison: Livraison; heritage: 'arete' | 'chronologie' | null }): Disposition {
  if (o.heritage === 'arete') return 'tete-arete'
  if (o.heritage === 'chronologie') return 'tete-chronologie'
  return o.reglage && admissible(o.reglage, o.livraison) ? o.reglage : o.defaut
}

/** Ce que la variante d'une liste regarde : le cadre, le nombre d'enfants, et qui est « illustré » (image sans titre). */
export interface FaitsDeVariante {
  portrait: boolean
  enfants: number
  parentIllustre: boolean
  /** Tous les enfants sont illustrés. */
  enfantsIllustres: boolean
}

/** Les variantes à images, communes à l'accolade, aux puces et aux paroles ; `null` quand aucune ne s'applique. */
function varianteIllustree(f: FaitsDeVariante): Gabarit | null {
  if (f.parentIllustre && !f.enfantsIllustres) return f.enfants === 1 ? 'enfant-unique-parent-illustre' : 'parent-illustre'
  if (!f.parentIllustre && f.enfantsIllustres) return f.enfants === 1 ? 'enfant-unique-illustre' : 'enfants-illustres'
  if (f.parentIllustre && f.enfantsIllustres) return 'liste-illustree'
  return null
}

/** Le gabarit final d'une étape de liste (`computeLayoutVariant` de chaque gabarit, relevé 10 § 6.3). */
export function gabaritDeListe(d: Disposition, f: FaitsDeVariante): Gabarit {
  switch (d) {
    case 'accolade':
    case 'puces':
    case 'paroles': {
      const illustree = varianteIllustree(f)
      if (illustree) return illustree
      if (f.enfants === 1) return 'enfant-unique'
      if (d === 'accolade' && f.portrait) return 'arbre'
      return d
    }
    case 'arete':
    case 'chronologie':
      if (f.enfants === 1) return 'enfant-unique'
      return f.portrait ? 'arbre' : d
    case 'tete-arete':
    case 'tete-chronologie':
      return f.portrait ? 'arbre' : d
  }
}

/** Le gabarit d'une diapositive de sujet ; l'`epilogue` n'a jamais d'image. */
export const gabaritDeSujet = (avecImage: boolean): Gabarit => (avecImage ? 'sujet-image' : 'sujet')

export const gabaritDeResume = (portrait: boolean): Gabarit => (portrait ? 'resume-defilant' : 'resume')

/** Dans une diapositive de résumé, la plage est reliée par une accolade s'il y a plus d'un frère, par un trait sinon. */
export const formeDuResume = (freres: number): 'accolade' | 'trait' => (freres > 1 ? 'accolade' : 'trait')

/** Sous cette largeur naturelle (px de base), une image est « petite ». */
export const IMAGE_PETITE = 400

/** Ce que la place Auto d'une image regarde. */
export interface FaitsDImage {
  portrait: boolean
  largeur: number
  hauteur: number
  /** Une image vectorielle (une équation, une illustration…). */
  svg: boolean
}

/**
 * La place d'une image quand rien n'est dit (relevé 10 § 6.1) : au-dessus du titre en portrait ; une petite image au-dessus
 * si elle est vectorielle, à gauche sinon ; une image au moins deux fois plus large que haute au-dessus ; sinon au-dessus
 * si elle est vectorielle, à gauche sinon. Auto ne choisit jamais la droite, le dessous ni le fond.
 */
export function placeImageAuto(f: FaitsDImage): PlaceImage {
  if (f.portrait) return 'dessus'
  if (f.largeur < IMAGE_PETITE) return f.svg ? 'dessus' : 'gauche'
  if (f.hauteur > 0 && f.largeur / f.hauteur >= 2) return 'dessus'
  return f.svg ? 'dessus' : 'gauche'
}

// — Transitions (relevé 10 § 7.1), données pour le lot des transitions —

/** La durée de base : toutes les durées du mode Pitch en sont des multiples. */
export const DUREE_BASE = 400

/** Les effets entre deux diapositives : dissolve, animateInSlide, magicMove et none chez Xmind. */
export type NomEffet = 'fondu' | 'dans-la-diapo' | 'morphing' | 'aucun'

export interface Effet {
  nom: NomEffet
  /** En millisecondes. */
  duree: number
  /** Les animations d'entrée et de sortie des diapositives se jouent (pas en reculant, pas en remontant au parent). */
  animationsDiapo: boolean
}

/** Ce qui demande la transition : le démarrage, ou une des quatre commandes de la navigation. */
export type Commande = 'depart' | 'avancer' | 'reculer' | 'passer' | 'remonter'

/** Ce que l'effet regarde d'une diapositive. */
export interface BoutDeTransition {
  type: 'sujet' | 'liste' | 'resume' | 'fin'
  sujet: Id
  niveau: Niveau
}

const AUCUN: Effet = { nom: 'aucun', duree: 0, animationsDiapo: false }

/** L'effet tel que la paire de diapositives le veut, avant la commande (`computeTransitionEffect`). */
function effetBrut(source: BoutDeTransition | null, cible: BoutDeTransition | null): Pick<Effet, 'nom' | 'duree'> {
  if (cible?.type === 'sujet' && (cible.niveau === 'central' || cible.niveau === 'flottant')) return { nom: 'fondu', duree: 1.5 * DUREE_BASE }
  if (!source || !cible) return { nom: 'fondu', duree: DUREE_BASE }
  if (source.sujet === cible.sujet) {
    if (source.type === 'liste' && cible.type === 'sujet') return { nom: 'morphing', duree: 2.5 * DUREE_BASE }
    if (source.type === cible.type) return { nom: 'dans-la-diapo', duree: 1.5 * DUREE_BASE }
  }
  return { nom: 'morphing', duree: 2.5 * DUREE_BASE }
}

/**
 * L'effet d'un pas de la présentation. Reculer n'anime jamais ; remonter au parent garde l'effet sans les animations
 * des diapositives ; avancer, passer la branche et le démarrage le gardent entier. Sans animation : rien, nulle part.
 * `null` : pas de diapositive de ce côté (le démarrage, l'écran de fin).
 */
export function effetDeTransition(source: BoutDeTransition | null, cible: BoutDeTransition | null, commande: Commande, anime: boolean): Effet {
  if (!anime || commande === 'reculer') return AUCUN
  return { ...effetBrut(source, cible), animationsDiapo: commande !== 'remonter' }
}

/**
 * L'écran de fin (relevé 10 § 5.5) : une image de toute la carte, l'`epilogue` en vignette en haut à droite. Ses
 * durées ne suivent pas le réglage d'animation.
 */
export const ECRAN_DE_FIN = {
  /** L'écran paraît pendant que l'`epilogue` se fond (fondu de 400 ms) et rétrécit, en easeInOutCubic. */
  apparition: 2.5 * DUREE_BASE,
  /** « Suivant » sur l'écran de fin : il s'efface, linéaire, puis la présentation se termine. */
  disparition: DUREE_BASE,
  /** L'échelle de la vignette : 0,2 ; 0,233 en 4:3. */
  echelle: (r: RatioPitch) => (r === '4:3' ? 0.233 : 0.2),
  /** Du bord droit et du haut, px de base. */
  marge: 30,
  rayon: 14,
  bordure: '#FFFFFF25',
  /** La marge autour de l'image de la carte. */
  margeCarte: 20,
} as const
