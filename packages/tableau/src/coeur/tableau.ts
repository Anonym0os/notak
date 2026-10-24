import { type Point, point } from './geometrie'
import type { Fond } from './fond'
import type { Hauteur } from './hauteur'

export type Id = string

/** Largeur par défaut d'une note, en unités de grille. */
export const LARGEUR_NOTE = 34
/** Hauteur d'une note vide, en unités de grille. */
export const HAUTEUR_NOTE_MIN = 7
/** Une position ne s'éloigne jamais plus de ça de l'origine. */
export const POSITION_MAX = 15_000

/**
 * Un nœud de texte riche, au format JSON de Tiptap (ProseMirror) :
 * `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '…' }] }] }`.
 */
export interface NoeudTexte {
  type: string
  attrs?: Record<string, unknown>
  content?: NoeudTexte[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

/** La couleur d'une note, par son nom : les valeurs affichées dépendent du thème. */
export type CouleurNote =
  | 'gris'
  | 'cyan'
  | 'vert'
  | 'brun'
  | 'jaune'
  | 'orange'
  | 'rouge'
  | 'rose'
  | 'violet'
  | 'bleu'
  | 'bleu_nuit'
  | 'transparent'

/** Les couleurs de fond qu'on peut donner à une note, dans l'ordre de la palette (`transparent` en plus). */
export const COULEURS_NOTE = [
  'gris',
  'cyan',
  'vert',
  'brun',
  'jaune',
  'orange',
  'rouge',
  'rose',
  'violet',
  'bleu',
  'bleu_nuit',
] as const satisfies readonly CouleurNote[]

/** `titre` : posé sur la toile, sans fond, texte centré. */
export type VarianteNote = 'normale' | 'titre'

export interface Note {
  type: 'note'
  texte: NoeudTexte
  couleur?: CouleurNote
  variante?: VarianteNote
  /** Un fond libre, `#rrggbb` : il prime sur `couleur`. */
  fond?: string
  /** Une barre de cette couleur (`#rrggbb`) en haut de la note. */
  barre?: string
  /** La couleur du texte de cette note (`#rrggbb`), à la place de celle que son fond impose. */
  couleurTexte?: string
  /**
   * La légende, au bas de la carte : un texte riche (gras, italique, lien, couleur…). Les notes d'avant la gardaient en
   * texte brut, ce que la lecture accepte encore (`legende.ts`).
   */
  legende?: string | NoeudTexte
  /**
   * Les fils de discussion posés sur des passages du texte, par leur clé : un passage porte la marque
   * `commentaireTexte` dont l'attribut `fil` est cette clé. Un fil dont le passage a disparu disparaît aussi.
   */
  fils?: Record<Id, Commentaire>
}

/** Une image envoyée. Le fichier vit dans le dépôt de fichiers, l'élément ne garde que sa clé. */
export interface Image {
  type: 'image'
  fichier: Id
  /** Taille d'origine en pixels, pour garder les proportions. */
  largeurOrigine: number
  hauteurOrigine: number
  legende?: string
  /** Le fond de sa légende, de la palette des notes. */
  couleur?: CouleurNote
  /** Le type du fichier (`image/png`…) : les formats à transparence n'ont pas d'ombre. */
  typeMime?: string
  /** Lu dans les pixels à l'arrivée : une image transparente n'a pas d'ombre. Absent : deviné au type. */
  transparente?: boolean
  /** Des copies plus petites (400, 800, 1600 px de large), pour ne charger que ce que l'affichage demande. */
  tailles?: TailleImage[]
  /** Quart de tour dans le sens des aiguilles d'une montre, appliqué après le recadrage. */
  rotation?: 0 | 90 | 180 | 270
  /** La partie gardée, en fractions de l'image d'origine (0 à 1). Absent : toute l'image. */
  recadrage?: Recadrage
  /** Les traits dessinés par-dessus (annotation), du plus ancien au plus récent. */
  traits?: TraitImage[]
  /** Après un détourage : le fichier d'avant, gardé pour « Rétablir l'original » et pour régler le détourage de nouveau. */
  original?: OriginalImage
  /** Une image transparente garde pourtant sa carte blanche (l'outil « Transparent » de Milanote, `showBackground`). */
  fondBlanc?: boolean
  /** Garde les proportions exactes au lieu de rogner sur la grille de points (« Rogner l'image sur la grille » décoché). */
  proportionsExactes?: boolean
  /** La légende reste affichée, même vide (avec son invite), tant qu'on ne l'a pas retirée. */
  legendeAffichee?: boolean
  /** Miroir horizontal / vertical, dans le sens de l'écran (appliqué après le quart de tour). */
  miroirH?: boolean
  miroirV?: boolean
  /** Cadrage libre (Cmd + poignée) : largeur sur hauteur du cadre, l'image le recouvre. Absent : le cadre suit l'image. */
  rapportCadre?: number
  /** Les couleurs dominantes lues à l'arrivée (`#rrggbb`, les plus présentes d'abord), proposées avec les couleurs suggérées. */
  couleurs?: string[]
}

/** Ce qu'une image était avant son détourage. */
export interface OriginalImage {
  fichier: Id
  largeurOrigine: number
  hauteurOrigine: number
  typeMime?: string
  transparente?: boolean
  tailles?: TailleImage[]
}

/**
 * Un trait à main levée sur une image. Les points sont en fractions de l'image d'origine (0 à 1, avant
 * recadrage et rotation) : le trait suit l'image quand on la recadre, la tourne ou l'agrandit.
 */
/** Un trait d'annotation posé sur une image (Maj+D). */
export interface TraitImage {
  /** `#rrggbb`. */
  couleur: string
  /** Fraction de la largeur de l'image d'origine. */
  epaisseur: number
  points: [number, number][]
}

export interface TailleImage {
  largeur: number
  fichier: Id
}

export interface Recadrage {
  x: number
  y: number
  largeur: number
  hauteur: number
}

export interface Apercu {
  titre?: string
  description?: string
  /** Adresse de l'image d'aperçu. */
  image?: string
  site?: string
  favicon?: string
  /** L'adresse mène à une image, pas à une page : la carte devient une image. */
  estImage?: boolean
  /** Les dimensions de l'image d'aperçu en pixels : la carte réserve sa place avant le chargement. */
  largeur?: number
  hauteur?: number
}

/** Pourquoi un aperçu n'a pas pu se faire, pour le dire avec des mots. */
export type CauseEchec = 'introuvable' | 'refuse' | 'injoignable' | 'delai' | 'interdit' | 'illisible'

/** Ce qu'un outil du tiroir attend comme adresse (une vidéo, un son, une carte) ; une invite, rien de plus. */
export type GenreLien = 'video' | 'audio' | 'carte'

export interface Lien {
  type: 'lien'
  url: string
  apercu?: Apercu
  /** `attente` tant que l'aperçu se charge, `echec` s'il n'a pas pu l'être. */
  statut: 'attente' | 'pret' | 'echec'
  /** Le titre qu'on lui a donné, à la place de celui de l'aperçu. */
  titre?: string
  /** Le fond de son en-tête, de la palette des notes. */
  couleur?: CouleurNote
  /** La légende qu'on lui a écrite, à la place de la description de l'aperçu ; vide, elle est cachée. */
  legende?: string
  /** Les réglages d'affichage : cacher l'image ou le lecteur, le domaine et le titre, la légende. */
  sansApercu?: boolean
  sansInfos?: boolean
  sansLegende?: boolean
  /** Une vidéo qui se lance seule (son coupé) quand on ouvre le tableau, et qui reprend à la fin. */
  lectureAuto?: boolean
  boucle?: boolean
  /** Une image choisie à la main, à la place de celle de la page : le fichier du tableau et ses dimensions en pixels. */
  image?: { fichier: Id; largeur: number; hauteur: number }
  /** Né d'un outil Vidéo, Audio ou Carte. */
  genre?: GenreLien
  /** La cause de l'échec, quand `statut` vaut `echec`. */
  echec?: CauseEchec
}

/** Une liste de tâches : un document Tiptap fait d'une liste de cases. */
export interface Taches {
  type: 'taches'
  titre?: string
  /** Le texte du titre retiré, gardé caché : il revient quand on rajoute le titre. */
  titreCache?: string
  /** Les suggestions sous la liste que l'utilisateur a déjà écartées : on ne les lui refait pas. */
  refus?: ('titre' | 'faites')[]
  /** Le fond de la liste, de la palette des notes ; sans lui, la carte est blanche. */
  couleur?: CouleurNote
  texte: NoeudTexte
}

/** Un fichier joint (PDF, document, son, vidéo…). Le fichier vit dans le dépôt, l'élément garde sa clé. */
export interface Fichier {
  type: 'fichier'
  fichier: Id
  /** Le nom d'origine, avec son extension. */
  nom: string
  typeMime: string
  /** En octets. */
  taille: number
  /** Le nom qu'on lui a donné, à la place du nom d'origine. */
  titre?: string
  /** Un mot sous la carte. */
  legende?: string
  /** Le fond de la carte, de la palette des notes. */
  couleur?: CouleurNote
  /** Rien que l'icône et le nom : ni aperçu des pages, ni lecteur. */
  icone?: boolean
  /** L'aperçu (première page, image) est masqué : la carte garde son titre et ses détails. */
  sansApercu?: boolean
  /** « Infos du fichier » décoché : ni titre ni détails, rien que l'aperçu ou le lecteur. */
  sansInfos?: boolean
  /** Le son ou la vidéo repart au début quand il finit. */
  boucle?: boolean
  /** Le son ou la vidéo se lance dès que la carte est là. */
  lectureAuto?: boolean
}

/** Une colonne : ses éléments portent `parent` = l'id de la colonne, et un `ordre`. */
export interface Colonne {
  type: 'colonne'
  titre: string
  couleur?: CouleurNote
  /** Un fond libre (`#rrggbb`), choisi dans « Couleur personnalisée » ; il remplace `couleur`. */
  fond?: string
  repliee?: boolean
}

/**
 * Un point précis d'un élément, en part de sa largeur et de sa hauteur (0 à 1, depuis le coin haut gauche).
 * Il suit l'élément quand celui-ci bouge ou change de taille.
 */
export interface Ancre {
  x: number
  y: number
}

/**
 * Une extrémité de ligne : un point libre du tableau, ou accrochée à un élément. Sans `ancre`, elle vise
 * le centre et s'arrête au bord ; avec, elle s'arrête sur ce point.
 */
export type Extremite = { x: number; y: number } | { element: Id; ancre?: Ancre }

export type Pointe = 'fleche' | 'rond' | 'rien'

export interface Ligne {
  type: 'ligne'
  depart: Extremite
  arrivee: Extremite
  /** Courbe de Bézier quadratique : écart perpendiculaire (UG) et position le long de la corde (0 à 1). */
  courbe?: { ecart: number; position: number }
  pointeDepart: Pointe
  pointeArrivee: Pointe
  trait: 'plein' | 'tirets' | 'points'
  epaisseur: 1 | 2 | 4
  couleur?: CouleurNote
  /** Une couleur libre (`#rrggbb`) : elle prime sur `couleur`. */
  fond?: string
  libelle?: string
  /** Le libellé est gardé mais caché (la tuile Libellé l'éteint) ; un nouveau texte le rallume. */
  libelleMasque?: boolean
}

/** Un tableau imbriqué, posé sur la toile de son parent. */
export interface RenvoiTableau {
  type: 'tableau'
  cible: Id
  /**
   * Le dernier nom donné depuis ce renvoi. Il sert à l'historique : annuler un renommage
   * remet ce champ, et la carte en reporte la valeur sur le tableau cible.
   */
  titre?: string
  /** Une icône de la bibliothèque (voir `elements/tableau/icones.ts`), à la place de l'initiale. */
  icone?: string
  /** Une image envoyée (clé du dépôt de fichiers), à la place de l'initiale ; elle prime sur `icone`. */
  image?: Id
  /** Un raccourci : le même tableau posé à un autre endroit. Le jeter ne jette pas le tableau. */
  raccourci?: boolean
  /** La couleur propre d'un raccourci ; absente, il montre celle du tableau. */
  couleur?: CouleurNote
  /** Un fond libre (`#rrggbb`) pour cette carte ; il remplace la couleur du tableau. */
  fond?: string
  /** La couleur du glyphe (`#rrggbb`) quand on en a choisi une (une paire de couleurs) ; sinon blanc ou sombre selon le fond. */
  glyphe?: string
}

/** Qui a écrit un message, tel qu'il se présentait à ce moment-là. */
export interface Auteur {
  id: string
  nom: string
  couleur?: string
}

/** Qui a créé un élément et qui l'a touché en dernier, et quand (ms). Gardé à part de l'élément. */
export interface Trace {
  par?: Auteur
  cree?: number
  modifiePar?: Auteur
  modifie?: number
}

/** Un message d'un fil de discussion. */
export interface Message {
  id: Id
  auteur: Auteur
  /** Quand il a été écrit (ms). */
  date: number
  /** Le texte brut du message (les mentions s'y lisent `@Nom`) : de quoi chercher, résumer, retomber sur ses pieds. */
  texte: string
  /** Le message mis en forme (gras, liens, mentions, émojis), au format de la note ; absent : `texte` seul. */
  riche?: NoeudTexte
  /** Les réactions des gens à ce message, par émoji. */
  reactions?: Reactions
}

/** Un fil de discussion posé sur la toile : un premier message, puis les réponses. */
export interface Commentaire {
  type: 'commentaire'
  messages: Message[]
  /** Résolu : le fil se replie en une pastille, et se rouvre. */
  resolu?: boolean
  /** Replié à la main : une ligne (le premier auteur et le nombre de messages) au lieu du fil. */
  replie?: boolean
  /** La couleur du fil : une bande de 5 px en haut de la fiche. */
  couleur?: CouleurNote
  /**
   * Attaché à un élément : où tombe la pointe de l'épingle, en pixels depuis le coin haut gauche de la carte.
   * Absent : à 20 px du bord droit et du haut.
   */
  epingle?: { x: number; y: number }
}

/** Le type d'une cellule ; absent : « auto », déduit de ce qu'on tape. */
export type TypeCellule = 'nombre' | 'monnaie' | 'pourcent' | 'texte' | 'date' | 'case'

export type FormatDate = 'aucun' | 'long' | 'court' | 'chiffres' | 'chiffresCourts' | 'tirets' | 'jour'
export type FormatHeure = 'aucune' | '12h' | '12hs' | '24h' | '24hs'

/** Mise en forme et type d'une cellule entière (voir docs/ecarts/table.md). */
export interface FormatCellule {
  type?: TypeCellule
  /** Nombre, monnaie, pourcentage : 0 à 20, ou « auto » (autant que tapé) ; absent : auto pour un nombre, 2 sinon. */
  decimales?: number | 'auto'
  /** Séparateur des milliers ; absent : oui. */
  sansMilliers?: boolean
  /** Monnaie : code ISO (EUR par défaut), affichage, négatifs entre parenthèses. */
  devise?: string
  affichageDevise?: 'symboleEtroit' | 'symbole' | 'code' | 'nom'
  comptable?: boolean
  /** Date : format du jour et de l'heure, heure entre parenthèses. */
  date?: FormatDate
  heure?: FormatHeure
  heureEntreParentheses?: boolean
  gras?: boolean
  italique?: boolean
  barre?: boolean
  /** Couleur du texte et surlignage (exclusifs), fond de la cellule : un code `#rrggbb` ou `entete`. */
  couleur?: string
  surligne?: string
  fond?: string
  alignement?: 'gauche' | 'centre' | 'droite'
  vertical?: 'haut' | 'milieu' | 'bas'
  /**
   * Du texte riche partiel : gras, lien ou couleur sur quelques mots de la cellule. Le texte de la cellule reste
   * du texte simple (les formules, la recherche et la copie le lisent tel quel) ; les passages se posent dessus
   * tant que `riche.texte` est encore le texte de la cellule. Absent : une cellule d'avant, lue comme du texte.
   */
  riche?: RicheCellule
}

/** Un passage du texte d'une cellule, de `de` (compris) à `a` (exclu), en unités UTF-16. */
export interface PassageCellule {
  de: number
  a: number
  gras?: true
  italique?: true
  barre?: true
  lien?: string
  /** Un nom de la palette ou un `#rrggbb`, comme `FormatCellule.couleur` et `surligne`. */
  couleur?: string
  surligne?: string
}

/** Le texte riche d'une cellule : les passages, et le texte sur lequel ils ont été posés (garde contre un texte changé depuis). */
export interface RicheCellule {
  texte: string
  passages: PassageCellule[]
}

/**
 * Une table, un petit tableur : des lignes de cellules de texte, toutes de la même longueur. Une formule commence
 * par `=`, une case à cocher vaut `true` ou `false`. `formats` a la même forme que `cellules`. Tant qu'il est
 * absent, la première ligne est l'en-tête (en gras, sur fond gris) sauf si `sansEntete` est posé.
 */
export interface Table {
  type: 'table'
  cellules: string[][]
  formats?: (FormatCellule | null)[][]
  /** Largeur de chaque colonne, en UG ; absent : la largeur de l'élément partagée également. */
  largeurs?: number[]
  titre?: string
  avecTitre?: boolean
  /** La légende, sous la grille, montrée tant que `avecLegende` est posé. */
  legende?: string
  avecLegende?: boolean
  sansEntete?: boolean
}

/** Un nuancier : une couleur libre, en `#rrggbb`, avec son code écrit dessus tant que `sansCode` n'est pas posé. */
export interface Nuancier {
  type: 'nuancier'
  couleur: string
  sansCode?: boolean
  /** Le code montré : hexadécimal (par défaut), `rgb(…)` ou `hsl(…)`. `sansCode` le cache. */
  format?: 'hex' | 'rgb' | 'hsl'
  /** La légende sous l'aplat (le nom de la couleur à la naissance), montrée tant que `avecLegende` est posé. */
  legende?: string
  avecLegende?: boolean
}

/** Un lieu : son nom (facultatif) et son adresse, avec un lien vers une carte en ligne. */
export interface Lieu {
  type: 'lieu'
  adresse: string
  nom?: string
  /** Où l'adresse tombe sur la carte, trouvé par le service `localiser` ; il sert à dessiner la carte intégrée. */
  position?: PositionLieu
}

/** Un point de la carte, en degrés. `pour` : la recherche qui l'a donné (si l'adresse change, il est périmé). */
export interface PositionLieu {
  lat: number
  lon: number
  pour: string
}

/** Un trait de crayon : ses points à la suite (`x1, y1, x2, y2…`, dans le repère de la feuille), sa couleur et son épaisseur. */
export interface Trait {
  points: number[]
  couleur: string
  epaisseur: number
  /** L'effet d'encre : la vitesse du geste amincit le trait (0 à 1). Absent : un trait d'épaisseur constante. */
  affinage?: number
}

/** Un croquis à main levée : des traits sur une feuille de taille fixe (voir `elements/croquis`). */
export interface Croquis {
  type: 'croquis'
  traits: Trait[]
  /** Le fond de la feuille, de la palette des notes ; sans lui, elle est blanche. */
  couleur?: CouleurNote
  /** La légende sous la feuille, montrée tant que `avecLegende` est posé. */
  legende?: string
  avecLegende?: boolean
}

/**
 * Un dessin tracé à main levée à même la toile : ses traits en UG, depuis son coin haut gauche, dans un cadre de
 * `largeurOrigine` × `hauteurOrigine` UG qu'on agrandit en gardant les proportions.
 */
export interface Dessin {
  type: 'dessin'
  traits: Trait[]
  largeurOrigine: number
  hauteurOrigine: number
}

/** Un document : un titre et un texte long, qui s'écrit en grand (mêmes mises en forme qu'une note). */
export interface DocumentTexte {
  type: 'document'
  titre: string
  texte: NoeudTexte
  /** La couleur de sa feuille sur la toile, de la palette des notes. */
  couleur?: CouleurNote
  /** Vue carte : 34 unités de large, avec un aperçu du texte ; absent, la carte n'est qu'une feuille et son titre. */
  carte?: boolean
  /** La légende sous la carte (vue carte seulement), montrée tant que `avecLegende` est posé. */
  legende?: string
  avecLegende?: boolean
  /** Les fils de discussion posés sur des passages du texte, par leur clé (comme `Note.fils`). */
  fils?: Record<Id, Commentaire>
  /** L'habillage de la page ouverte en grand (docs/NOTION.md § 9). */
  page?: PageDocument
}

/** L'habillage d'un document ouvert en grand : icône, couverture, police, petit texte, pleine largeur. */
export interface PageDocument {
  /** Un émoji, au-dessus du texte et sur la carte. */
  icone?: string
  /** Un fichier du tableau, en bandeau en haut de la page. */
  couverture?: Id
  /** Le cadrage vertical de la couverture, de 0 (le haut) à 100 (le bas) ; absent : le milieu. */
  cadrage?: number
  police?: 'serif' | 'mono'
  petitTexte?: boolean
  pleineLargeur?: boolean
}

/**
 * Le même élément à un autre endroit : le clone ne garde que la clé de son original, qu'il dessine à sa place.
 * Changer l'un change l'autre ; seuls la place et la largeur sont à chacun.
 */
export interface Clone {
  type: 'clone'
  cible: Id
}

/**
 * Comment les enfants d'un sujet se disposent (docs/XMIND.md § 2). Un sujet sans structure suit celle de son parent ;
 * le central en a toujours une.
 */
export type StructureArbre =
  | 'carte'
  | 'carte-libre'
  | 'carte-horaire'
  | 'carte-antihoraire'
  | 'logique-droite'
  | 'logique-gauche'
  | 'accolade-droite'
  | 'accolade-gauche'
  | 'organigramme-bas'
  | 'organigramme-haut'
  | 'arbre-droite'
  | 'arbre-gauche'
  | 'chronologie-horizontale'
  | 'chronologie-verticale'
  | 'arete-gauche'
  | 'arete-droite'
  | 'matrice-lignes'
  | 'matrice-colonnes'

/** Un sujet de carte mentale. Le central est le seul sans `parent` ; ses frères se rangent par `ordre`. */
export interface Sujet {
  parent?: Id
  /** Son rang parmi ses frères : une clé fractionnaire (`coeur/ordre.ts`). */
  ordre: string
  titre: string
  /** `detache` : un sujet flottant, posé à `position` (px, depuis le centre du central). `resume` : le sujet d'un résumé. */
  genre?: 'detache' | 'resume'
  position?: { x: number; y: number }
  /** Ses descendants sont cachés. */
  replie?: boolean
  structure?: StructureArbre
  /** Carte non équilibrée : combien de principaux vont à droite (sur le central seulement). */
  aDroite?: number
  /** Placement libre : de combien (px) la branche a été tirée hors de la place que sa structure lui donne. */
  decalage?: { x: number; y: number }
  /** Les marqueurs devant le titre, un par groupe, par leur identifiant Xmind (`priority-1`, `task-half`, `flag-red`…). */
  marqueurs?: string[]
  etiquettes?: string[]
  /** Une adresse web, ou `sujet:<id>` vers un autre sujet de la carte. */
  lien?: string
  note?: NoeudTexte
  /** Une image au-dessus du titre : le fichier, et sa taille affichée en px. */
  image?: { fichier: Id; l: number; h: number }
  tache?: 'a-faire' | 'faite'
  /** La numérotation de ses enfants : 1, 2, 3 ; I, II ; A, B ; a, b. `paliers` : préfixée de celle du parent (1.2). */
  numerotation?: { motif: 'arabe' | 'romain' | 'majuscule' | 'minuscule'; paliers?: boolean; /** « Commencer depuis le début » : ses enfants repartent de 1, sans le numéro de ce sujet devant. */ debut?: boolean }
  /** Une largeur imposée, en px : le titre passe à la ligne pour y tenir (`customWidth` d'un `.xmind`). Absente : la largeur du texte. */
  largeur?: number
  /** Son rang d'importance, qui change son habillage. */
  classe?: 'important' | 'secondaire' | 'barre'
  /** Son habillage propre, par-dessus celui du thème (docs/XMIND.md § 5). */
  style?: StyleSujet
  /** Ce que Notak ne lit pas d'un sujet venu d'un `.xmind`, gardé pour le lui rendre à l'export. */
  xmind?: Record<string, unknown>
}

/**
 * Les formes d'un sujet (docs/XMIND.md § 5, `elements/arbre/formes.ts` les dessine). `aucune` : pas de cadre.
 * Quatre groupes, comme le panneau de Xmind : basiques, avancées, ponctuation, organigramme.
 */
export type FormeSujet =
  | 'rectangle' | 'arrondi' | 'souligne' | 'double-souligne' | 'cercle' | 'ellipse' | 'losange' | 'parallelogramme' | 'capsule' | 'hexagone' | 'hexagone-arrondi' | 'rectangle-elliptique'
  | 'coeur' | 'nuage' | 'etoile' | 'goutte' | 'losange-coupe' | 'bouclier' | 'fleche-gauche' | 'fleche-droite' | 'etiquette' | 'signet' | 'angle-brise' | 'pile' | 'carte'
  | 'guillemet-simple' | 'guillemets-chevrons' | 'crochets' | 'parentheses' | 'accolades' | 'guillemet-carre' | 'guillemets'
  | 'decision' | 'saisie-manuelle' | 'processus-predefini' | 'operation-manuelle' | 'base-de-donnees' | 'document' | 'multi-documents' | 'delai' | 'donnees' | 'renvoi-page' | 'renvoi-hors-page' | 'double-cercle' | 'drapeau' | 'trapeze' | 'trapeze-inverse'
  | 'aucune'

/** Les formes d'une branche (`line-class`). */
export type FormeBranche = 'courbe' | 'droite' | 'coudee' | 'coudee-arrondie' | 'anse' | 'pli' | 'pli-arrondi' | 'aucune'

/** Le motif d'un trait ou d'un contour (`line-pattern`, `border-line-pattern`). `main` et `tirets-main` : tracés à main levée. */
export type MotifTrait = 'plein' | 'tirets' | 'points' | 'tiret-point' | 'tiret-point-point' | 'main' | 'tirets-main' | 'aucun'

/** Le motif d'un remplissage (`fill-pattern`) : plein, ou hachuré ; `aucun` : pas de remplissage. */
export type MotifRemplissage = 'plein' | 'plein-main' | 'diagonales' | 'diagonales-fines' | 'horizontales' | 'horizontales-fines' | 'aucun'

/** Le bout d'un trait (`arrow-end-class`, `arrow-begin-class`). */
export type PointeTrait = 'aucune' | 'point' | 'triangle' | 'fer-de-lance' | 'carre' | 'diamant' | 'chevrons' | 'double-fleche' | 'anti-triangle' | 'attache' | 'crochet'

/** La casse du texte (`fo:text-transform`) ; absente : celle qu'on a tapée. */
export type CasseTexte = 'majuscules' | 'minuscules' | 'capitales'

/** Ce que tout texte d'une carte peut porter : sujet, relation, limite (docs/XMIND.md § 5 bis). */
export interface StyleTexte {
  /** Une pile de polices CSS ; absente : celle du thème. */
  police?: string
  /** En pt. */
  taille?: number
  /** 100 à 900. Prime sur `gras`. */
  graisse?: number
  gras?: boolean
  italique?: boolean
  barre?: boolean
  souligne?: boolean
  casse?: CasseTexte
  alignement?: 'gauche' | 'centre' | 'droite'
  couleurTexte?: string
}

export interface StyleSujet extends StyleTexte {
  forme?: FormeSujet
  /** `#rrggbb`, ou `#rrggbbaa` avec une opacité. */
  remplissage?: string
  motifRemplissage?: MotifRemplissage
  bordure?: string
  motifBordure?: MotifTrait
  /** En pt ; 0 : pas de bordure. */
  epaisseurBordure?: number
  /** La branche qui mène à ce sujet et à ses descendants (sauf ceux qui en déclarent une autre). */
  branche?: FormeBranche
  couleurBranche?: string
  epaisseurBranche?: number
  effilee?: boolean
  motif?: MotifTrait
  /** Le bout de ses branches, côté enfant. */
  pointeBranche?: PointeTrait
  /** Sur le central : les couleurs que prennent ses branches principales, dans l'ordre (`multi-line-colors`). */
  serieCouleurs?: string[]
}

/** La forme d'une relation (`shape-class`). Les « souples » se tracent comme leurs sœurs (docs/XMIND.md § 5 bis). */
export type FormeRelation = 'courbe' | 'droite' | 'coudee' | 'zigzag' | 'courbe-souple' | 'coudee-souple' | 'zigzag-souple'

/** Le style d'une relation : son trait, ses pointes, son texte. Absent : le thème. */
export interface StyleRelation extends StyleTexte {
  forme?: FormeRelation
  motif?: MotifTrait
  epaisseur?: number
  couleur?: string
  pointeDepart?: PointeTrait
  pointeArrivee?: PointeTrait
}

/** Une flèche entre deux sujets quelconques. `controles` : ses deux points de contrôle, en px depuis chaque bout. */
export interface Relation {
  de: Id
  vers: Id
  titre?: string
  controles?: [{ x: number; y: number }, { x: number; y: number }]
  /** Avant `style` : la forme, qu'on lit encore. */
  forme?: 'courbe' | 'droite' | 'coudee'
  /** Avant `style` : les pointes (à l'arrivée seule par défaut), qu'on lit encore. */
  pointes?: { depart?: boolean; arrivee?: boolean }
  style?: StyleRelation
}

/** La forme d'une limite (`shape-class`). */
export type FormeLimite = 'rectangle' | 'arrondi' | 'polygone' | 'festons' | 'vagues' | 'tension' | 'polygone-arrondi' | 'focus' | 'croix'

export interface StyleLimite extends StyleTexte {
  forme?: FormeLimite
  remplissage?: string
  motifRemplissage?: MotifRemplissage
  /** Le contour : motif, épaisseur et couleur. */
  motif?: MotifTrait
  epaisseur?: number
  couleur?: string
}

/** Un cadre autour de la branche `de`, ou des frères de `de` à `a` (inclus). */
export interface Limite {
  de: Id
  a?: Id
  titre?: string
  style?: StyleLimite
}

/** La forme de l'accolade d'un résumé (`shape-class`) : angle, carrée, ronde, accolade, droite. */
export type FormeResume = 'angle' | 'carre' | 'ronde' | 'accolade' | 'droite'

export interface StyleResume {
  forme?: FormeResume
  motif?: MotifTrait
  epaisseur?: number
  couleur?: string
}

/** Une accolade qui rassemble les frères de `de` à `a` (ou la branche `de`) vers le sujet `sujet`, de genre `resume`. */
export interface Resume {
  de: Id
  a?: Id
  sujet: Id
  style?: StyleResume
}

/** Une carte mentale (docs/XMIND.md) : ses sujets, à plat, par identifiant. */
export interface Arbre {
  type: 'arbre'
  sujets: Record<Id, Sujet>
  relations?: Record<Id, Relation>
  limites?: Record<Id, Limite>
  resumes?: Record<Id, Resume>
  /** `compacte` : des branches plus serrées. `libre` : un sujet glissé garde la place où on le lâche. `uneCouleur` : toutes les branches de l'encre du thème, sans arc-en-ciel. */
  options?: { compacte?: boolean; libre?: boolean; uneCouleur?: boolean }
  /** Le thème de la carte (`elements/arbre/themes.ts`) ; absent : le classique. */
  theme?: string
}

export type Contenu =
  | Arbre
  | Note
  | Image
  | Fichier
  | Lien
  | Taches
  | Colonne
  | Ligne
  | RenvoiTableau
  | Commentaire
  | Table
  | Nuancier
  | Lieu
  | Croquis
  | Dessin
  | DocumentTexte
  | Clone
export type TypeContenu = Contenu['type']

/** Une étiquette du tableau : un nom et une couleur. Les éléments ne gardent que son id. */
export interface Etiquette {
  id: Id
  nom: string
  couleur: CouleurNote
}

/** Qui a réagi avec quel émoji : l'émoji, puis les ids des personnes, dans l'ordre où elles sont venues. */
export type Reactions = Record<string, string[]>

/** `icone` : l'élément se replie en une pastille (son type et son résumé). `detail` : tel qu'il est dessiné. */
export type Affichage = 'icone' | 'detail'

export interface Element<C extends Contenu = Contenu> {
  id: Id
  /** Coin haut-gauche, en unités de grille entières. Sans effet dans une colonne et pour une ligne. */
  x: number
  y: number
  largeur: number
  contenu: C
  /** La colonne qui le contient, s'il est rangé dans une colonne. */
  parent?: Id
  /** Son rang dans la colonne : une clé fractionnaire, triée comme une chaîne. */
  ordre?: string
  /** À la corbeille du tableau depuis cette date (ms) : hors de la toile, restaurable. */
  corbeille?: number
  /** Dans les non triés du tableau depuis cette date (ms) : en attente d'une place sur la toile. */
  nonTrie?: number
  /** Verrouillé : ne se glisse pas, ne se redimensionne pas, ne part pas à la corbeille, reste dessous. */
  verrou?: boolean
  /** La hauteur qu'on lui a donnée, pour les types qui le permettent (note, lien). */
  hauteur?: Hauteur
  /** Les étiquettes posées dessus (ids des `Tableau.etiquettes`). */
  etiquettes?: Id[]
  /** Les réactions des gens, par émoji. */
  reactions?: Reactions
  /** Pour quel jour (`aaaa-mm-jj`). */
  echeance?: string
  /** La personne à qui il est confié. */
  assigne?: Auteur
  /** Absent : tel qu'il est dessiné (`detail`). */
  affichage?: Affichage
  /** Un fil de discussion accroché à l'élément, qui n'occupe pas de place sur la toile. */
  commentaire?: Commentaire
}

/** Les champs que tout élément peut porter, quel que soit son type : ils changent ensemble, d'un seul pas. */
export const CHAMPS_ANNOTES = ['etiquettes', 'reactions', 'echeance', 'assigne', 'affichage', 'commentaire'] as const
export type Annotations = Pick<Element, (typeof CHAMPS_ANNOTES)[number]>

/** Ce qu'un élément porte de ces champs, sans les absents. */
export function annotationsDe(e: Element): Annotations {
  const a: Record<string, unknown> = {}
  for (const c of CHAMPS_ANNOTES) if (e[c] !== undefined) a[c] = e[c]
  return a as Annotations
}

/**
 * Le pas qui change certains de ces champs : une valeur `null` (ou une liste vide) le retire, les autres champs
 * restent. Rend `null` si rien ne change.
 */
export function annoter(e: Element, changement: { [K in keyof Annotations]?: Annotations[K] | null }): Operation | null {
  const de = annotationsDe(e)
  const vers: Record<string, unknown> = { ...de }
  for (const c of CHAMPS_ANNOTES) {
    if (!(c in changement)) continue
    const v = changement[c]
    const vide = v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (c === 'reactions' && Object.keys(v as object).length === 0)
    if (vide) delete vers[c]
    else vers[c] = v
  }
  if (JSON.stringify(de) === JSON.stringify(vers)) return null
  return { type: 'annoter', id: e.id, de, vers: vers as Annotations }
}

/** Où est un élément : sur la toile (`x`, `y`), ou rangé dans une colonne (`parent`, `ordre`). */
export interface Place {
  parent?: Id
  ordre?: string
  x: number
  y: number
  corbeille?: number
  nonTrie?: number
}

export const placeDe = (e: Element): Place => ({
  ...(e.parent !== undefined ? { parent: e.parent } : {}),
  ...(e.ordre !== undefined ? { ordre: e.ordre } : {}),
  x: e.x,
  y: e.y,
  ...(e.corbeille !== undefined ? { corbeille: e.corbeille } : {}),
  ...(e.nonTrie !== undefined ? { nonTrie: e.nonTrie } : {}),
})

export const memePlace = (a: Place, b: Place) =>
  a.parent === b.parent && a.ordre === b.ordre && a.x === b.x && a.y === b.y && a.corbeille === b.corbeille && a.nonTrie === b.nonTrie

/** Un tableau : ses éléments, du plus bas au plus haut dans l'empilement. */
export interface Tableau {
  id?: Id
  titre: string
  /** La couleur de sa carte dans le tableau parent. */
  couleur?: CouleurNote
  /** Les étiquettes qu'on peut poser sur ses éléments. */
  etiquettes?: Etiquette[]
  /** Son arrière-plan : couleur du canevas et grille de points. Absent : le gris et les points. */
  fond?: Fond
  elements: Element[]
}

/** Un geste élémentaire. Chacun a son inverse, ce qui fait l'historique. */
export type Operation =
  | { type: 'creer'; element: Element }
  | { type: 'supprimer'; element: Element }
  | { type: 'deplacer'; id: Id; de: [number, number]; vers: [number, number] }
  | { type: 'redimensionner'; id: Id; de: number; vers: number }
  | { type: 'contenu'; id: Id; avant: Contenu; apres: Contenu }
  /** Change la place d'un élément : le sortir ou l'entrer d'une colonne, le replacer dans la colonne ou sur la toile. */
  | { type: 'ranger'; id: Id; de: Place; vers: Place }
  /** Verrouille ou libère sa position. */
  | { type: 'verrouiller'; id: Id; de: boolean; vers: boolean }
  /** Donne une hauteur à l'élément, ou la rend à son contenu (`null`). */
  | { type: 'borner'; id: Id; de: Hauteur | null; vers: Hauteur | null }
  /** Change les étiquettes, réactions, échéance, personne, affichage ou fil d'un élément (voir `annoter`). */
  | { type: 'annoter'; id: Id; de: Annotations; vers: Annotations }
  /** Change la liste des étiquettes du tableau. */
  | { type: 'etiquettes'; de: Etiquette[]; vers: Etiquette[] }
  /** Change l'arrière-plan du tableau (`undefined` : celui d'origine). */
  | { type: 'fond'; de: Fond | undefined; vers: Fond | undefined }

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Un identifiant triable par date de création (ULID). */
export function nouvelId(maintenant = Date.now()): Id {
  let temps = ''
  for (let t = maintenant, i = 0; i < 10; i++, t = Math.floor(t / 32)) temps = BASE32[t % 32] + temps
  const hasard = crypto.getRandomValues(new Uint8Array(16))
  return temps + Array.from(hasard, (o) => BASE32[o % 32]).join('')
}

export const borner = (v: number) => Math.max(-POSITION_MAX, Math.min(POSITION_MAX, v))

/** Arrondit une position libre à l'unité de grille. */
export const aimanter = (p: Point): [number, number] => [borner(Math.round(p.x)), borner(Math.round(p.y))]

export function docDepuisTexte(texte: string): NoeudTexte {
  return {
    type: 'doc',
    content: texte
      .split('\n')
      .map((ligne) => (ligne ? { type: 'paragraph', content: [{ type: 'text', text: ligne }] } : { type: 'paragraph' })),
  }
}

/** Le texte d'un document, sans mise en forme : un bloc par ligne. */
export function texteBrut(n: NoeudTexte): string {
  if (n.text !== undefined) return n.text
  // Une personne ou un tableau cité dans le texte se lit par son nom.
  if ((n.type === 'mention' || n.type === 'lienTableau') && typeof n.attrs?.label === 'string') return n.type === 'mention' ? `@${n.attrs.label}` : n.attrs.label
  return (n.content ?? []).map(texteBrut).filter((t) => t !== '').join('\n')
}

export function nouvelleNote(x: number, y: number, texte = ''): Element<Note> {
  return {
    id: nouvelId(),
    x: borner(x),
    y: borner(y),
    largeur: LARGEUR_NOTE,
    contenu: { type: 'note', texte: docDepuisTexte(texte) },
  }
}

/** Largeur par défaut d'une colonne, en unités de grille. */
export const LARGEUR_COLONNE = 34

export function nouvelleColonne(x: number, y: number, titre = ''): Element<Colonne> {
  return { id: nouvelId(), x: borner(x), y: borner(y), largeur: LARGEUR_COLONNE, contenu: { type: 'colonne', titre } }
}

export const position = (e: Element): Point => point(e.x, e.y)

export function inverse(op: Operation): Operation {
  switch (op.type) {
    case 'creer':
      return { type: 'supprimer', element: op.element }
    case 'supprimer':
      return { type: 'creer', element: op.element }
    case 'deplacer':
      return { type: 'deplacer', id: op.id, de: op.vers, vers: op.de }
    case 'redimensionner':
      return { type: 'redimensionner', id: op.id, de: op.vers, vers: op.de }
    case 'contenu':
      return { type: 'contenu', id: op.id, avant: op.apres, apres: op.avant }
    case 'ranger':
      return { type: 'ranger', id: op.id, de: op.vers, vers: op.de }
    case 'verrouiller':
      return { type: 'verrouiller', id: op.id, de: op.vers, vers: op.de }
    case 'borner':
      return { type: 'borner', id: op.id, de: op.vers, vers: op.de }
    case 'annoter':
      return { type: 'annoter', id: op.id, de: op.vers, vers: op.de }
    case 'etiquettes':
      return { type: 'etiquettes', de: op.vers, vers: op.de }
    case 'fond':
      return { type: 'fond', de: op.vers, vers: op.de }
  }
}

/** Applique une opération et rend un nouveau tableau ; l'ancien n'est pas touché. */
export function appliquer(t: Tableau, op: Operation): Tableau {
  switch (op.type) {
    case 'creer':
      return t.elements.some((e) => e.id === op.element.id) ? t : { ...t, elements: [...t.elements, op.element] }
    case 'supprimer':
      return { ...t, elements: t.elements.filter((e) => e.id !== op.element.id) }
    case 'deplacer':
      return modifier(t, op.id, (e) => ({ ...e, x: borner(op.vers[0]), y: borner(op.vers[1]) }))
    case 'redimensionner':
      return modifier(t, op.id, (e) => ({ ...e, largeur: op.vers }))
    case 'contenu':
      return modifier(t, op.id, (e) => ({ ...e, contenu: op.apres }))
    case 'ranger':
      return modifier(t, op.id, (e) => placer(e, op.vers))
    case 'verrouiller':
      return modifier(t, op.id, ({ verrou: _v, ...e }) => (op.vers ? { ...e, verrou: true } : e))
    case 'borner':
      return modifier(t, op.id, ({ hauteur: _h, ...e }) => (op.vers ? { ...e, hauteur: op.vers } : e))
    case 'annoter':
      return modifier(t, op.id, (e) => {
        const reste: Record<string, unknown> = { ...e }
        for (const c of CHAMPS_ANNOTES) delete reste[c]
        return { ...reste, ...op.vers } as Element
      })
    case 'etiquettes': {
      const { etiquettes: _e, ...reste } = t
      return op.vers.length > 0 ? { ...reste, etiquettes: op.vers } : reste
    }
    case 'fond': {
      const { fond: _f, ...reste } = t
      return op.vers ? { ...reste, fond: op.vers } : reste
    }
  }
}

function placer(e: Element, p: Place): Element {
  const { parent: _parent, ordre: _ordre, corbeille: _corbeille, nonTrie: _nonTrie, ...reste } = e
  return {
    ...reste,
    x: borner(p.x),
    y: borner(p.y),
    ...(p.parent !== undefined ? { parent: p.parent } : {}),
    ...(p.ordre !== undefined ? { ordre: p.ordre } : {}),
    ...(p.corbeille !== undefined ? { corbeille: p.corbeille } : {}),
    ...(p.nonTrie !== undefined ? { nonTrie: p.nonTrie } : {}),
  }
}

/** Ce qui est sur le tableau : ni à la corbeille, ni dans les non triés, ni rangé dans un conteneur qui y est. */
export function surLeTableau(t: Tableau): Element[] {
  const jetes = new Set(t.elements.filter((e) => e.corbeille !== undefined || e.nonTrie !== undefined).map((e) => e.id))
  if (jetes.size === 0) return t.elements
  return t.elements.filter((e) => !jetes.has(e.id) && !(e.parent && jetes.has(e.parent)))
}

/** Ce qui attend dans les non triés (pas à la corbeille), du plus ancien au plus récent. */
export const nonTriesDe = (t: Tableau): Element[] =>
  t.elements.filter((e) => e.nonTrie !== undefined && e.corbeille === undefined).sort((a, b) => a.nonTrie! - b.nonTrie!)

/** Ce qui est à la corbeille, du plus récent au plus ancien. */
export const aLaCorbeille = (t: Tableau): Element[] =>
  t.elements.filter((e) => e.corbeille !== undefined).sort((a, b) => b.corbeille! - a.corbeille!)

function modifier(t: Tableau, id: Id, f: (e: Element) => Element): Tableau {
  return { ...t, elements: t.elements.map((e) => (e.id === id ? f(e) : e)) }
}

/** Passe ces éléments au-dessus des autres, en gardant leur ordre entre eux. */
export function auPremierPlan(t: Tableau, ids: Iterable<Id>): Tableau {
  const dessus = new Set(ids)
  return {
    ...t,
    elements: [...t.elements.filter((e) => !dessus.has(e.id)), ...t.elements.filter((e) => dessus.has(e.id))],
  }
}

/** Passe ces éléments sous les autres, en gardant leur ordre entre eux. */
export function auDernierPlan(t: Tableau, ids: Iterable<Id>): Tableau {
  const dessous = new Set(ids)
  return {
    ...t,
    elements: [...t.elements.filter((e) => dessous.has(e.id)), ...t.elements.filter((e) => !dessous.has(e.id))],
  }
}

/**
 * Un cran plus haut (ou plus bas) parmi ce qui les chevauche : la sélection passe juste au-dessus du plus haut
 * (ou juste sous le plus bas) des éléments qu'elle touche. Rien ne bouge si rien ne la touche.
 */
export function dUnCran(t: Tableau, ids: Iterable<Id>, touches: ReadonlySet<Id>, sens: 'haut' | 'bas'): Tableau {
  const choisis = new Set(ids)
  const autres = t.elements.filter((e) => !choisis.has(e.id))
  const bougent = t.elements.filter((e) => choisis.has(e.id))
  const rangs = autres.flatMap((e, i) => (touches.has(e.id) ? [i] : []))
  if (rangs.length === 0 || bougent.length === 0) return t
  const ou = sens === 'haut' ? Math.max(...rangs) + 1 : Math.min(...rangs)
  return { ...t, elements: [...autres.slice(0, ou), ...bougent, ...autres.slice(ou)] }
}

/**
 * Ces éléments, plus ce que leur suppression emporte (le contenu d'une colonne), sans doublon.
 * `aussi` dit ce que chaque élément emporte : c'est le type qui le sait.
 */
export function avecDependants(
  choisis: readonly Element[],
  t: Tableau,
  aussi: (e: Element, t: Tableau) => Element[],
): Element[] {
  const tous = new Map<Id, Element>()
  for (const e of choisis) {
    tous.set(e.id, e)
    for (const d of aussi(e, t)) tous.set(d.id, d)
  }
  return [...tous.values()]
}
