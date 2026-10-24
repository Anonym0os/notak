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

/**
 * Les écarts de docs/XMIND.md § 2 : entre un parent et ses enfants (l'espacement « majeur »), entre deux frères
 * (« mineur »). Chez Xmind, c'est la classe du parent qui les commande.
 */
export interface Ecarts {
  /** Majeur d'un parent qui n'est pas le central (un principal, un sous-sujet). */
  principal: number
  /** Mineur d'un sous-sujet, et ce que les autres structures (organigramme, arbre, arête) en font. */
  secondaire: number
  /** Majeur du central : entre lui et ses principaux ; absent : `ECART_CENTRAL`. */
  central?: number
  /** Mineur du central (entre ses principaux) et d'un principal (entre ses enfants) ; absent : `secondaire`. */
  mineurs?: { central?: number; principal?: number }
}

/** Les écarts d'une carte aux branches en coude (le thème par défaut) : 50 et 35 du central, 26 et 6 d'un principal, 26 et 8 d'un sous-sujet. */
export const ECARTS: Ecarts = { principal: 26, secondaire: 8, central: 50, mineurs: { central: 35, principal: 6 } }
/** La carte compacte : des branches plus serrées. */
export const ECARTS_COMPACTS: Ecarts = { principal: 22, secondaire: 5, central: 28, mineurs: { central: 10, principal: 5 } }
/** Le central est plus loin de ses principaux que les autres sujets de leurs enfants. */
export const ECART_CENTRAL = 50

/**
 * Les écarts d'une carte selon la forme de ses branches : un coude (ou un coude arrondi) garde le majeur de base ; la
 * courbe, la droite, l'anse et le pli le doublent, hors du central, dont l'écart ne change pas.
 */
export function ecartsDe(forme: StyleBranche | undefined, compacte = false): Ecarts {
  const base = compacte ? ECARTS_COMPACTS : ECARTS
  return forme === 'coudee' || forme === 'coudee-arrondie' || forme === undefined ? base : { ...base, principal: base.principal * 2 }
}

/** L'écart mineur entre les enfants d'un sujet du rang `rang` : celui du central, d'un principal, ou d'un sous-sujet. */
export function mineurDe(e: Ecarts, rang: 'central' | 'principal' | 'sous'): number {
  return (rang === 'sous' ? undefined : e.mineurs?.[rang]) ?? e.secondaire
}

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
