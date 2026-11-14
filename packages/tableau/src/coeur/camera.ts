/**
 * Ce que la vue montre du tableau : où l'on regarde et à quelle échelle.
 * Le tableau se compte en unités de grille (UG), l'écran en pixels.
 * À l'échelle 1, une UG fait `PX_PAR_UG` pixels.
 */
import { type Point, type Rect, centre as centreRect, hauteur, largeur, point } from './geometrie'
import { type ReglageRessort, ecartRessort } from './ressort'

/**
 * La taille d'une UG à l'échelle 1 : 8, 9 ou 10 pixels, le réglage « Grille » de chacun. Une grille plus serrée
 * resserre positions et largeurs, pas le texte. Lue en direct par tous ceux qui l'importent.
 */
export let PX_PAR_UG = 10
export const TAILLES_GRILLE = [8, 9, 10] as const
export function definirTailleGrille(px: (typeof TAILLES_GRILLE)[number]) {
  PX_PAR_UG = px
}
/** 800 %, comme tldraw : une écriture fine se lit encore, sans que la toile devienne un seul mot. */
export const ECHELLE_MAX = 8
/** Le zoom arrière s'arrête au plus tard ici (2 %, comme Figma), plus bas si le contenu l'exige. */
export const ECHELLE_MIN_PLAFOND = 0.02
/** Les crans du clavier se rangent comme les focales jusqu'ici, puis suivent `CRANS_DESSOUS`. */
const CRANS_FOCALES_MIN = 0.4
/** Marge autour du contenu pour calculer le zoom arrière minimal, en part de la vue. */
const MARGE_ECHELLE_MIN = 0.2
/** Crans du clavier au-dessus de 100 %. */
const CRANS_DESSUS = [1.2, 1.5, 2, 3, 4, 6, 8]
/** Crans du clavier sous les focales, jusqu'au plancher. */
const CRANS_DESSOUS = [0.25, 0.15, 0.1, 0.05, 0.02]
/** Un geste de zoom s'arrête quand plus rien n'arrive pendant ce temps, en millisecondes. */
const FIN_DE_GESTE = 250
/** Ajuster : plafonds selon que le contenu tient ou non à 100 %. */
const AJUSTER_PETIT_MAX = 1.3
const AJUSTER_GRAND_MAX = 0.8
/** Marge autour d'un contenu qui ne tient pas à 100 %, en part du contenu de chaque côté. */
const MARGE_AJUSTER = 0.2
export const DUREE_AJUSTER = 600

export interface Camera {
  /** Le point du tableau au coin haut-gauche de la vue. */
  origine: Point
  echelle: number
}

/** La taille de la vue, en pixels. */
export interface Vue {
  largeur: number
  hauteur: number
}

export const CAMERA_DEPART: Camera = { origine: point(0, 0), echelle: 1 }

const pxParUg = (c: Camera) => PX_PAR_UG * c.echelle
const centreVue = (v: Vue) => point(v.largeur / 2, v.hauteur / 2)

export const versEcran = (c: Camera, p: Point): Point =>
  point((p.x - c.origine.x) * pxParUg(c), (p.y - c.origine.y) * pxParUg(c))

export const versTableau = (c: Camera, p: Point): Point =>
  point(p.x / pxParUg(c) + c.origine.x, p.y / pxParUg(c) + c.origine.y)

/** Fait glisser le contenu d'un décalage d'écran (attraper la toile ; la molette en sens inverse). */
export const defiler = (c: Camera, dx: number, dy: number): Camera => ({
  ...c,
  origine: point(c.origine.x - dx / pxParUg(c), c.origine.y - dy / pxParUg(c)),
})

/** Change d'échelle en gardant immobile le point d'écran `fixe`. */
export function echelleAutour(c: Camera, echelle: number, fixe: Point): Camera {
  const sous = versTableau(c, fixe)
  const k = PX_PAR_UG * echelle
  return { echelle, origine: point(sous.x - fixe.x / k, sous.y - fixe.y / k) }
}

export const centreCamera = (c: Camera, v: Vue) => versTableau(c, centreVue(v))

/** La marge autour du contenu, en UG, pour dire qu'il tient dans la vue (on a dézoomé) et qu'il s'y recentre. */
export const MARGE_DOCUMENT = point(50, 40)

