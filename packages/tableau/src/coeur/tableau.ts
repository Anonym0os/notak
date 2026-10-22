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

/** Une image envoyée. Le fichier vit dans le dépôt de fichiers, l'élément ne garde que sa clé. */
export interface Image {
  type: 'image'
  fichier: Id
  /** Taille d'origine en pixels, pour garder les proportions. */
  largeurOrigine: number
  hauteurOrigine: number
  legende?: string
  /** Le type du fichier (`image/png`…) : les formats à transparence n'ont pas d'ombre. */
  typeMime?: string
}

export interface Apercu {
  titre?: string
  description?: string
  /** Adresse de l'image d'aperçu. */
  image?: string
  site?: string
  favicon?: string
}

export interface Lien {
  type: 'lien'
  url: string
  apercu?: Apercu
  /** `attente` tant que l'aperçu se charge, `echec` s'il n'a pas pu l'être. */
  statut: 'attente' | 'pret' | 'echec'
}

/** Une liste de tâches : un document Tiptap fait d'une liste de cases. */
export interface Taches {
  type: 'taches'
  titre?: string
  texte: NoeudTexte
}

/** Une colonne : ses éléments portent `parent` = l'id de la colonne, et un `ordre`. */
export interface Colonne {
  type: 'colonne'
  titre: string
  couleur?: CouleurNote
  repliee?: boolean
}

/** Une extrémité de ligne : un point libre du tableau, ou accrochée à un élément. */
export type Extremite = { x: number; y: number } | { element: Id }

export type Pointe = 'fleche' | 'rond' | 'rien'

export interface Ligne {
  type: 'ligne'
  depart: Extremite
  arrivee: Extremite
  /** Courbe de Bézier quadratique : écart perpendiculaire (UG) et position le long de la corde (0 à 1). */
  courbe?: { ecart: number; position: number }
  pointeDepart: Pointe
  pointeArrivee: Pointe
  trait: 'plein' | 'tirets' | 'points'
  epaisseur: 1 | 2 | 4
  couleur?: CouleurNote
  libelle?: string
}

/** Un tableau imbriqué, posé sur la toile de son parent. */
export interface RenvoiTableau {
  type: 'tableau'
  cible: Id
}

export type Contenu = Note | Image | Lien | Taches | Colonne | Ligne | RenvoiTableau
export type TypeContenu = Contenu['type']

export interface Element<C extends Contenu = Contenu> {
  id: Id
  /** Coin haut-gauche, en unités de grille entières. Sans effet dans une colonne et pour une ligne. */
  x: number
  y: number
  largeur: number
  contenu: C
  /** La colonne qui le contient, s'il est rangé dans une colonne. */
  parent?: Id
  /** Son rang dans la colonne : une clé fractionnaire, triée comme une chaîne. */
  ordre?: string
}

/** Un tableau : ses éléments, du plus bas au plus haut dans l'empilement. */
export interface Tableau {
  id?: Id
  titre: string
  elements: Element[]
}

/** Un geste élémentaire. Chacun a son inverse, ce qui fait l'historique. */
export type Operation =
  | { type: 'creer'; element: Element }
  | { type: 'supprimer'; element: Element }
  | { type: 'deplacer'; id: Id; de: [number, number]; vers: [number, number] }
  | { type: 'redimensionner'; id: Id; de: number; vers: number }
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

export function nouvelleNote(x: number, y: number, texte = ''): Element<Note> {
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
    case 'redimensionner':
      return { type: 'redimensionner', id: op.id, de: op.vers, vers: op.de }
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
    case 'redimensionner':
      return modifier(t, op.id, (e) => ({ ...e, largeur: op.vers }))
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
