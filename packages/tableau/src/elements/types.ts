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
import type { Apercu, Contenu, CouleurNote, Element, Id, Operation, Tableau, TypeContenu } from '../coeur/tableau'

/** Où l'application range les fichiers (images…). La toile ne sait pas où ils vivent. */
export interface DepotFichiers {
  enregistrer(fichier: Blob): Promise<Id>
  /** Une adresse affichable (`blob:`, `https:`…), ou `null` si le fichier est introuvable. */
  adresse(id: Id): Promise<string | null>
}

/** Qui ramène une image du web dans les fichiers du tableau : elle ne dépendra plus du site qui la sert. */
export type Rapatrieur = (url: string) => Promise<{ id: Id; type: string }>

/** Qui va chercher l'aperçu d'une page web : un serveur, puisqu'un navigateur ne lit pas les autres sites. */
export type ChercheurApercu = (url: string) => Promise<Apercu>

/** Qui est là : un client branché sur le tableau (une personne peut en avoir plusieurs). */
export interface Presence {
  client: number
  /** `photo` : le fichier de sa photo (l'application en connaît l'adresse, voir `adressePhoto`). */
  utilisateur: { id: string; nom: string; couleur: string; photo?: string }
  /** Où est son pointeur, en UG ; `null` s'il est sorti de la toile. */
  curseur: Point | null
  selection: Id[]
  /** L'élément dont il écrit le texte, s'il en écrit un. */
  edition: Id | null
}

/** Ce que la toile dit de soi aux autres, et ce qu'elle apprend d'eux. */
export interface ServicePresence {
  signaler(etat: { curseur?: Point | null; selection?: Id[]; edition?: Id | null }): void
  /** Les autres seulement, jamais soi. Même tableau tant que rien ne change. */
  autres(): Presence[]
  /** Soi, tel que les autres le voient (nom, couleur). */
  moi?(): Presence['utilisateur']
  /** Le canal d'awareness Yjs du tableau, pour les curseurs dans un texte partagé ; `null` hors connexion. */
  canal?(): unknown
  ecouter(f: () => void): () => void
}

/** Une correspondance de la recherche dans tous les tableaux de l'espace. */
export interface ResultatRecherche {
  tableau: Id
  /** Le titre du tableau où c'est écrit. */
  titre: string
  /** L'élément trouvé ; absent si c'est le titre du tableau. */
  element?: Id
  /** Le passage qui correspond, en texte brut. */
  extrait: string
}

