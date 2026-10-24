import { getSchema } from '@tiptap/react'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import StarterKit from '@tiptap/starter-kit'
import { EXTENSIONS_NOTE, KIT } from '../elements/note/extensions'
import { IdsDeBlocs } from './ids'
import { ApercuLien, CitationBloc, Colonne, Colonnes, Deroulant, ImageBloc, ResumeDeroulant } from './noeuds'

/**
 * Les extensions du moteur de blocs : celles de la note (mêmes noms de nœuds et de marques, pour qu'un texte de note
 * s'ouvre tel quel), avec les titres jusqu'au troisième, les tâches, les blocs de `noeuds.ts` et les ids de blocs.
 */
const KIT_BLOCS = { ...KIT, heading: { levels: [1, 2, 3] as (1 | 2 | 3)[] } }

/** Ce que le moteur remplace dans la liste de la note. */
const REMPLACES = new Set(['starterKit', 'blockquote'])

const communs = [
  ...EXTENSIONS_NOTE.filter((x) => !REMPLACES.has(x.name)),
  CitationBloc,
  TaskList,
  TaskItem.configure({ nested: true }),
  Deroulant,
  ResumeDeroulant,
  Colonnes,
  Colonne,
  ImageBloc,
  ApercuLien,
  IdsDeBlocs,
]

export const EXTENSIONS_BLOCS = [StarterKit.configure(KIT_BLOCS), ...communs]

/** Les mêmes, quand le texte s'écrit à plusieurs : l'annulation est alors celle du partage (voir `elements/partage.ts`). */
export const EXTENSIONS_BLOCS_PARTAGEE = [StarterKit.configure({ ...KIT_BLOCS, undoRedo: false }), ...communs]

export const SCHEMA_BLOCS = getSchema(EXTENSIONS_BLOCS)
