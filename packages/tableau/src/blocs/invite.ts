import type { Node as NoeudPM } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { t } from '../langue'
import { CONTENEURS } from './ids'

/**
 * Les invites grises des blocs vides (docs/NOTION.md § 2, relevé « 4-rendu-mesures » § 3.11). Des décorations : rien
 * dans le texte. Les blocs d'un type (titres, listes, tâche, citation, dépliant) montrent la leur dès qu'ils sont
 * vides, même sans le curseur ; un paragraphe vide attend le curseur et le focus, et dit comment ouvrir les commandes.
 * Un encadré vide, un code vide, un paragraphe d'une cellule de tableau n'en ont pas.
 */

/** La clé du texte d'invite propre à un type de bloc, ou `null` s'il n'en a pas. */
export function cleInvite(noeud: NoeudPM): string | null {
  switch (noeud.type.name) {
    case 'heading':
      return `menus.invite.titre${Math.min(3, Math.max(1, Number(noeud.attrs.level) || 1))}`
    case 'puce':
    case 'numero':
      return 'menus.invite.liste'
    case 'tache':
      return 'menus.invite.tache'
    case 'citation':
      return 'menus.invite.citation'
    case 'depliant':
      return 'menus.invite.depliant'
    default:
      return null
  }
}

/** Les décorations d'invite de ce document : `curseur` est la position du bloc où l'éditeur a le focus et un curseur. */
export function invites(doc: NoeudPM, curseur: number | null): Decoration[] {
  const sortie: Decoration[] = []
  doc.descendants((n, pos, parent) => {
    // Une cellule de tableau n'est pas un bloc de la page : on n'y descend pas.
    if (n.type.name === 'table') return false
    if (!n.isTextblock) return true
    if (n.content.size > 0 || !parent || !CONTENEURS.has(parent.type.name)) return false
    const cle = cleInvite(n) ?? (n.type.name === 'paragraph' && curseur === pos ? 'menus.invite.texte' : null)
    if (cle) sortie.push(Decoration.node(pos, pos + n.nodeSize, { class: cle === 'menus.invite.texte' ? 'notak-invite notak-invite-texte' : 'notak-invite', 'data-invite': t(cle) }))
    return false
  })
  return sortie
}

export const Invite = Extension.create<{ texte?: () => string }>({
  name: 'inviteBlocs',
  // L'option `texte` de l'ancien branchement n'est plus lue : les invites suivent la langue (`menus.invite.*`).
  addOptions: () => ({}),
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('inviteBlocs'),
        props: {
          decorations: (state) => {
            const { selection } = state
            const { $from } = selection
            const focus = selection.empty && $from.depth >= 1 && CONTENEURS.has($from.node($from.depth - 1).type.name) ? $from.before() : null
            const decos = invites(state.doc, focus)
            return decos.length ? DecorationSet.create(state.doc, decos) : null
          },
        },
      }),
    ]
  },
})