/**
 * Ce que la vue garde du contenu, au plus loin qu'on l'en écarte : un tiers d'elle-même sur chaque axe, ou tout le
 * contenu s'il est plus petit que ce tiers. Le bord du contenu va ainsi jusqu'aux deux tiers de l'écran, dans les
 * quatre sens et à tout zoom : de quoi voir largement au-dessus de la première carte (le haut de l'écran d'un
 * téléphone est sous l'en-tête), sans perdre le contenu de vue.
 */
export const PART_GARDEE = 1 / 3

/** Une vue d'au moins un pixel de côté : en dessous, elle n'est pas affichée ou pas encore mesurée. */
const mesuree = (v: Vue) => v.largeur > 1 && v.hauteur > 1

/** Les origines permises sur un axe, en UG : le contenu va de `min` à `max`, la vue mesure `taille`. */
function zoneAxe(min: number, max: number, taille: number): [number, number] {
  const garde = Math.min(max - min, PART_GARDEE * taille)
  return [min - (taille - garde), max - garde]
}

/**
 * La zone où l'origine de la caméra se promène librement, à son échelle (voir `PART_GARDEE`) ; `null` sur un tableau
 * vide, que rien ne borne.
 */
export function zoneLibre(contenu: Rect | null, v: Vue, echelle: number): Rect | null {
  // Une vue qui n'est pas encore mesurée (cachée, ou au premier rendu) ne borne rien : sa zone serait le contenu même.
  if (!contenu || !mesuree(v)) return null
  const k = PX_PAR_UG * echelle
  const [x0, x1] = zoneAxe(contenu.min.x, contenu.max.x, v.largeur / k)
  const [y0, y1] = zoneAxe(contenu.min.y, contenu.max.y, v.hauteur / k)
  return { min: point(x0, y0), max: point(x1, y1) }
}

/**
 * Où la vue doit revenir. Sur un axe où tout le contenu tient avec ses marges (on a dézoomé), il se recentre, mais
 * seulement si `recentrer` : quand le zoom ou la fenêtre change, jamais parce qu'un élément a bougé (la vue le
 * suivrait). Sinon la vue reste où elle est tant qu'elle est dans sa zone (`zoneLibre`), et revient à son bord au-delà.
 */
export function bornerVue(c: Camera, contenu: Rect | null, v: Vue, recentrer = true): Camera {
  const zone = zoneLibre(contenu, v, c.echelle)
  if (!contenu || !zone) return c
  const k = pxParUg(c)
  const vue = point(v.largeur / k, v.hauteur / k)
  const axe = (o: number, min: number, max: number, marge: number, taille: number, bas: number, haut: number) => {
    if (recentrer && max - min + 2 * marge <= taille) return (min + max) / 2 - taille / 2
    return Math.min(haut, Math.max(bas, o))
  }
  const x = axe(c.origine.x, contenu.min.x, contenu.max.x, MARGE_DOCUMENT.x, vue.x, zone.min.x, zone.max.x)
  const y = axe(c.origine.y, contenu.min.y, contenu.max.y, MARGE_DOCUMENT.y, vue.y, zone.min.y, zone.max.y)
  // Moins d'un demi-pixel à l'écran ne compte pas. Le contenu est mesuré à l'écran : très dézoomé, ses arrondis
  // bougent avec la caméra, et chaque correction en appelait une autre, sans fin.
  const pareil = (a: number, b: number) => Math.abs(a - b) * k < 0.5
  return pareil(x, c.origine.x) && pareil(y, c.origine.y) ? c : { ...c, origine: point(x, y) }
}

/**
 * Au-delà de sa zone, la toile résiste comme une liste d'iOS tirée au-delà de son bord. Pour `x` pixels tirés, elle en
 * suit `(1 − 1 / (x·c/d + 1))·d`, où `d` est la taille de la vue sur cet axe et `c` vaut 0,55 : la formule et la
 * constante relevées sur UIScrollView. Elle suit presque le doigt au début, de moins en moins ensuite, et ne s'écarte
 * jamais d'une vue entière.
 */
const ELASTICITE = 0.55
export const tension = (x: number, d: number): number => (1 - 1 / ((x * ELASTICITE) / d + 1)) * d
/**
 * L'inverse : ce qu'il a fallu tirer pour que la toile soit à `y` pixels au-delà. Un écart d'une vue ou plus (posé
 * d'ailleurs que par la résistance) se lit comme un peu moins, pour rester fini.
 */