/** Ce que l'application hôte prête à la toile. Tout est facultatif : un type sans son service se dégrade. */
export interface Services {
  fichiers?: DepotFichiers
  apercu?: ChercheurApercu
  rapatrier?: Rapatrieur
  /** Ouvrir un tableau imbriqué. */
  ouvrirTableau?(id: Id): void
  /**
   * Pose ces éléments dans un autre tableau (on les y a lâchés) : ils s'y rangent à la suite du contenu,
   * ou gardent leur disposition si le tableau est vide.
   */
  /** Pose ces éléments dans un autre tableau, à la suite de son contenu ; rend ce qui y a été créé (mêmes rangs). */
  deposerDans?(tableau: Id, elements: Element[]): Element[] | void
  /** L'ouvrir dans un nouvel onglet (Cmd+clic, menu), là où l'application a des adresses. */
  ouvrirDansOnglet?(id: Id): void
  /** Le tableau d'un renvoi (titre, couleur, contenu), ou `undefined` s'il n'existe pas. */
  tableau?(id: Id): Tableau | undefined
  /** Prévenu à chaque changement de n'importe quel tableau de l'espace. */
  ecouterEspace?(f: () => void): () => void
  /** Crée un tableau vide dans l'espace et rend son id. */
  creerTableau?(titre: string): Id
  /** Change la couleur d'un tableau de l'espace (celle de sa carte). */
  colorerTableau?(id: Id, couleur: CouleurNote): void
  /** Change le titre d'un tableau de l'espace. */
  renommerTableau?(id: Id, titre: string): void
  /**
   * Cherche dans tous les tableaux du compte (l'application tient l'index). Sans ce service, la recherche
   * (Cmd+F) reste dans le tableau ouvert.
   */
  rechercherPartout?(requete: string): Promise<ResultatRecherche[]>
  /** La présence des autres sur ce tableau. Sans elle, la toile est seule. */
  presence?: ServicePresence
  /** On peut regarder et défiler, rien de plus : la toile refuse tout ce qui modifie. */
  lectureSeule?: boolean
  /** La présentation (Cmd+Alt+P) : rien ne se modifie, et un clic sur un élément le montre en grand. */
  presentation?: boolean
  /**
   * Les membres de l'espace (nom, couleur), pour citer quelqu'un avec `@` dans une note. Les personnes présentes
   * sur le tableau sont proposées dans tous les cas ; ce service y ajoute celles qui n'y sont pas.
   */
  membres?(): { id: string; nom: string; couleur?: string }[]
  /**
   * Les tableaux de l'espace (id, titre, couleur), pour en citer un avec `[[` dans une note. Sans lui, la note ne
   * propose que les tableaux déjà posés sur le tableau ouvert.
   */
  listerTableaux?(): { id: Id; titre: string; couleur?: CouleurNote }[]
  /**
   * Trouve où est une adresse sur la carte (un géocodeur) : le lieu en tire sa carte intégrée.
   * Absent, le lieu reste une adresse avec un lien vers la carte.
   */
  localiser?(requete: string): Promise<{ lat: number; lon: number } | null>
  /** L'adresse affichable de la photo d'une personne, d'après le fichier qu'elle a choisi ; absent : l'initiale seule. */
  adressePhoto?(fichier: Id): string
  /** Un double-clic sur le vide crée une note (le réglage de chacun) ; absent : oui. */
  doubleClicCreeNote?: boolean
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
  /** Passe des données (fichiers choisis, déposés) aux récepteurs, comme un dépôt à `ou` (UG). */
  recevoir(donnees: DataTransfer, ou: Point): void
  /** Le centre de la vue, sur le tableau : là où l'on pose ce qu'on crée sans position. */
  centreVue(): Point
  selection: ReadonlySet<Id>
  choisir(ids: Iterable<Id>): void
  /** `ou` : le point de l'écran (`clientX`, `clientY`) où poser le curseur de texte, sinon la fin. */
  commencerEdition(id: Id, ou?: Point): void
  /** Met ces éléments à la corbeille du tableau (avec leurs lignes accrochées), d'un seul pas. */
  jeter(ids: Iterable<Id>): void
  /**
   * Cmd+Entrée : crée l'élément suivant, du type que dit `suivant` (une note par défaut), sous cet élément,
   * ou juste après lui dans sa colonne ; le choisit et l'édite. `format` : recopier aussi la mise en forme.
   */
  creerSuivant(id: Id, format: boolean): void
  /** Le point où l'édition qui commence doit poser son curseur ; il n'est rendu qu'une fois. */
  prendrePointEdition(): Point | null
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
  /** Le double-clic ouvre l'élément au lieu de l'éditer (un tableau imbriqué). */
  ouvrir?(element: Element<C>, contexte: ContexteToile): void
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
  /** Largeur sur hauteur d'un média : la poignée garde ces proportions (Cmd les libère). */
  proportion?(c: C): number
  /** La poignée règle aussi la hauteur : le contenu qui dépasse se cache sous un voile, et revient en édition. */
  hauteurBornable?: boolean
  /** Ce que la suppression d'un élément de ce type emporte avec lui (le contenu d'une colonne). */
  aussiSupprimer?(element: Element<C>, tableau: Tableau): Element[]
  /**
   * Ce type range d'autres éléments (une colonne) : dit si `enfant` peut y entrer.
   * Les enfants portent `parent` = l'id du conteneur, et se rendent par `Rangees` (Cadre.tsx).
   */
  accepte?(enfant: Element, conteneur: Element<C>): boolean
  /** Outils de la barre de sélection propres au type. */
  Outils?: ComponentType<PropsOutils<C>>
  /**
   * Les éléments qui partent avec ceux qu'on supprime (les lignes accrochées à une carte supprimée).
   * La toile l'interroge sur chaque type inscrit ; elle écarte les doublons.
   */
  emporterAvec?(supprimes: Element[], tableau: Tableau): Element[]
  /** Les outils de la barre de gauche qui créent un élément de ce type (une note, un titre…). */
  outils?: Outil[]
  /**
   * L'élément que Cmd+Entrée fait naître à côté de celui-ci : `dessous` et `droite` sont des places toutes
   * prêtes, en UG. `null` : rien (une ligne, une image). Absent : une note dessous.
   */
  suivant?(element: Element<C>, places: { dessous: Point; droite: Point }, format: boolean, contexte: ContexteToile): Element | null
  /** À la sortie de l'édition, ce que devient le contenu (une note qui n'est qu'une adresse devient un lien). */
  convertir?(c: C): Contenu | null
  /** Son nom de type, pour qui le lit (« Note », « Colonne »). */
  nom?: string
  /** Ce qu'on lit de lui dans une liste (la corbeille) : son texte, son titre, son adresse. */
  resume?(c: C, contexte: ContexteToile): string
  /** Ne s'incline pas quand on le glisse (un tableau, dessiné en icône). */
  sansInclinaison?: boolean
  /** Sa couleur, pour l'outil commun d'une sélection mêlée (voir `elements/couleur`). */
  couleur?: Coloration<C>
}

