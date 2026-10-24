/**
 * Où poser un menu, un sous-menu et la barre d'un sujet pour qu'ils restent dans la fenêtre (docs/XMIND.md § 8 et
 * § 14). Des fonctions pures : les mesures entrent, des positions sortent ; les composants ne font que mesurer.
 */

export interface Point {
  x: number
  y: number
}
export interface Taille {
  l: number
  h: number
}
export interface Boite extends Point, Taille {}
/** Le bouton sous lequel un menu s'ouvre (le « + ») : ses bords haut et bas, en px de la fenêtre. */
export interface Ancre {
  haut: number
  bas: number
}

/** Ce qu'un menu laisse au bord de la fenêtre. */
export const MARGE_FENETRE = 8
/** L'écart entre un bouton et le menu qu'il ouvre : 6 px, comme Xmind (docs/XMIND.md § 8). */
export const ECART_ANCRE = 6
/** Le retrait du premier item d'un menu : son rembourrage (8) et sa bordure (1). Un sous-menu monte d'autant pour s'aligner sur son entrée. */
export const RETRAIT_MENU = 9
/** L'écart visible entre un menu et son sous-menu. */
export const ECART_SOUS_MENU = 4

/** Une valeur gardée entre deux bornes ; si elles se croisent (la fenêtre est trop petite), c'est la borne basse. */
export const borner = (v: number, min: number, max: number): number => (max < min ? min : Math.max(min, Math.min(v, max)))

/**
 * La place d'un menu. Au point voulu s'il tient ; sinon il glisse pour rester dans la fenêtre. Sous un bouton (`ancre`) :
 * à 6 px sous lui, à son bord gauche ; s'il ne tient pas dessous, au-dessus du bouton. Il ne recouvre jamais son bouton
 * tant que l'un des deux côtés a la place.
 */
export function poserMenu(voulu: Point, menu: Taille, fenetre: Taille, ancre?: Ancre): Point {
  const x = borner(voulu.x, MARGE_FENETRE, fenetre.l - menu.l - MARGE_FENETRE)
  if (!ancre) return { x, y: borner(voulu.y, MARGE_FENETRE, fenetre.h - menu.h - MARGE_FENETRE) }
  const dessous = ancre.bas + ECART_ANCRE
  if (dessous + menu.h <= fenetre.h - MARGE_FENETRE) return { x, y: dessous }
  const dessus = ancre.haut - ECART_ANCRE - menu.h
  if (dessus >= MARGE_FENETRE) return { x, y: dessus }
  // Ni dessus ni dessous : le côté qui a le plus de place, le menu contre le bord de la fenêtre.
  const placeDessous = fenetre.h - MARGE_FENETRE - dessous
  const placeDessus = ancre.haut - ECART_ANCRE - MARGE_FENETRE
  return { x, y: placeDessous >= placeDessus ? borner(dessous, MARGE_FENETRE, fenetre.h - menu.h - MARGE_FENETRE) : MARGE_FENETRE }
}

/**
 * Où s'ouvre un sous-menu : à droite de son menu s'il y a la place, sinon à gauche ; et, s'il dépasse en bas (ou en
 * haut), décalé juste ce qu'il faut. `decalage` s'ajoute à l'alignement ordinaire (sa première entrée face à l'entrée parente).
 */
export function poserSousMenu(parent: Boite, entree: Boite, sous: Taille, fenetre: Taille): { cote: 'droite' | 'gauche'; decalage: number } {
  const aDroite = parent.x + parent.l + ECART_SOUS_MENU + sous.l <= fenetre.l - MARGE_FENETRE
  const aGauche = parent.x - ECART_SOUS_MENU - sous.l >= MARGE_FENETRE
  const cote = aDroite || !aGauche ? 'droite' : 'gauche'
  const haut = entree.y - RETRAIT_MENU
  const decalage = borner(fenetre.h - MARGE_FENETRE - (haut + sous.h), MARGE_FENETRE - haut, 0)
  return { cote, decalage }
}

/**
 * La barre qui flotte au-dessus d'un sujet (capture 20) : centrée sur le sujet (`x`), à 8 px au-dessus de son bord haut
 * (`y`) ; elle ne sort pas de la zone. Si le haut ne laisse pas la place (sous la barre d'outils, hors de la zone), elle
 * passe sous le sujet (`bas`, son bord bas). Sans mesure de la zone (largeur nulle), elle se centre sans se borner.
 */
export function placerBarreSujet(
  sujet: { x: number; y: number; bas?: number | undefined },
  barre: Taille,
  zone: Taille,
  hautMin = 64,
  ecart = 8,
): { x: number; y: number; dessous: boolean } {
  const x = zone.l > 0 ? borner(sujet.x - barre.l / 2, MARGE_FENETRE, zone.l - barre.l - MARGE_FENETRE) : sujet.x - barre.l / 2
  const dessus = sujet.y - barre.h - ecart
  if (dessus >= hautMin || sujet.bas === undefined) return { x, y: dessus, dessous: false }
  return { x, y: sujet.bas + ecart, dessous: true }
}