export const traction = (y: number, d: number): number => {
  const e = Math.min(y, d * 0.99)
  return (d * e) / (ELASTICITE * (d - e))
}

const tendreAxe = (o: number, bas: number, haut: number, k: number, d: number) =>
  o < bas ? bas - tension((bas - o) * k, d) / k : o > haut ? haut + tension((o - haut) * k, d) / k : o
const detendreAxe = (o: number, bas: number, haut: number, k: number, d: number) =>
  o < bas ? bas - traction((bas - o) * k, d) / k : o > haut ? haut + traction((o - haut) * k, d) / k : o

function parAxe(c: Camera, contenu: Rect | null, v: Vue, f: typeof tendreAxe): Camera {
  const z = zoneLibre(contenu, v, c.echelle)
  if (!z) return c
  const k = pxParUg(c)
  const x = f(c.origine.x, z.min.x, z.max.x, k, v.largeur)
  const y = f(c.origine.y, z.min.y, z.max.y, k, v.hauteur)
  return x === c.origine.x && y === c.origine.y ? c : { ...c, origine: point(x, y) }
}

/** La caméra montrée quand un geste la tire jusqu'à `tiree` : telle quelle dans sa zone, retenue au-delà. */
export const tendre = (tiree: Camera, contenu: Rect | null, v: Vue): Camera => parAxe(tiree, contenu, v, tendreAxe)

/** L'inverse de `tendre` : jusqu'où il faudrait avoir tiré pour que la toile se montre en `montree`. */
export const detendre = (montree: Camera, contenu: Rect | null, v: Vue): Camera => parAxe(montree, contenu, v, detendreAxe)

/**
 * Défile d'un pas de molette ou de pavé tactile, en résistant au-delà de la zone : chaque pas qui s'en éloigne porte
 * moins loin que le précédent, et un pas qui y revient retrouve la même courbe.
 */
export const defilerTendu = (c: Camera, dx: number, dy: number, contenu: Rect | null, v: Vue): Camera =>
  tendre(defiler(detendre(c, contenu, v), dx, dy), contenu, v)

/** L'écart au bord de la zone fond de moitié en 85 ms environ, entre deux pas de molette rapprochés. */
const RAPPEL_MS = 120

/**
 * Pendant qu'une molette ou un pavé tactile pousse la toile au-delà de sa zone, elle y revient aussi entre deux pas
 * (`dt` millisecondes après le précédent). La molette ne dit pas quand les doigts quittent le pavé : son élan envoie
 * encore des pas, de plus en plus petits, pendant une seconde. Sans ce rappel, il étirerait la toile loin au-delà de
 * son bord ; avec lui, elle y rebondit, d'autant plus loin qu'on l'a lancée vite.
 */
export function rappeler(c: Camera, contenu: Rect | null, v: Vue, dt: number): Camera {
  if (dt <= 0) return c
  const bord = bornerVue(c, contenu, v, false)
  if (bord === c) return c
  const k = Math.exp(-dt / RAPPEL_MS)
  const vers = (a: number, b: number) => b + (a - b) * k
  return { ...c, origine: point(vers(c.origine.x, bord.origine.x), vers(c.origine.y, bord.origine.y)) }
}

/**
 * Le retour dans la zone, une fois la toile lâchée au-delà : un ressort amorti juste ce qu'il faut, qui part en douceur
 * et se pose sans rebondir, en une demi-seconde environ, comme une liste d'iOS qu'on lâche (raideur 196, amortissement
 * critique). Il s'arrête à moins d'un demi-pixel.
 */
export const RESSORT_RETOUR: ReglageRessort = { raideur: 196, amortissement: 28, masse: 1, precision: 0.5 }

/** La caméra du retour de `depart` vers `cible` (même échelle), `t` millisecondes après le lâcher. */
export function revenir(depart: Camera, cible: Camera, t: number): { camera: Camera; fini: boolean } {
  const reste = ecartRessort(RESSORT_RETOUR, 1, Math.max(0, t) / 1000)
  const [dx, dy] = [depart.origine.x - cible.origine.x, depart.origine.y - cible.origine.y]
  if (Math.hypot(dx, dy) * pxParUg(cible) * Math.abs(reste) < RESSORT_RETOUR.precision) return { camera: cible, fini: true }
  return { camera: { echelle: cible.echelle, origine: point(cible.origine.x + dx * reste, cible.origine.y + dy * reste) }, fini: false }
}

