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
/** Une valeur gardée entre deux bornes ; si elles se croisent (la fenêtre est trop petite), c'est la borne basse. */
export const borner = (v: number, min: number, max: number): number => (max < min ? min : Math.max(min, Math.min(v, max)))

/** Le côté d'une ancre où s'ouvre une fenêtre flottante ; `libre` : à un point, sans ancre (un clic droit), qui glisse seulement. */
export type CoteFlottant = 'bas' | 'haut' | 'gauche' | 'droite' | 'libre'
/** Sur l'autre axe : le bord de départ de l'ancre (haut ou gauche), son milieu, ou son bord de fin (bas ou droite). */
export type AlignementFlottant = 'debut' | 'centre' | 'fin'

export interface OptionsFlottant {
  /** Le côté voulu de l'ancre. `bas` par défaut. */
  cote?: CoteFlottant
  alignement?: AlignementFlottant
  /** L'écart entre l'ancre et la fenêtre. 6 px par défaut. */
  ecart?: number
  /** Ajouté à la position transversale, après l'alignement. */
  decalage?: number
  /** Ce qu'elle laisse au bord de la fenêtre. 8 px par défaut. */
  marge?: number
}

export interface PlaceFlottant extends Point, Taille {
  /** Le côté où la fenêtre est vraiment posée : `bas` demandé mais `haut` rendu veut dire qu'elle s'est retournée. */
  cote: CoteFlottant
  /** Vrai quand la fenêtre est plus haute (ou plus large) que la place : `h` (ou `l`) est alors la limite, et le contenu défile. */
  borneH: boolean
  borneL: boolean
}

/**
 * LA règle de placement de tout ce qui flotte (menus, popovers, listes, fenêtres de réglages). Une fenêtre de taille
 * `taille` se pose du côté voulu de son ancre ; si elle y sort de la fenêtre (`fenetre`, de 0 à `l` et `h`), elle se
 * retourne de l'autre côté ; si elle sort encore des deux, elle glisse pour tenir avec `marge` de chaque bord (et recouvre
 * alors son ancre, faute de mieux). Sur l'autre axe, elle s'aligne sur l'ancre puis glisse de même. Enfin, plus grande que
 * la fenêtre moins ses marges, elle est bornée à cette place : `borneH` et `borneL` disent qu'il faut limiter sa
 * hauteur (le contenu défile) ou sa largeur. Toutes les mesures sont dans le repère de la fenêtre.
 */
export function placerFlottant(ancre: Boite, taille: Taille, fenetre: Taille, options: OptionsFlottant = {}): PlaceFlottant {
  const { cote = 'bas', alignement = 'debut', ecart = ECART_ANCRE, decalage = 0, marge = MARGE_FENETRE } = options
  const l = Math.min(taille.l, Math.max(0, fenetre.l - 2 * marge))
  const h = Math.min(taille.h, Math.max(0, fenetre.h - 2 * marge))
  const borneL = l < taille.l
  const borneH = h < taille.h
  const colle = (x: number, y: number, effectif: CoteFlottant): PlaceFlottant => ({
    x: borner(x, marge, fenetre.l - marge - l),
    y: borner(y, marge, fenetre.h - marge - h),
    l,
    h,
    cote: effectif,
    borneH,
    borneL,
  })
  if (cote === 'libre') return colle(ancre.x, ancre.y, cote)
  const sur = (debut: number, longueur: number, propre: number) => debut + (alignement === 'debut' ? 0 : alignement === 'centre' ? (longueur - propre) / 2 : longueur - propre) + decalage
  if (cote === 'bas' || cote === 'haut') {
    const x = sur(ancre.x, ancre.l, l)
    const dessous = ancre.y + ancre.h + ecart
    const dessus = ancre.y - ecart - h
    const tientDessous = dessous + h <= fenetre.h - marge
    const tientDessus = dessus >= marge
    if (cote === 'bas') return tientDessous ? colle(x, dessous, 'bas') : tientDessus ? colle(x, dessus, 'haut') : colle(x, dessous, 'bas')
    return tientDessus ? colle(x, dessus, 'haut') : tientDessous ? colle(x, dessous, 'bas') : colle(x, dessus, 'haut')
  }
  const y = sur(ancre.y, ancre.h, h)
  const adroite = ancre.x + ancre.l + ecart
  const agauche = ancre.x - ecart - l
  const tientDroite = adroite + l <= fenetre.l - marge
  const tientGauche = agauche >= marge
  if (cote === 'droite') return tientDroite ? colle(adroite, y, 'droite') : tientGauche ? colle(agauche, y, 'gauche') : colle(adroite, y, 'droite')
  return tientGauche ? colle(agauche, y, 'gauche') : tientDroite ? colle(adroite, y, 'droite') : colle(agauche, y, 'gauche')
}

/**
 * La barre qui flotte au-dessus d'un sujet (capture 20) : centrée sur le sujet (`x`), à 8 px au-dessus de son bord haut
 * (`y`) ; elle ne sort pas de la zone. Si le haut ne laisse pas la place (sous la barre d'outils, hors de la zone), elle
 * passe sous le sujet (`bas`, son bord bas). Sans mesure de la zone (largeur nulle), elle se centre sans se borner ; sa
 * hauteur, quand la zone la donne, l'empêche de sortir par le bas.
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
  const dessous = sujet.bas + ecart
  return { x, y: zone.h > 0 ? Math.max(dessus, Math.min(dessous, zone.h - barre.h - MARGE_FENETRE)) : dessous, dessous: true }
}
