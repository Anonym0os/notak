import type { Id } from '../../../coeur/tableau'
import type { StyleBranche } from '../trace/branches'

/** La taille d'un sujet dessiné, en pixels de carte. */
export interface Taille {
  l: number
  h: number
}

/** Où un sujet se pose : son coin haut gauche et sa taille, en pixels, le centre du central en (0, 0). */
export interface Boite extends Taille {
  x: number
  y: number
}

/** De quel bord d'un sujet partent ses branches, et de quel bord elles arrivent sur ses enfants. */
export type Cote = 'droite' | 'gauche' | 'bas' | 'haut'

/** Une branche à tracer, du parent vers l'enfant, avec la forme que sa structure lui donne. */
export interface Lien {
  de: Id
  vers: Id
  cote: Cote
  /** `arbre` : un tronc sur le bord gauche du parent, un coude vers chaque enfant ; `arbre-g` : sur le bord droit. */
  forme: StyleBranche | 'arbre' | 'arbre-g'
}

/** Un trait propre à une structure (l'arête d'un poisson, l'accolade, la grille d'une matrice), en chemin SVG. */
export interface Trait {
  /** Le sujet dont il part : il prend la couleur de sa branche. */
  de: Id
  d: string
  /** L'accolade d'un résumé : son identifiant (son style est celui du résumé). */
  resume?: Id
}

export interface Disposition {
  boites: Map<Id, Boite>
  liens: Lien[]
  traits: Trait[]
}

/** Les écarts de docs/XMIND.md § 2 : entre un parent et ses enfants, entre deux frères. */
export interface Ecarts {
  principal: number
  secondaire: number
  /** Entre le central et ses principaux ; absent : `ECART_CENTRAL`. */
  central?: number
}

export const ECARTS: Ecarts = { principal: 40, secondaire: 12 }
/** La carte compacte : des branches plus serrées. */
export const ECARTS_COMPACTS: Ecarts = { principal: 28, secondaire: 4, central: 40 }
/** Le central est plus loin de ses principaux que les autres sujets de leurs enfants. */
export const ECART_CENTRAL = 64

/** Le rectangle qui contient toutes les boîtes (vide : un point en 0, 0). */
export function emprise(boites: Iterable<Boite>): Boite {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const b of boites) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.l)
    y1 = Math.max(y1, b.y + b.h)
  }
  return x0 === Infinity ? { x: 0, y: 0, l: 0, h: 0 } : { x: x0, y: y0, l: x1 - x0, h: y1 - y0 }
}