export function centree(centre: Point, echelle: number, v: Vue): Camera {
  const k = PX_PAR_UG * echelle
  return { echelle, origine: point(centre.x - v.largeur / 2 / k, centre.y - v.hauteur / 2 / k) }
}

/**
 * L'échelle la plus basse permise : celle où tout le contenu tient, marge comprise,
 * sans dépasser `ECHELLE_MIN_PLAFOND`.
 */
export function echelleMin(contenu: Rect | null, v: Vue): number {
  if (!contenu) return ECHELLE_MIN_PLAFOND
  const utile = 1 - 2 * MARGE_ECHELLE_MIN
  const tient = Math.min(
    (v.largeur * utile) / (largeur(contenu) * PX_PAR_UG),
    (v.hauteur * utile) / (hauteur(contenu) * PX_PAR_UG),
  )
  return Math.min(tient, ECHELLE_MIN_PLAFOND)
}

/**
 * Un geste de zoom ne franchit pas 100 % : il faut s'arrêter puis recommencer.
 * L'inertie d'un trackpad ne traverse donc pas 100 % par accident.
 */
export class GesteZoom {
  private cote: 'dessous' | 'dessus' | null = null
  private dernier = -Infinity

  /** La nouvelle échelle après un pas de zoom de `facteur`, reçu à l'instant `maintenant` (ms). */
  appliquer(echelle: number, facteur: number, min: number, maintenant: number): number {
    if (maintenant - this.dernier > FIN_DE_GESTE) this.cote = null
    this.dernier = maintenant
    this.cote ??= echelle < 1 - 1e-6 ? 'dessous' : echelle > 1 + 1e-6 || facteur > 1 ? 'dessus' : 'dessous'
    const voulue = echelle * facteur
    return this.cote === 'dessous'
      ? Math.max(Math.min(min, 1), Math.min(1, voulue))
      : Math.max(1, Math.min(ECHELLE_MAX, voulue))
  }
}

/**
 * Le point d'écran qui reste immobile pendant un zoom : le curseur au-dessus de 100 %,
 * le centre de la vue en dessous.
 */
export const pointFixe = (nouvelle: number, curseur: Point, v: Vue): Point => (nouvelle > 1 ? curseur : centreVue(v))

/**
 * Les crans du clavier : quatre entre 40 % (ou l'échelle minimale, si elle est plus haute) et 100 %, rangés comme les
 * focales d'un objectif (`F / (F + k)`, où `F` met le quatrième cran en bas) — serrés près de 100 %, plus espacés en
 * bas. Sous 40 %, ils descendent par `CRANS_DESSOUS` jusqu'à l'échelle minimale.
 */
function crans(min: number): number[] {
  const bas = Math.max(min, CRANS_FOCALES_MIN)
  const f = (4 * bas) / (1 - bas)
  const focales = bas < 1 ? [4, 3, 2, 1].map((k) => f / (f + k)) : []
  const loin = min < bas - 1e-3 ? [...CRANS_DESSOUS.filter((c) => c > min + 1e-3).reverse(), min] : []
  return [...loin.sort((a, b) => a - b), ...focales, 1, ...CRANS_DESSUS]
}

/** Le cran du clavier juste au-dessus de l'échelle actuelle. */
export const cranDessus = (echelle: number, min: number) => crans(min).find((c) => c > echelle + 1e-3) ?? ECHELLE_MAX

/** Le cran du clavier juste au-dessous de l'échelle actuelle. */
export const cranDessous = (echelle: number, min: number) =>
  crans(min).findLast((c) => c < echelle - 1e-3) ?? min

/** La caméra qui cadre tout le contenu. `null` sur un tableau vide. */
export function ajuster(contenu: Rect | null, v: Vue): Camera | null {
  if (!contenu) return null
  const [l, h] = [largeur(contenu) * PX_PAR_UG, hauteur(contenu) * PX_PAR_UG]
  const tient = Math.min(v.largeur / l, v.hauteur / h)
  // Ce qui tient à 100 % se grossit sans marge ; le reste se réduit avec un cinquième de vide de chaque côté.
  const echelle =
    tient > 1 ? Math.min(tient, AJUSTER_PETIT_MAX) : Math.max(0.01, Math.min(tient / (1 + 2 * MARGE_AJUSTER), AJUSTER_GRAND_MAX))
  return centree(centreRect(contenu), echelle, v)
}

