import type { Rect } from '../../coeur/geometrie'
import type { Element, Id, Image, Recadrage } from '../../coeur/tableau'

/** Les formats acceptés, et la taille maximale d'un fichier. */
export const TYPES_ACCEPTES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
export const TAILLE_MAX = 25 * 1024 * 1024

const LARGEUR_MAX_UG = 34
const LARGEUR_MIN_UG = 4
/** La largeur naturelle ne dépasse pas 1600 px. */
const LARGEUR_NATURELLE_MAX_PX = 1600
const LARGEUR_COLONNE = 36
const ECART = 2
const PX_PAR_UG = 10

export interface TailleUG {
  largeur: number
  hauteur: number
}

/** La largeur d'une image neuve, en UG : sa taille en pixels sur dix, entre 4 et 34. */
export const largeurInitiale = (largeurOrigine: number) =>
  Math.max(LARGEUR_MIN_UG, Math.min(Math.round(largeurOrigine / PX_PAR_UG), LARGEUR_MAX_UG))

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

/** La hauteur d'une image posée sur la toile, en UG entières : ses bords tombent sur la grille. */
export const hauteurCalee = (largeur: number, proportions: number) => Math.max(1, Math.round(largeur / proportions))

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
  const { legende: _, recadrage: _r, rotation: _o, tailles: _t, ...propre } = nouveau
  return { ...propre, fichier, ...(legende ? { legende } : {}) }
}

type Rotation = NonNullable<Image['rotation']>

export const rotationDe = (c: Pick<Image, 'rotation'>): Rotation => c.rotation ?? 0

/** Un quart de tour de plus dans le sens des aiguilles d'une montre ; revenu à zéro, la clé disparaît. */
export function pivoter(c: Image): Image {
  const { rotation: _, ...reste } = c
  const suivante = ((rotationDe(c) + 90) % 360) as Rotation
  return suivante === 0 ? reste : { ...reste, rotation: suivante }
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
 * Où poser le plan et l'image dans la boîte, en unités de conteneur (`cqw`, `cqh`) pour que le quart de tour
 * échange sans mesure les deux côtés. Le recadrage est en fractions de l'image d'origine.
 */
export function miseEnPage(c: Image, plein = false): MiseEnPage {
  const rot = rotationDe(c)
  const r: Recadrage = (!plein && c.recadrage) || { x: 0, y: 0, largeur: 1, hauteur: 1 }
  const plan = couche(rot)
    ? { width: '100cqh', height: '100cqw' }
    : { width: '100cqw', height: '100cqh' }
  return {
    plan: { ...plan, ...(rot ? { transform: `translate(-50%, -50%) rotate(${rot}deg)` } : { transform: 'translate(-50%, -50%)' }) },
    image: { width: pct(1 / r.largeur), height: pct(1 / r.hauteur), left: pct(-r.x / r.largeur), top: pct(-r.y / r.hauteur) },
  }
}
