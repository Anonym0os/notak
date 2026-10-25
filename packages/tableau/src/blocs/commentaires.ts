import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type EditorState, NodeSelection } from '@tiptap/pm/state'
import CodeBlock from '@tiptap/extension-code-block'
import { Extension } from '@tiptap/react'
import { MARQUE_FIL } from '../elements/note/fils'

/**
 * Les commentaires sur tous les blocs (docs/NOTION.md § 9) : un passage de code se commente comme un passage de texte
 * (le bloc de code accepte la marque du fil) ; un bloc sans texte (image, séparateur, aperçu de lien) porte son fil
 * lui-même, dans son attribut `fil`, comme Notion attache une discussion à un bloc.
 */

/** Les blocs qui n'ont pas de texte où poser la marque : leur fil est un attribut du bloc. */
export const BLOCS_SANS_TEXTE = new Set(['image', 'horizontalRule', 'apercuLien'])

export const CommentairesBlocs = Extension.create({
  name: 'commentairesBlocs',
  addGlobalAttributes() {
    return [
      {
        types: [...BLOCS_SANS_TEXTE],
        attributes: {
          fil: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-fil-bloc'),
            renderHTML: (a: Record<string, unknown>) => (a.fil ? { 'data-fil-bloc': String(a.fil) } : {}),
          },
        },
      },
    ]
  },
})

/** Le bloc de code du moteur : aucune marque de mise en forme, mais celle d'un fil (StarterKit n'y met aucune marque). */
export const CodeCommentable = CodeBlock.extend({ marks: MARQUE_FIL })

/** Le bloc sans texte choisi (sélection de nœud), s'il peut porter un fil. */
export function blocSansTexteChoisi(state: EditorState): { pos: number; noeud: NoeudPM } | null {
  const { selection } = state
  if (!(selection instanceof NodeSelection) || !BLOCS_SANS_TEXTE.has(selection.node.type.name)) return null
  return { pos: selection.from, noeud: selection.node }
}

/** Le fil du bloc sans texte choisi, s'il en porte un. */
export const filDuBlocChoisi = (state: EditorState): string | null => {
  const b = blocSansTexteChoisi(state)
  return typeof b?.noeud.attrs.fil === 'string' ? b.noeud.attrs.fil : null
}

/** Où est le fil `id` : sur un passage (marque) ou sur un bloc sans texte (attribut). */
export function placeDuFil(doc: NoeudPM, id: string): { pos: number; texte: string; bloc: NoeudPM | null } {
  let pos = -1
  let texte = ''
  let bloc: NoeudPM | null = null
  doc.descendants((n, p) => {
    if (n.isText && n.marks.some((m) => m.type.name === MARQUE_FIL && m.attrs.fil === id)) {
      if (pos < 0) pos = p
      texte += n.text ?? ''
    } else if (!n.isText && n.attrs.fil === id && BLOCS_SANS_TEXTE.has(n.type.name)) {
      if (pos < 0) pos = p
      bloc = n
    }
  })
  return { pos, texte, bloc }
}
