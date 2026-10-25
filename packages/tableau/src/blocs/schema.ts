import { getSchema } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { EXTENSIONS_NOTE, KIT } from '../elements/note/extensions'
import { ClavierBlocs } from './clavier'
import { CodeBlocs } from './code'
import { CollerComme } from './collerComme'
import { DissolutionColonnes } from './colonnes'
import { IdsDeBlocs } from './ids'
import { ApercuLien, Colonne, Colonnes, ImageBloc } from './noeuds'
import { CitationPlate, Depliant, EncadrePlat, Numero, Puce, Tache } from './plats'
import { SaisieBlocs } from './saisie'
import { SelectionBlocs } from './selection'
import { StructureBlocs } from './structure'

/**
 * Les extensions du moteur de blocs (docs/NOTION.md § 1) : les marques et les nœuds en ligne de la note (mêmes noms,
 * pour qu'un passage collé ou converti garde sa mise en forme), et les blocs à plat du moteur. Ce que la note fait de
 * ses blocs (listes imbriquées, retraits par espaces, Markdown de la note) est remplacé par `plats.ts`,
 * `clavier.ts` et `saisie.ts`. Un texte imbriqué (une note, un document d'avant) passe par `migration.ts`.
 */
const KIT_BLOCS = {
  ...KIT,
  heading: { levels: [1, 2, 3] as (1 | 2 | 3)[] },
  bulletList: false as const,
  orderedList: false as const,
  listItem: false as const,
  listKeymap: false as const,
  // Une adresse tapée devient un lien à l'espace qui suit ; collée sur un passage, elle le lie (NOTION.md § 5).
  link: { openOnClick: false, autolink: true, linkOnPaste: true },
}

/** Ce que le moteur ne prend pas de la note : ses blocs imbriqués et les touches qui vont avec. */
const REMPLACES = new Set(['starterKit', 'retraits', 'blocEnParagraphe', 'markdownTape', 'blockquote', 'entreeEnTeteDeBloc', 'encadre', 'raccourcisFormat'])

const communs = [
  ...EXTENSIONS_NOTE.filter((x) => !REMPLACES.has(x.name)),
  Puce,
  Numero,
  Tache,
  Depliant,
  CitationPlate,
  EncadrePlat,
  Colonnes,
  Colonne,
  ImageBloc,
  ApercuLien,
  IdsDeBlocs,
  StructureBlocs,
  CodeBlocs,
  ClavierBlocs,
  SaisieBlocs,
  SelectionBlocs,
  CollerComme,
  DissolutionColonnes,
]

export const EXTENSIONS_BLOCS = [StarterKit.configure(KIT_BLOCS), ...communs]

/** Les mêmes, quand le texte s'écrit à plusieurs : l'annulation est alors celle du partage (voir `elements/partage.ts`). */
export const EXTENSIONS_BLOCS_PARTAGEE = [StarterKit.configure({ ...KIT_BLOCS, undoRedo: false }), ...communs]

export const SCHEMA_BLOCS = getSchema(EXTENSIONS_BLOCS)