/** Le cadrage d'un aperçu : tout le contenu tient dans la vue, sans jamais grossir au-delà de 100 %. */
export function cadrage(contenu: Rect | null, v: Vue): Camera | null {
  const cible = ajuster(contenu, v)
  return cible && cible.echelle > 1 ? centree(centreRect(contenu!), 1, v) : cible
}

/** L'air laissé entre les barres et le contenu d'une toile qu'on découvre, en pixels. */
export const AIR_ARRIVEE = 24

/**
 * La vue d'arrivée sur une toile jamais vue ici, à 100 % : ce qu'elle porte au milieu de la place que les barres
 * laissent libre (`degagement` : ce qu'elles couvrent en haut et à gauche, en pixels), s'il y tient ; sinon son coin
 * en haut à gauche juste après elles, comme une page qu'on commence à lire.
 */
export function arrivee(contenu: Rect, v: Vue, degagement: { haut: number; gauche: number }): Camera {
  const reste = (min: number, max: number, debut: number, fin: number) => fin - debut - 2 * AIR_ARRIVEE - (max - min) * PX_PAR_UG
  const [rx, ry] = [reste(contenu.min.x, contenu.max.x, degagement.gauche, v.largeur), reste(contenu.min.y, contenu.max.y, degagement.haut, v.hauteur)]
  const tient = rx >= 0 && ry >= 0
  const axe = (min: number, debut: number, r: number) => min - (debut + AIR_ARRIVEE + (tient ? r / 2 : 0)) / PX_PAR_UG
  return { echelle: 1, origine: point(axe(contenu.min.x, degagement.gauche, rx), axe(contenu.min.y, degagement.haut, ry)) }
}

/**
 * Ajuster ramène à 100 % plutôt qu'à l'échelle ajustée quand on y est déjà, ou quand elle irait dans le même
 * sens que le zoom actuel sans franchir 100 % (on est dézoomé et elle dézoomerait moins, par exemple).
 */
export function revenirA100(actuelle: number, ajustee: number): boolean {
  if (Math.abs(actuelle - ajustee) < Math.min(0.01, ajustee * 0.1)) return true
  if (actuelle < 1 && actuelle < ajustee && ajustee < 1) return true
  return actuelle > 1 && actuelle > ajustee && ajustee > 1
}

/** Courbe d'accélération de Bézier (0,645 ; 0,045 ; 0,355 ; 1), pour `t` entre 0 et 1. */
export function adoucir(t: number): number {
  const bezier = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  const u = Math.max(0, Math.min(1, t))
  let [bas, haut] = [0, 1]
  for (let i = 0; i < 40; i++) {
    const milieu = (bas + haut) / 2
    if (bezier(0.645, 0.355, milieu) < u) bas = milieu
    else haut = milieu
  }
  return bezier(0.045, 1, (bas + haut) / 2)
}

/** La caméra d'un passage animé de `depart` à `cible`, au temps `t` (ms depuis le début). */
export function animer(depart: Camera, cible: Camera, t: number, v: Vue): { camera: Camera; fini: boolean } {
  if (t >= DUREE_AJUSTER) return { camera: cible, fini: true }
  const k = adoucir(t / DUREE_AJUSTER)
  const [c0, c1] = [centreCamera(depart, v), centreCamera(cible, v)]
  const echelle = depart.echelle * (cible.echelle / depart.echelle) ** k
  return { camera: centree(point(c0.x + (c1.x - c0.x) * k, c0.y + (c1.y - c0.y) * k), echelle, v), fini: false }
}

/**
 * La place à l'écran d'un point de la toile, en CSS : elle se calcule sur la caméra que la toile publie
 * (`--notak-cam-*`), si bien qu'un repère posé ainsi suit un geste au doigt image par image, sans rendu React.
 */
export const surLaToile = (p: Point): { left: string; top: string } => ({
  left: `calc((${p.x} - var(--notak-cam-ox)) * var(--notak-cam-k) * 1px)`,
  top: `calc((${p.y} - var(--notak-cam-oy)) * var(--notak-cam-k) * 1px)`,
})
