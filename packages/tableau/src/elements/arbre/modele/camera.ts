import type { Boite } from '../disposition'

/**
 * La caméra de la toile (docs/XMIND.md § 4 bis) : où est la carte dans la fenêtre, et à quelle échelle. Tout est en
 * fonctions pures, pour que le défilement, le zoom et la révélation d'un sujet se testent sans écran.
 */

/** `x`, `y` : où tombe l'origine de la carte, en px de la surface ; `z` : le zoom (1 = 100 %). */
export interface Camera {
  x: number
  y: number
  z: number
}

/** La taille de la surface, en px d'écran. */
export interface Fenetre {
  l: number
  h: number
}

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 5

/** La caméra se pose sur un sujet que la frappe ou le clavier vient de lui désigner en 200 ms, d'un mouvement linéaire. */
export const DUREE_REVELATION = 200

/** À chaque image, l'auto-défilement avance de cette part de ce que le pointeur dépasse de la zone morte. */
export const PART_DEFILEMENT = 0.12

export const borneZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

/**
 * La marge d'une fenêtre, en px d'écran : le plus grand de 20 px de carte et de 5 % de la dimension visible. Elle sert
 * de zone morte à l'auto-défilement, et de bord autour d'un sujet qu'on ramène dans la vue.
 */
export const margeEcran = (dimension: number, zoom: number): number => Math.max(20 * zoom, 0.05 * dimension)

/** Le facteur d'un cran de molette avec Cmd (ou d'un pincement) : 1 + deltaY × −0,01, borné à ± 0,5. */
export const facteurMolette = (deltaY: number): number => 1 + Math.min(0.5, Math.max(-0.5, -deltaY * 0.01))

/** Zoome de `facteur` autour de `autour` (px de la surface) : le point de la carte qui s'y trouve ne bouge pas. */
export function zoomAutour(c: Camera, facteur: number, autour: { x: number; y: number }): Camera {
  const z = borneZoom(c.z * facteur)
  const k = z / c.z
  return { x: autour.x - (autour.x - c.x) * k, y: autour.y - (autour.y - c.y) * k, z }
}

/**
 * Retient la caméra dans l'étendue défilable : le contenu, plus une fenêtre de marge de chaque côté. On peut donc
 * pousser la carte jusqu'à ce qu'elle ne touche plus la fenêtre que par un bord, pas plus loin. Sans fenêtre mesurée
 * (rien d'affiché), la caméra reste telle quelle.
 */
export function borner(c: Camera, contenu: Boite, fenetre: Fenetre): Camera {
  if (fenetre.l <= 0 || fenetre.h <= 0) return c
  const [x0, x1] = [contenu.x * c.z, (contenu.x + contenu.l) * c.z]
  const [y0, y1] = [contenu.y * c.z, (contenu.y + contenu.h) * c.z]
  const x = Math.min(fenetre.l - x0, Math.max(-x1, c.x))
  const y = Math.min(fenetre.h - y0, Math.max(-y1, c.y))
  return x === c.x && y === c.y ? c : { ...c, x, y }
}

/** De combien décaler un segment `[debut, fin]` pour qu'il tienne dans `[bas, haut]` : le minimum, ou le centrage s'il est trop grand. */
function decalage(debut: number, fin: number, bas: number, haut: number): number {
  if (haut - bas < fin - debut) return (bas + haut) / 2 - (debut + fin) / 2
  if (debut < bas) return bas - debut
  if (fin > haut) return haut - fin
  return 0
}

/**
 * La caméra qui ramène `boite` (px de carte) dans la vue, ou `null` s'il n'y a rien à faire. Un sujet déjà entièrement
 * dans la fenêtre rétrécie de sa marge ne la fait pas bouger ; sinon elle se décale du minimum nécessaire ; un sujet
 * plus grand que la fenêtre rétrécie est centré. Si le décalage sortait de l'étendue défilable (`contenu` donné), la
 * demande est ignorée.
 */
export function reveler(c: Camera, fenetre: Fenetre, boite: Boite, contenu?: Boite): Camera | null {
  if (fenetre.l <= 0 || fenetre.h <= 0) return null
  const [mx, my] = [margeEcran(fenetre.l, c.z), margeEcran(fenetre.h, c.z)]
  const gauche = c.x + boite.x * c.z
  const haut = c.y + boite.y * c.z
  const dx = decalage(gauche, gauche + boite.l * c.z, mx, fenetre.l - mx)
  const dy = decalage(haut, haut + boite.h * c.z, my, fenetre.h - my)
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null
  const vers = { ...c, x: c.x + dx, y: c.y + dy }
  if (contenu && borner(vers, contenu, fenetre) !== vers) return null
  return vers
}

/**
 * L'auto-défilement près du bord pendant un cadre ou un glisser : de combien la caméra avance (px d'écran) à cette
 * image, d'après la place du pointeur dans la surface. Rien dans la zone morte ; au-delà, 12 % de ce qu'il dépasse, sans
 * plafond. Le signe est celui de la caméra : le pointeur à droite fait aller la carte vers la gauche.
 */
export function defilementAuto(p: { x: number; y: number }, fenetre: Fenetre, zoom: number): { dx: number; dy: number } {
  const axe = (v: number, dimension: number) => {
    const m = margeEcran(dimension, zoom)
    if (v < m) return PART_DEFILEMENT * (m - v)
    if (v > dimension - m) return -PART_DEFILEMENT * (v - (dimension - m))
    return 0
  }
  if (fenetre.l <= 0 || fenetre.h <= 0) return { dx: 0, dy: 0 }
  return { dx: axe(p.x, fenetre.l), dy: axe(p.y, fenetre.h) }
}

/** La caméra à l'instant `t` (de 0 à 1) d'un mouvement linéaire de `de` à `vers`. */
export const interpoler = (de: Camera, vers: Camera, t: number): Camera => ({
  x: de.x + (vers.x - de.x) * t,
  y: de.y + (vers.y - de.y) * t,
  z: de.z + (vers.z - de.z) * t,
})
