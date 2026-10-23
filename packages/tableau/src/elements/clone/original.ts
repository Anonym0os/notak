import { type Clone, type Contenu, type Element, type Id, type TypeContenu, nouvelId } from '../../coeur/tableau'
import { t } from '../../langue'

/** Ce qu'on peut cloner : les cartes de contenu. Ni un clone (on clone son original), ni une colonne, un tableau, une ligne. */
const CLONABLES: ReadonlySet<TypeContenu> = new Set<TypeContenu>([
  'note',
  'lien',
  'image',
  'fichier',
  'taches',
  'table',
  'nuancier',
  'lieu',
  'croquis',
  'document',
])

export const peutCloner = (c: Contenu) => CLONABLES.has(c.type)

/** Ce que ce clone pointe : l'original, ou rien s'il n'existe plus (ou est à la corbeille, ou est lui-même un clone). */
export function originalDe(elements: readonly Element[], cible: Id): Element | undefined {
  const e = elements.find((x) => x.id === cible)
  return e && e.corbeille === undefined && peutCloner(e.contenu) ? e : undefined
}

/**
 * L'original qu'un clone dessine : le même que `originalDe`, mais il reste là quand l'original est à la corbeille.
 * Chez Milanote, un clone se dessine d'après l'élément qu'il pointe, sans regarder s'il est jeté : jeter l'original
 * emporte ses clones, mais un clone qu'on rapporte seul de la corbeille montre encore son contenu (et se détache,
 * si l'on veut le garder). Il ne dit « plus d'original » que lorsque la corbeille est vidée.
 */
export function originalAffichable(elements: readonly Element[], cible: Id): Element | undefined {
  const e = elements.find((x) => x.id === cible)
  return e && peutCloner(e.contenu) ? e : undefined
}

/** L'original d'un élément qu'on veut cloner : un clone qu'on clone donne un clone du même original. */
export const cibleDe = (e: Element): Id => (e.contenu.type === 'clone' ? e.contenu.cible : e.id)

/** Les clones d'un élément, à la toile comme dans une colonne. */
export const clonesDe = (elements: readonly Element[], id: Id): Element<Clone>[] =>
  elements.filter((e): e is Element<Clone> => e.contenu.type === 'clone' && e.contenu.cible === id && e.corbeille === undefined)

/** Un clone sans original encore choisi, pour le fantôme de l'outil. */
export const nouveauClone = (x: number, y: number, cible: Id, largeur: number): Element<Clone> => ({
  id: nouvelId(),
  x,
  y,
  largeur,
  contenu: { type: 'clone', cible },
})

/** Où naît un clone sur la toile : deux unités à droite et deux plus bas que l'élément, comme « Dupliquer ». */
export const placeAcote = (x: number, y: number): { x: number; y: number } => ({ x: Math.round(x) + 2, y: Math.round(y) + 2 })

/** Ce qu'on lit d'un clone dans une liste, quand son original n'est plus là. */
export const resumeSansOriginal = () => t('clone.sansOriginal')

/**
 * Les clones qui partent avec leur original quand il part à la corbeille. Un clone n'a pas de contenu à lui : sans
 * original il ne montrerait plus rien. Ils reviennent avec lui (Cmd+Z, ou la restauration l'un après l'autre).
 */
export function clonesEmportes(supprimes: readonly Element[], tableau: { elements: readonly Element[] }): Element[] {
  const partants = new Set(supprimes.map((e) => e.id))
  return tableau.elements.filter((e) => e.contenu.type === 'clone' && e.corbeille === undefined && partants.has(e.contenu.cible))
}