/**
 * Lire et changer la couleur d'un élément. `vers` rend le contenu recoloré (un pas d'historique) ; un type dont
 * la couleur vit ailleurs (un tableau, dans l'espace) passe par `ailleurs`.
 */
export interface Coloration<C extends Contenu = Contenu> {
  lire(e: Element<C>, contexte: ContexteToile): CouleurNote | undefined
  vers?(c: C, couleur: CouleurNote | undefined): C
  ailleurs?(e: Element<C>, couleur: CouleurNote, contexte: ContexteToile): void
}

/**
 * Un outil de la barre de gauche. On le glisse sur la toile : un fantôme de l'élément suit le pointeur,
 * et `creer` le fait naître là où on le lâche (`ou` est son coin haut gauche, en UG).
 */
export interface Outil {
  libelle: string
  icone: ReactNode
  /** Sa place dans la barre, croissante vers le bas. */
  rang: number
  /** Rangé dans le tiroir « Plus » plutôt que dans la barre. */
  tiroir?: boolean
  /** L'élément tel qu'il naîtra, pour le dessiner sous le pointeur ; sans effet sur rien. */
  fantome(): Element
  /** Où le pointeur tient le fantôme, depuis son coin haut gauche, en UG (3, 3 par défaut). */
  prise?: Point
  creer(ou: Point, contexte: ContexteToile): Operation[]
  /** Un clic sans glisser : au lieu du rebond qui rappelle de glisser (ouvrir un sélecteur de fichiers). */
  clic?(ou: Point, contexte: ContexteToile): void
}

/**
 * Qui reçoit ce qu'on colle ou dépose sur la toile (hors édition). Les récepteurs sont essayés
 * par priorité décroissante ; le premier qui rend des opérations gagne, sauf s'il est cumulable.
 */
export interface Recepteur {
  priorite: number
  /** Ce qu'il rend s'ajoute à ce que rendent les suivants (images et fichiers d'un même dépôt). */
  cumulable?: boolean
  recevoir(donnees: DataTransfer, ou: Point, contexte: ContexteToile): Operation[] | Promise<Operation[]> | null
}

/** Un raccourci clavier de la toile, hors édition. Rend vrai s'il a pris la touche. */
export type Raccourci = (e: KeyboardEvent, contexte: ContexteToile) => boolean

/**
 * Une entrée du menu d'un élément (clic droit), qu'un module apporte (grouper en colonne, relier).
 * `visible` dit si elle sert pour ces éléments choisis.
 */
export interface EntreeMenu {
  libelle: string
  raccourci?: string
  visible(elements: Element[], contexte: ContexteToile): boolean
  faire(elements: Element[], contexte: ContexteToile): void
}

/** Un outil commun de la barre de sélection, montré quel que soit le type (aligner, répartir…). */
export type OutilCommun = ComponentType<{ elements: Element[]; contexte: ContexteToile }>

export type { TypeContenu }
