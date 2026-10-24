import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'

/**
 * L'invite grise du bloc vide où est le curseur (docs/NOTION.md § 2) : « Tapez / pour les blocs ». Une décoration,
 * donc rien dans le texte ; elle n'apparaît que dans un paragraphe, et seulement quand l'éditeur a le focus.
 */
export const Invite = Extension.create<{ texte: () => string }>({
  name: 'inviteBlocs',
  addOptions: () => ({ texte: () => '' }),
  addProseMirrorPlugins() {
    const { texte } = this.options
    return [
      new Plugin({
        key: new PluginKey('inviteBlocs'),
        props: {
          decorations: (state) => {
            const { selection } = state
            const { $from } = selection
            const bloc = $from.parent
            if (!selection.empty || bloc.type.name !== 'paragraph' || bloc.content.size > 0) return null
            return DecorationSet.create(state.doc, [Decoration.node($from.before(), $from.after(), { class: 'notak-invite', 'data-invite': texte() })])
          },
        },
      }),
    ]
  },
})
