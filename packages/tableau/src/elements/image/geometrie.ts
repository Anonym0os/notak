import type { Rect } from '../../coeur/geometrie'
import type { Element, Id, Image, Recadrage } from '../../coeur/tableau'

/** Les formats acceptés, et la taille maximale d'un fichier. */
export const TYPES_ACCEPTES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
export const TAILLE_MAX = 25 * 1024 * 1024

const LARGEUR_MAX_UG = 34
/** La largeur naturelle ne dépasse pas 1600 px. */
const LARGEUR_NATURELLE_MAX_PX = 1600
export const LARGEUR_COLONNE = 36
const ECART = 2
const PX_PAR_UG = 10

export interface TailleUG {
  largeur: number
  hauteur: number
}

/**
 * La largeur d'une image neuve, en UG : sa taille en pixels sur dix, au plus 34. Milanote ne fixe aucun plancher à la
 * création (les 4 UG ne jouent qu'au redimensionnement) : une vignette de 20 px naît petite.
 */
export const largeurInitiale = (largeurOrigine: number) => Math.max(1, Math.min(Math.round(largeurOrigine / PX_PAR_UG), LARGEUR_MAX_UG))

/** La largeur « naturelle » : la taille d'origine, au plus 1600 px. */
export const largeurNaturelleImage = (c: Image) => Math.min(c.largeurOrigine, LARGEUR_NATURELLE_MAX_PX) / PX_PAR_UG

/** La hauteur qui garde les proportions d'origine, en UG. */
export const hauteurPour = (largeur: number, c: Pick<Image, 'largeurOrigine' | 'hauteurOrigine'>) =>
  (largeur * c.hauteurOrigine) / c.largeurOrigine

/**
 * Une image transparente (un détourage) n'a pas d'ombre : l'ombre dessinerait son rectangle. Ce qu'on a lu dans
 * les pixels l'emporte ; sans lecture, on devine au type du fichier (PNG, GIF et SVG passent pour transparents).
 */
export const aUneOmbre = (typeMime: string | undefined, transparente?: boolean) =>
  transparente !== undefined ? !transparente : typeMime !== 'image/png' && typeMime !== 'image/gif' && typeMime !== 'image/svg+xml'

/**
 * Cette image a-t-elle sa carte blanche (fond et ombre) ? Une image transparente non : sauf si l'outil « Transparent »
 * lui a rendu son fond.
 */
export const aUneCarte = (c: Pick<Image, 'typeMime' | 'transparente' | 'fondBlanc'>) => !!c.fondBlanc || aUneOmbre(c.typeMime, c.transparente)

/** Le retrait de la carte sur la toile, en pixels : la bordure de sélection de Milanote est à l'extérieur, la carte fait 2 px de moins. */
export const RETRAIT_PX = 2

/** La hauteur d'une image posée sur la toile, en UG entières : ses bords tombent sur la grille. */
export const hauteurCalee = (largeur: number, proportions: number) => Math.max(1, Math.round(largeur / proportions))

/**
 * La hauteur de la carte sur la toile, en pixels : l'image est rognée pour tomber sur la grille (moins le retrait),
 * ou garde ses proportions exactes si on l'a demandé (la hauteur suit alors la largeur de la carte).
 */
export function hauteurCartePx(largeurUG: number, proportions: number, exactes: boolean | undefined): number {
  if (exactes) return Math.max(1, ((largeurUG * PX_PAR_UG - RETRAIT_PX) / proportions))
  return hauteurCalee(largeurUG, proportions) * PX_PAR_UG - RETRAIT_PX
}

/**
 * Largeur sur hauteur du cadre de l'image : celui qu'un redimensionnement avec Cmd a fixé (`rapportCadre`, l'image
 * le recouvre), sinon les proportions de l'image montrée.
 */
export const rapportDuCadre = (c: Image): number => c.rapportCadre ?? proportionsAffichees(c)

/** Les côtés que le cadrage libre ne descend pas sous (en UG), comme Milanote : 4 × 4. */
export const COTE_CADRAGE_MIN = 4

/**
 * Le cadrage libre (Cmd + poignée) : la hauteur du cadre en UG pour cette largeur, le contenu qui fixe un cadre de
 * `largeur` × `hauteur` UG, et le contenu qui retrouve les proportions de l'image (double-clic sur la poignée).
 */
export const cadrageLibre = {
  hauteur: (c: Image, largeur: number) => hauteurCalee(largeur, rapportDuCadre(c)),
  avec: (c: Image, largeur: number, hauteur: number): Image => {
    const h = Math.max(COTE_CADRAGE_MIN, Math.round(hauteur))
    return { ...c, rapportCadre: +(Math.max(COTE_CADRAGE_MIN, largeur) / h).toFixed(4) }
  },
  retire: (c: Image): Image | null => {
    if (c.rapportCadre === undefined) return null
    const { rapportCadre: _, ...reste } = c
    return reste
  },
}

export const nombreColonnes = (largeurVuePx: number) => Math.max(3, Math.floor(largeurVuePx / 360))

/**
 * Où poser des images reçues ensemble, en UG. Une seule : au point de dépôt, décalée d'une UG vers le
 * haut et la gauche. Plusieurs : en colonnes de 36 UG, chacune dans la colonne la moins haute.
 */
export function placerImages(tailles: TailleUG[], ou: { x: number; y: number }, colonnes: number): [number, number][] {
  if (tailles.length === 1) return [[Math.round(ou.x) - 1, Math.round(ou.y) - 1]]
  const hauteurs = new Array<number>(Math.max(1, colonnes)).fill(0)
  return tailles.map((t) => {
    const col = hauteurs.indexOf(Math.min(...hauteurs))
    const position: [number, number] = [Math.round(ou.x) + col * LARGEUR_COLONNE, Math.round(ou.y) + hauteurs[col]!]
    hauteurs[col] = hauteurs[col]! + Math.ceil(t.hauteur) + ECART
    return position
  })
}

