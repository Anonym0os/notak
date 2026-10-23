import { type Clone, type Contenu, type Element, type Id, type TypeContenu, nouvelId } from '../../coeur/tableau'

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

/** Où naît un clone « à côté » : à droite de l'élément, sur sa ligne, à deux unités de lui. */
export const placeAcote = (x: number, y: number, largeur: number): { x: number; y: number } => ({ x: Math.round(x + largeur) + 2, y: Math.round(y) })

/** Ce qu'on lit d'un clone dans une liste, quand son original n'est plus là. */
export const RESUME_SANS_ORIGINAL = 'Clone sans original'
