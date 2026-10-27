/**
 * Ce que la vue montre du tableau : où l'on regarde et à quelle échelle.
 * Le tableau se compte en unités de grille (UG), l'écran en pixels.
 * À l'échelle 1, une UG fait `PX_PAR_UG` pixels.
 */
import { type Point, type Rect, centre as centreRect, hauteur, largeur, point } from './geometrie'

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

/** La marge laissée autour du contenu, en UG : la vue ne remonte pas au-delà, à gauche ni en haut. */
export const MARGE_DOCUMENT = point(50, 40)

/**
 * Le tableau est un document borné en haut et à gauche : la vue n'y remonte pas plus loin que le contenu, marge
 * comprise. Sur un axe où tout le contenu tient avec ses marges (on a dézoomé), il se recentre, mais seulement si
 * `recentrer` : quand le zoom ou la fenêtre change, jamais parce qu'un élément a bougé (la vue le suivrait).
 */
export function bornerVue(c: Camera, contenu: Rect | null, v: Vue, recentrer = true): Camera {
  if (!contenu) return c
  const k = pxParUg(c)
  const vue = point(v.largeur / k, v.hauteur / k)
  const axe = (o: number, min: number, max: number, marge: number, taille: number) => {
    if (max - min + 2 * marge <= taille) return recentrer ? (min + max) / 2 - taille / 2 : o
    return Math.max(o, min - marge)
  }
  const x = axe(c.origine.x, contenu.min.x, contenu.max.x, MARGE_DOCUMENT.x, vue.x)
  const y = axe(c.origine.y, contenu.min.y, contenu.max.y, MARGE_DOCUMENT.y, vue.y)
  // Moins d'un demi-pixel à l'écran ne compte pas. Le contenu est mesuré à l'écran : très dézoomé, ses arrondis
  // bougent avec la caméra, et chaque correction en appelait une autre, sans fin.
  const pareil = (a: number, b: number) => Math.abs(a - b) * k < 0.5
  return pareil(x, c.origine.x) && pareil(y, c.origine.y) ? c : { ...c, origine: point(x, y) }
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
