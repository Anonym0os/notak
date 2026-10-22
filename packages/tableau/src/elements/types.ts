/**
 * Ce qu'un type d'élément apporte à la toile. Chaque type vit dans son dossier
 * (`elements/note`, `elements/image`…) et s'inscrit dans le registre ; la toile
 * ne connaît aucun type en particulier.
 *
 * Le clic se résout par le DOM : tout ce qui porte `data-id="<id>"` désigne cet élément
 * (une carte, un trait SVG, un enfant de colonne). `rect(id)` mesure ce même nœud.
 */
import type { ComponentType, ReactNode } from 'react'
import type { Camera } from '../coeur/camera'
import type { Point, Rect } from '../coeur/geometrie'
import type { Magasin } from '../coeur/magasin'
import type { Apercu, Contenu, Element, Id, Operation, Tableau, TypeContenu } from '../coeur/tableau'

/** Où l'application range les fichiers (images…). La toile ne sait pas où ils vivent. */
export interface DepotFichiers {
  enregistrer(fichier: Blob): Promise<Id>
  /** Une adresse affichable (`blob:`, `https:`…), ou `null` si le fichier est introuvable. */
  adresse(id: Id): Promise<string | null>
}

/** Qui va chercher l'aperçu d'une page web : un serveur, puisqu'un navigateur ne lit pas les autres sites. */
export type ChercheurApercu = (url: string) => Promise<Apercu>

/** Ce que l'application hôte prête à la toile. Tout est facultatif : un type sans son service se dégrade. */
export interface Services {
  fichiers?: DepotFichiers
  apercu?: ChercheurApercu
  /** Ouvrir un tableau imbriqué. */
  ouvrirTableau?(id: Id): void
}

/** L'état de la toile, prêté à chaque type d'élément. */
export interface ContexteToile {
  magasin: Magasin
  services: Services
  camera: Camera
  /** Le rectangle d'un élément sur le tableau, en UG, ou `null` s'il n'est pas affiché. */
  rect(id: Id): Rect | null
  /** Un point de l'écran (coordonnées de la toile) vers le tableau. */
  versTableau(p: Point): Point
  /** La largeur de la vue à l'écran, en pixels. */
  largeurVue(): number
  /** Le centre de la vue, sur le tableau : là où l'on pose ce qu'on crée sans position. */
  centreVue(): Point
  selection: ReadonlySet<Id>
  choisir(ids: Iterable<Id>): void
  commencerEdition(id: Id): void
  finirEdition(): void
}

export interface PropsRendu<C extends Contenu = Contenu> {
  element: Element<C>
  choisie: boolean
  enEdition: boolean
  contexte: ContexteToile
  /**
   * Pendant l'édition, chaque changement : la toile garde le dernier et l'inscrit d'un coup,
   * comme un seul pas d'historique, quand on sort de l'édition.
   */
  brouillon(apres: C): void
  /** Un changement immédiat et définitif (cocher une case, changer de couleur) : un pas d'historique. */
  changer(apres: C): void
}

/** Ce que la barre de sélection montre pour un type quand des éléments de ce type sont choisis. */
export interface PropsOutils<C extends Contenu = Contenu> {
  elements: Element<C>[]
  contexte: ContexteToile
}

export interface TypeElement<C extends Contenu = Contenu> {
  type: C['type']
  /** Le contenu, dessiné dans le cadre commun (position, largeur, ombre, sélection). */
  Rendu: ComponentType<PropsRendu<C>>
  /**
   * `cartes` (par défaut) : dans un cadre posé sur la toile.
   * `lignes` : dessiné dans le calque SVG au-dessus des cartes ; `Rendu` rend alors du SVG, sans cadre.
   */
  calque?: 'cartes' | 'lignes'
  /** Le double-clic et Entrée ouvrent l'édition. */
  editable?: boolean
  /** Hauteur avant la première mesure, en UG. */
  hauteurParDefaut?: number
  /** Le cadre commun n'a ni fond ni ombre (une image, un titre) : le type dessine les siens. */
  sansFond?: boolean | ((c: C) => boolean)
  /** Largeur minimale quand on redimensionne, en UG (17 par défaut). */
  largeurMin?: number
  /** La largeur « naturelle », en UG : celle où revient le double-clic sur la poignée, depuis 34. */
  largeurNaturelle?(c: C): number
  /** Ce que la suppression d'un élément de ce type emporte avec lui (le contenu d'une colonne). */
  aussiSupprimer?(element: Element<C>, tableau: Tableau): Element[]
  /**
   * Ce type range d'autres éléments (une colonne) : dit si `enfant` peut y entrer.
   * Les enfants portent `parent` = l'id du conteneur, et se rendent par `Rangees` (Cadre.tsx).
   */
  accepte?(enfant: Element, conteneur: Element<C>): boolean
  /** Outils de la barre de sélection propres au type. */
  Outils?: ComponentType<PropsOutils<C>>
  /** Les outils de la barre de gauche qui créent un élément de ce type (une note, un titre…). */
  outils?: { libelle: string; icone: ReactNode; creer(ou: Point, contexte: ContexteToile): Operation[] }[]
}

/**
 * Qui reçoit ce qu'on colle ou dépose sur la toile (hors édition). Les récepteurs sont essayés
 * par priorité décroissante ; le premier qui rend des opérations gagne.
 */
export interface Recepteur {
  priorite: number
  recevoir(donnees: DataTransfer, ou: Point, contexte: ContexteToile): Operation[] | Promise<Operation[]> | null
}

/** Un raccourci clavier de la toile, hors édition. Rend vrai s'il a pris la touche. */
export type Raccourci = (e: KeyboardEvent, contexte: ContexteToile) => boolean

/** Un outil commun de la barre de sélection, montré quel que soit le type (aligner, répartir…). */
export type OutilCommun = ComponentType<{ elements: Element[]; contexte: ContexteToile }>

export type { TypeContenu }