/** Le contenu avec sa légende, ou sans la clé si elle est vide. */
export function avecLegende(c: Image, texte: string): Image {
  const { legende: _, ...reste } = c
  const propre = texte.replace(/\s+/g, ' ').trim()
  return propre ? { ...reste, legende: propre } : reste
}

/**
 * L'image qu'un dépôt a visée : la plus haute dans l'empilement dont le rectangle contient le point.
 * Une image à la corbeille ou verrouillée ne se remplace pas.
 */
export function imageSous(elements: readonly Element[], rect: (id: Id) => Rect | null, ou: { x: number; y: number }): Element<Image> | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i]!
    if (e.contenu.type !== 'image' || e.corbeille !== undefined || e.verrou) continue
    const r = rect(e.id)
    if (r && ou.x >= r.min.x && ou.x <= r.max.x && ou.y >= r.min.y && ou.y <= r.max.y) return e as Element<Image>
  }
  return null
}

/**
 * L'image qui en prend une autre : le nouveau fichier et ses dimensions, la légende de l'ancienne.
 * Le recadrage et la rotation étaient faits pour l'ancienne image : ils ne la suivent pas.
 */
export function remplacerContenu(ancien: Image, nouveau: Omit<Image, 'fichier'>, fichier: Id): Image {
  const { legende } = ancien
  const { legende: _, recadrage: _r, rotation: _o, tailles: _t, traits: _tr, ...propre } = nouveau
  return { ...propre, fichier, ...(legende ? { legende } : {}) }
}

type Rotation = NonNullable<Image['rotation']>

export const rotationDe = (c: Pick<Image, 'rotation'>): Rotation => c.rotation ?? 0

/** Un quart de tour de plus vers la gauche (« Rotate left » de Milanote) ; revenu à zéro, la clé disparaît. */
export function pivoter(c: Image): Image {
  const { rotation: _, ...reste } = c
  const suivante = ((rotationDe(c) + 270) % 360) as Rotation
  return suivante === 0 ? reste : { ...reste, rotation: suivante }
}

/** Le miroir demandé, à l'écran : un second appel le défait. La clé disparaît quand il n'y en a plus. */
export function basculerMiroir(c: Image, axe: 'h' | 'v'): Image {
  const cle = axe === 'h' ? 'miroirH' : 'miroirV'
  const { [cle]: actif, ...reste } = c
  return actif ? reste : { ...reste, [cle]: true }
}

const couche = (r: Rotation) => r === 90 || r === 270

/**
 * Largeur sur hauteur de l'image montrée : la partie gardée par le recadrage, puis le quart de tour.
 * `plein` : sans recadrage, pour le montrer en entier le temps de le régler.
 */
export function proportionsAffichees(c: Image, plein = false): number {
  const r = plein ? undefined : c.recadrage
  const p = (c.largeurOrigine * (r?.largeur ?? 1)) / (c.hauteurOrigine * (r?.hauteur ?? 1))
  return couche(rotationDe(c)) ? 1 / p : p
}

export interface MiseEnPage {
  /** Le plan de l'image avant rotation : il tourne autour du centre de la boîte. */
  plan: { width: string; height: string; transform?: string }
  /** L'image dans son plan : entière, ou décalée pour que seule la partie gardée apparaisse. */
  image: { width: string; height: string; left: string; top: string }
}

const pct = (v: number) => `${+(v * 100).toFixed(4)}%`

/**
 * Un point de la boîte (fractions de sa largeur et de sa hauteur) vers le plan de l'image montrée : le plan
 * recouvre la boîte (l'image est rognée, jamais étirée), il la déborde donc d'un côté.
 */
export function versPlan(fx: number, fy: number, ratioBoite: number, proportions: number): [number, number] {
  if (ratioBoite < proportions) return [(fx - 0.5) * (ratioBoite / proportions) + 0.5, fy]
  return [fx, (fy - 0.5) * (proportions / ratioBoite) + 0.5]
}

/**
 * Où poser le plan et l'image dans la boîte, en unités de conteneur (`cqw`, `cqh`) pour que le quart de tour
 * échange sans mesure les deux côtés. Le recadrage est en fractions de l'image d'origine.
 */
export function miseEnPage(c: Image, plein = false): MiseEnPage {
  const rot = rotationDe(c)
  const r: Recadrage = (!plein && c.recadrage) || { x: 0, y: 0, largeur: 1, hauteur: 1 }
  // Le plan recouvre la boîte à ses proportions (comme `object-fit: cover`) : ce qui dépasse est coupé, rien n'est étiré.
  const p = +proportionsAffichees(c, plein).toFixed(6)
  const montree = { width: `max(100cqw, calc(100cqh * ${p}))`, height: `max(100cqh, calc(100cqw / ${p}))` }
  const plan = couche(rot) ? { width: montree.height, height: montree.width } : montree
  // Les miroirs sont ceux de l'écran : ils s'appliquent au plan déjà tourné, autour de son centre.
  const miroir = c.miroirH || c.miroirV ? ` scale(${c.miroirH ? -1 : 1}, ${c.miroirV ? -1 : 1})` : ''
  return {
    plan: { ...plan, transform: `translate(-50%, -50%)${miroir}${rot ? ` rotate(${rot}deg)` : ''}` },
    image: { width: pct(1 / r.largeur), height: pct(1 / r.hauteur), left: pct(-r.x / r.largeur), top: pct(-r.y / r.hauteur) },
  }
}
