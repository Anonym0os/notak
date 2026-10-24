/**
 * Où s'accroche un menu (docs/NOTION.md § 2.1, § 2.6, § 3.1) : des rectangles d'écran pris une fois, à l'ouverture, et
 * de quoi les suivre quand la page défile sans les relire à la frappe. Des fonctions pures, sauf `defilement`.
 */

export interface Boite {
  left: number
  top: number
  right: number
  bottom: number
}

/** Le bord gauche du menu « / » tombe 2 px avant la barre oblique (mesuré), son haut sous le curseur (écart 12 px). */
export const DECALAGE_SLASH = -2
export const ECART_SLASH = 12
/** L'écart entre le menu du bloc et sa poignée, mesuré : 5 px ; la poignée occupe 18 px, à 28 px du bord du bloc. */
export const ECART_POIGNEE = 5
export const POIGNEE = { gauche: 28, largeur: 18, hauteur: 24 }

/** La cible du menu « / » : à gauche, la barre oblique ; en hauteur, la ligne du curseur juste derrière elle. */
export function ancreSlash(barre: Boite, curseur: Boite): Boite {
  const gauche = barre.left + DECALAGE_SLASH
  return { left: gauche, right: gauche + 1, top: curseur.top, bottom: curseur.bottom }
}

/** La cible du menu du bloc : la poignée de saisie, centrée sur la première ligne (haut et bas de la ligne). */
export function ancreBloc(blocGauche: number, ligne: { top: number; bottom: number }): Boite {
  const milieu = (ligne.top + ligne.bottom) / 2
  const gauche = blocGauche - POIGNEE.gauche
  return { left: gauche, right: gauche + POIGNEE.largeur, top: milieu - POIGNEE.hauteur / 2, bottom: milieu + POIGNEE.hauteur / 2 }
}

/** De combien la page a défilé depuis que l'ancre a été prise : ce qu'il faut retirer de ses coordonnées. */
export interface Defilement {
  x: number
  y: number
}

export interface AncreFigee {
  /** Ce à quoi le menu s'est accroché à l'ouverture, avec la clé qui l'identifie (la position du `/`). */
  cle: number
  boite: Boite
  /** Le défilement de la page au moment de la mesure. */
  defil: Defilement
}

/**
 * Garde l'ancre tant que la clé ne change pas : `mesurer` n'est appelé qu'à l'ouverture, pas à chaque frappe, de sorte
 * que le menu ne suit pas le curseur. Rend `null` si la mesure échoue (elle sera retentée).
 */
export function garderAncre(avant: AncreFigee | null, cle: number, mesurer: () => Boite | null, lireDefilement: () => Defilement = () => ({ x: 0, y: 0 })): AncreFigee | null {
  if (avant && avant.cle === cle) return avant
  const boite = mesurer()
  return boite ? { cle, boite, defil: lireDefilement() } : null
}

export const decaler = (b: Boite, dx: number, dy: number): Boite => ({ left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy })

/** Le défilement cumulé de la fenêtre et de tous les ancêtres de `noeud` qui défilent. */
export function defilement(noeud: Element | null): Defilement {
  let x = 0
  let y = 0
  for (let n: Element | null = noeud; n; n = n.parentElement) {
    x += n.scrollLeft
    y += n.scrollTop
  }
  return { x: x + (typeof window === 'undefined' ? 0 : window.scrollX), y: y + (typeof window === 'undefined' ? 0 : window.scrollY) }
}

/** L'ancre telle qu'elle est maintenant : décalée de ce dont la page a défilé depuis la mesure. */
export const suivreDefilement = (b: Boite, avant: Defilement, maintenant: Defilement): Boite => decaler(b, avant.x - maintenant.x, avant.y - maintenant.y)

/** Le pointeur est-il dans le triangle (départ, coin haut du sous-menu, coin bas) ? Il va alors vers lui : on n'ouvre pas la ligne qu'il traverse. */
export function dansTriangle(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): boolean {
  const signe = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
  const d1 = signe(p, a, b)
  const d2 = signe(p, b, c)
  const d3 = signe(p, c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
