import type { Node as NoeudPM } from '@tiptap/pm/model'

/**
 * Le document relu comme des enregistrements de blocs, à la façon de Notion (docs/NOTION.md § 1) : chaque bloc a son
 * id, son type, son texte, son parent et ses enfants. L'arbre ProseMirror reste la vérité ; ce modèle est la façon
 * dont les gestes sur les blocs (et les éléments à venir) le désignent.
 */

export type TypeBloc =
  | 'texte'
  | 'titre1'
  | 'titre2'
  | 'titre3'
  | 'puce'
  | 'numero'
  | 'tache'
  | 'deroulant'
  | 'titreDeroulant1'
  | 'titreDeroulant2'
  | 'titreDeroulant3'
  | 'citation'
  | 'encadre'
  | 'code'
  | 'separateur'
  | 'image'
  | 'apercuLien'
  | 'tableau'
  | 'colonnes'
  | 'colonne'

export interface Bloc {
  id: string | null
  type: TypeBloc
  /** La position du nœud du bloc dans le document, et sa taille. */
  pos: number
  taille: number
  /** 0 au premier niveau. */
  profondeur: number
  parent: string | null
  enfants: string[]
  /** Le texte du bloc seul, sans celui de ses enfants. */
  texte: string
  /** Ce que Notion range dans `format` : la couleur, et ce que le type porte de plus. */
  format: Record<string, unknown>
}

/** Les nœuds qui enveloppent des blocs sans en être un (une liste n'est que ses éléments). */
const ENVELOPPES = new Set(['doc', 'bulletList', 'orderedList', 'taskList'])

/** Les blocs dont le premier enfant est le texte du bloc lui-même, et la suite ses enfants. */
const A_TITRE = new Set(['listItem', 'taskItem', 'deroulant', 'blockquote', 'encadre'])

function typeDe(n: NoeudPM, parent: NoeudPM | null): TypeBloc {
  switch (n.type.name) {
    case 'heading':
      return `titre${Math.min(3, Math.max(1, Number(n.attrs.level) || 1)) as 1 | 2 | 3}`
    case 'listItem':
      return parent?.type.name === 'orderedList' ? 'numero' : 'puce'
    case 'taskItem':
      return 'tache'
    case 'deroulant': {
      const niveau = Number(n.attrs.niveau) || 0
      return niveau ? `titreDeroulant${Math.min(3, niveau) as 1 | 2 | 3}` : 'deroulant'
    }
    case 'blockquote':
      return 'citation'
    case 'encadre':
      return 'encadre'
    case 'codeBlock':
      return 'code'
    case 'horizontalRule':
      return 'separateur'
    case 'image':
      return 'image'
    case 'apercuLien':
      return 'apercuLien'
    case 'table':
      return 'tableau'
    case 'colonnes':
      return 'colonnes'
    case 'colonne':
      return 'colonne'
    default:
      return 'texte'
  }
}

/** Les attributs du bloc qui s'écartent de leur valeur par défaut, sans l'id. */
function formatDe(n: NoeudPM): Record<string, unknown> {
  const { id: _, ...attrs } = n.attrs
  return Object.fromEntries(Object.entries(attrs).filter(([cle, v]) => v !== null && v !== undefined && v !== n.type.spec.attrs?.[cle]?.default))
}

/** Les blocs du document, dans l'ordre de lecture. */
export function blocsDe(doc: NoeudPM): Bloc[] {
  const sortie: Bloc[] = []
  const descendre = (noeud: NoeudPM, debut: number, parent: Bloc | null, profondeur: number) => {
    noeud.forEach((enfant, decalage, index) => {
      const pos = debut + decalage
      if (ENVELOPPES.has(enfant.type.name)) return descendre(enfant, pos + 1, parent, profondeur)
      // Le premier paragraphe d'un élément de liste, d'une citation… est le texte de ce bloc, pas un bloc à part.
      if (index === 0 && parent && A_TITRE.has(noeud.type.name) && (enfant.isTextblock || enfant.type.name === 'resumeDeroulant')) return
      if (!enfant.isBlock) return
      const titre = A_TITRE.has(enfant.type.name) ? enfant.firstChild : null
      const bloc: Bloc = {
        id: (enfant.attrs.id as string | null) ?? null,
        type: typeDe(enfant, noeud),
        pos,
        taille: enfant.nodeSize,
        profondeur,
        parent: parent?.id ?? null,
        enfants: [],
        texte: titre ? titre.textContent : enfant.isTextblock || enfant.type.name === 'codeBlock' ? enfant.textContent : '',
        format: formatDe(enfant),
      }
      sortie.push(bloc)
      if (parent && bloc.id) parent.enfants.push(bloc.id)
      if (!enfant.isTextblock && !enfant.isAtom && enfant.type.name !== 'table') descendre(enfant, pos + 1, bloc, profondeur + 1)
    })
  }
  descendre(doc, 0, null, 0)
  return sortie
}

/** Le bloc qui porte cet id, ou `undefined`. */
export const blocDe = (doc: NoeudPM, id: string): Bloc | undefined => blocsDe(doc).find((b) => b.id === id)
