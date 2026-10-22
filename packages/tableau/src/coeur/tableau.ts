import { type Point, point } from './geometrie'

export type Id = string

/** Largeur par défaut d'une note, en unités de grille. */
export const LARGEUR_NOTE = 34
/** Hauteur d'une note vide, en unités de grille. */
export const HAUTEUR_NOTE_MIN = 8
/** Une position ne s'éloigne jamais plus de ça de l'origine. */
export const POSITION_MAX = 15_000

/**
 * Un nœud de texte riche, au format JSON de Tiptap (ProseMirror) :
 * `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '…' }] }] }`.
 */
export interface NoeudTexte {
  type: string
  attrs?: Record<string, unknown>
  content?: NoeudTexte[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

/** La couleur d'une note, par son nom : les valeurs affichées dépendent du thème. */
export type CouleurNote =
  | 'gris'
  | 'cyan'
  | 'vert'
  | 'brun'
  | 'jaune'
  | 'orange'
  | 'rouge'
  | 'rose'
  | 'violet'
  | 'bleu'
  | 'bleu_nuit'
  | 'transparent'

/** `titre` : posé sur la toile, sans fond, texte centré. */
export type VarianteNote = 'normale' | 'titre'

export interface Note {
  type: 'note'
  texte: NoeudTexte
  couleur?: CouleurNote
  variante?: VarianteNote
}

export type Contenu = Note

export interface Element {
  id: Id
  /** Coin haut-gauche, en unités de grille entières. */
  x: number
  y: number
  largeur: number
  contenu: Contenu
}

/** Un tableau : ses éléments, du plus bas au plus haut dans l'empilement. */
export interface Tableau {
  titre: string
  elements: Element[]
}

/** Un geste élémentaire. Chacun a son inverse, ce qui fait l'historique. */
export type Operation =
  | { type: 'creer'; element: Element }
  | { type: 'supprimer'; element: Element }
  | { type: 'deplacer'; id: Id; de: [number, number]; vers: [number, number] }
  | { type: 'contenu'; id: Id; avant: Contenu; apres: Contenu }

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Un identifiant triable par date de création (ULID). */
export function nouvelId(maintenant = Date.now()): Id {
  let temps = ''
  for (let t = maintenant, i = 0; i < 10; i++, t = Math.floor(t / 32)) temps = BASE32[t % 32] + temps
  const hasard = crypto.getRandomValues(new Uint8Array(16))
  return temps + Array.from(hasard, (o) => BASE32[o % 32]).join('')
}

export const borner = (v: number) => Math.max(-POSITION_MAX, Math.min(POSITION_MAX, v))

/** Arrondit une position libre à l'unité de grille. */
export const aimanter = (p: Point): [number, number] => [borner(Math.round(p.x)), borner(Math.round(p.y))]

export function docDepuisTexte(texte: string): NoeudTexte {
  return {
    type: 'doc',
    content: texte
      .split('\n')
      .map((ligne) => (ligne ? { type: 'paragraph', content: [{ type: 'text', text: ligne }] } : { type: 'paragraph' })),
  }
}

export function nouvelleNote(x: number, y: number, texte = ''): Element {
  return {
    id: nouvelId(),
    x: borner(x),
    y: borner(y),
    largeur: LARGEUR_NOTE,
    contenu: { type: 'note', texte: docDepuisTexte(texte) },
  }
}

export const position = (e: Element): Point => point(e.x, e.y)

export function inverse(op: Operation): Operation {
  switch (op.type) {
    case 'creer':
      return { type: 'supprimer', element: op.element }
    case 'supprimer':
      return { type: 'creer', element: op.element }
    case 'deplacer':
      return { type: 'deplacer', id: op.id, de: op.vers, vers: op.de }
    case 'contenu':
      return { type: 'contenu', id: op.id, avant: op.apres, apres: op.avant }
  }
}

/** Applique une opération et rend un nouveau tableau ; l'ancien n'est pas touché. */
export function appliquer(t: Tableau, op: Operation): Tableau {
  switch (op.type) {
    case 'creer':
      return t.elements.some((e) => e.id === op.element.id) ? t : { ...t, elements: [...t.elements, op.element] }
    case 'supprimer':
      return { ...t, elements: t.elements.filter((e) => e.id !== op.element.id) }
    case 'deplacer':
      return modifier(t, op.id, (e) => ({ ...e, x: borner(op.vers[0]), y: borner(op.vers[1]) }))
    case 'contenu':
      return modifier(t, op.id, (e) => ({ ...e, contenu: op.apres }))
  }
}

function modifier(t: Tableau, id: Id, f: (e: Element) => Element): Tableau {
  return { ...t, elements: t.elements.map((e) => (e.id === id ? f(e) : e)) }
}

/** Passe ces éléments au-dessus des autres, en gardant leur ordre entre eux. */
export function auPremierPlan(t: Tableau, ids: Iterable<Id>): Tableau {
  const dessus = new Set(ids)
  return {
    ...t,
    elements: [...t.elements.filter((e) => !dessus.has(e.id)), ...t.elements.filter((e) => dessus.has(e.id))],
  }
}
