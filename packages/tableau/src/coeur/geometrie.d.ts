/** Un point du tableau, en unités de grille (UG), ou de l'écran, en pixels. */
export interface Point {
    x: number;
    y: number;
}
/** Un rectangle aligné sur les axes : coin haut-gauche et coin bas-droit. */
export interface Rect {
    min: Point;
    max: Point;
}
export declare const point: (x: number, y: number) => Point;
export declare const ajouter: (a: Point, b: Point) => Point;
export declare const soustraire: (a: Point, b: Point) => Point;
export declare function depuisCoins(a: Point, b: Point): Rect;
export declare const depuisTaille: (min: Point, largeur: number, hauteur: number) => Rect;
export declare const largeur: (r: Rect) => number;
export declare const hauteur: (r: Rect) => number;
export declare const centre: (r: Rect) => Point;
export declare const contient: (r: Rect, p: Point) => boolean;
/** Vrai si les deux rectangles se touchent, même d'un bord. */
export declare const chevauche: (a: Rect, b: Rect) => boolean;
export declare function englobant(rects: Iterable<Rect>): Rect | null;
