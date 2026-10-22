import { type Point } from './geometrie';
export type Id = string;
/** Largeur par défaut d'une note, en unités de grille. */
export declare const LARGEUR_NOTE = 34;
/** Hauteur d'une note vide, en unités de grille. */
export declare const HAUTEUR_NOTE_MIN = 8;
/** Une position ne s'éloigne jamais plus de ça de l'origine. */
export declare const POSITION_MAX = 15000;
/**
 * Un nœud de texte riche, au format JSON de Tiptap (ProseMirror) :
 * `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '…' }] }] }`.
 */
export interface NoeudTexte {
    type: string;
    attrs?: Record<string, unknown>;
    content?: NoeudTexte[];
    text?: string;
    marks?: {
        type: string;
        attrs?: Record<string, unknown>;
    }[];
}
/** La couleur d'une note, par son nom : les valeurs affichées dépendent du thème. */
export type CouleurNote = 'gris' | 'cyan' | 'vert' | 'brun' | 'jaune' | 'orange' | 'rouge' | 'rose' | 'violet' | 'bleu' | 'bleu_nuit' | 'transparent';
/** Les couleurs de fond qu'on peut donner à une note, dans l'ordre de la palette (`transparent` en plus). */
export declare const COULEURS_NOTE: readonly ["gris", "cyan", "vert", "brun", "jaune", "orange", "rouge", "rose", "violet", "bleu", "bleu_nuit"];
/** `titre` : posé sur la toile, sans fond, texte centré. */
export type VarianteNote = 'normale' | 'titre';
export interface Note {
    type: 'note';
    texte: NoeudTexte;
    couleur?: CouleurNote;
    variante?: VarianteNote;
}
/** Une image envoyée. Le fichier vit dans le dépôt de fichiers, l'élément ne garde que sa clé. */
export interface Image {
    type: 'image';
    fichier: Id;
    /** Taille d'origine en pixels, pour garder les proportions. */
    largeurOrigine: number;
    hauteurOrigine: number;
    legende?: string;
    /** Le type du fichier (`image/png`…) : les formats à transparence n'ont pas d'ombre. */
    typeMime?: string;
}
export interface Apercu {
    titre?: string;
    description?: string;
    /** Adresse de l'image d'aperçu. */
    image?: string;
    site?: string;
    favicon?: string;
}
export interface Lien {
    type: 'lien';
    url: string;
    apercu?: Apercu;
    /** `attente` tant que l'aperçu se charge, `echec` s'il n'a pas pu l'être. */
    statut: 'attente' | 'pret' | 'echec';
}
/** Une liste de tâches : un document Tiptap fait d'une liste de cases. */
export interface Taches {
    type: 'taches';
    titre?: string;
    texte: NoeudTexte;
}
/** Une colonne : ses éléments portent `parent` = l'id de la colonne, et un `ordre`. */
export interface Colonne {
    type: 'colonne';
    titre: string;
    couleur?: CouleurNote;
    repliee?: boolean;
}
/** Une extrémité de ligne : un point libre du tableau, ou accrochée à un élément. */
export type Extremite = {
    x: number;
    y: number;
} | {
    element: Id;
};
export type Pointe = 'fleche' | 'rond' | 'rien';
export interface Ligne {
    type: 'ligne';
    depart: Extremite;
    arrivee: Extremite;
    /** Courbe de Bézier quadratique : écart perpendiculaire (UG) et position le long de la corde (0 à 1). */
    courbe?: {
        ecart: number;
        position: number;
    };
    pointeDepart: Pointe;
    pointeArrivee: Pointe;
    trait: 'plein' | 'tirets' | 'points';
    epaisseur: 1 | 2 | 4;
    couleur?: CouleurNote;
    libelle?: string;
}
/** Un tableau imbriqué, posé sur la toile de son parent. */
export interface RenvoiTableau {
    type: 'tableau';
    cible: Id;
    /**
     * Le dernier nom donné depuis ce renvoi. Il sert à l'historique : annuler un renommage
     * remet ce champ, et la carte en reporte la valeur sur le tableau cible.
     */
    titre?: string;
}
export type Contenu = Note | Image | Lien | Taches | Colonne | Ligne | RenvoiTableau;
export type TypeContenu = Contenu['type'];
export interface Element<C extends Contenu = Contenu> {
    id: Id;
    /** Coin haut-gauche, en unités de grille entières. Sans effet dans une colonne et pour une ligne. */
    x: number;
    y: number;
    largeur: number;
    contenu: C;
    /** La colonne qui le contient, s'il est rangé dans une colonne. */
    parent?: Id;
    /** Son rang dans la colonne : une clé fractionnaire, triée comme une chaîne. */
    ordre?: string;
}
/** Où est un élément : sur la toile (`x`, `y`), ou rangé dans une colonne (`parent`, `ordre`). */
export interface Place {
    parent?: Id;
    ordre?: string;
    x: number;
    y: number;
}
export declare const placeDe: (e: Element) => Place;
export declare const memePlace: (a: Place, b: Place) => boolean;
/** Un tableau : ses éléments, du plus bas au plus haut dans l'empilement. */
export interface Tableau {
    id?: Id;
    titre: string;
    /** La couleur de sa carte dans le tableau parent. */
    couleur?: CouleurNote;
    elements: Element[];
}
/** Un geste élémentaire. Chacun a son inverse, ce qui fait l'historique. */
export type Operation = {
    type: 'creer';
    element: Element;
} | {
    type: 'supprimer';
    element: Element;
} | {
    type: 'deplacer';
    id: Id;
    de: [number, number];
    vers: [number, number];
} | {
    type: 'redimensionner';
    id: Id;
    de: number;
    vers: number;
} | {
    type: 'contenu';
    id: Id;
    avant: Contenu;
    apres: Contenu;
}
/** Change la place d'un élément : le sortir ou l'entrer d'une colonne, le replacer dans la colonne ou sur la toile. */
 | {
    type: 'ranger';
    id: Id;
    de: Place;
    vers: Place;
};
/** Un identifiant triable par date de création (ULID). */
export declare function nouvelId(maintenant?: number): Id;
export declare const borner: (v: number) => number;
/** Arrondit une position libre à l'unité de grille. */
export declare const aimanter: (p: Point) => [number, number];
export declare function docDepuisTexte(texte: string): NoeudTexte;
export declare function nouvelleNote(x: number, y: number, texte?: string): Element<Note>;
/** Largeur par défaut d'une colonne, en unités de grille. */
export declare const LARGEUR_COLONNE = 34;
export declare function nouvelleColonne(x: number, y: number, titre?: string): Element<Colonne>;
export declare const position: (e: Element) => Point;
export declare function inverse(op: Operation): Operation;
/** Applique une opération et rend un nouveau tableau ; l'ancien n'est pas touché. */
export declare function appliquer(t: Tableau, op: Operation): Tableau;
/** Passe ces éléments au-dessus des autres, en gardant leur ordre entre eux. */
export declare function auPremierPlan(t: Tableau, ids: Iterable<Id>): Tableau;
/**
 * Ces éléments, plus ce que leur suppression emporte (le contenu d'une colonne), sans doublon.
 * `aussi` dit ce que chaque élément emporte : c'est le type qui le sait.
 */
export declare function avecDependants(choisis: readonly Element[], t: Tableau, aussi: (e: Element, t: Tableau) => Element[]): Element[];
