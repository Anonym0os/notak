import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type Editor, Extension, Node, mergeAttributes, wrappingInputRule } from '@tiptap/react'
import { decouperAdresses } from './conversion'

/** Les icônes d'un encadré, dans l'ordre où un clic les fait défiler. */
export const ICONES_ENCADRE = ['💡', 'ℹ️', '⚠️', '❗', '❓', '✅', '❌', '📌'] as const

/** Les mots qu'on tape après `!` pour choisir l'icône : `!idee `, `!attention `… */
const MOTS_ICONE: Record<string, string> = {
  idee: '💡',
  idée: '💡',
  info: 'ℹ️',
  attention: '⚠️',
  important: '❗',
  question: '❓',
  ok: '✅',
  non: '❌',
  note: '📌',
}

/** `!` en début de ligne, suivi d'un mot connu ou d'un émoji, puis d'une espace. */
const SAISIE_ENCADRE = new RegExp(
  `^!(${Object.keys(MOTS_ICONE).join('|')}|\\p{Extended_Pictographic}[\\u{FE0F}\\u{200D}\\p{Extended_Pictographic}]*)?\\s$`,
  'iu',
)

/** Met les blocs choisis dans un encadré, ou les en sort. */
export function basculerEncadre(editor: Editor): boolean {
  const c = editor.chain().focus()
  return editor.isActive('encadre') ? c.lift('encadre').run() : c.clearNodes().wrapIn('encadre').run()
}

export const iconeSuivante = (icone: string) => ICONES_ENCADRE[(ICONES_ENCADRE.indexOf(icone as never) + 1) % ICONES_ENCADRE.length]!

/** L'encadré : quelques paragraphes sur un fond léger, une icône devant. L'icône est un attribut, dessiné en CSS. */
export const Encadre = Node.create({
  name: 'encadre',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return {
      icone: {
        default: ICONES_ENCADRE[0],
        parseHTML: (el: HTMLElement) => el.getAttribute('data-icone') || ICONES_ENCADRE[0],
        renderHTML: (attrs: { icone?: string }) => ({ 'data-icone': attrs.icone }),
      },
    }
  },
  parseHTML: () => [{ tag: 'div[data-type="encadre"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'encadre', class: 'notak-encadre' }), 0],
  addKeyboardShortcuts() {
    return { 'Mod-Shift-6': () => basculerEncadre(this.editor) }
  },
  addInputRules() {
    return [
      wrappingInputRule({
        find: SAISIE_ENCADRE,
        type: this.type,
        getAttributes: (m) => {
          const choix = m[1]
          return { icone: choix ? (MOTS_ICONE[choix.toLowerCase()] ?? choix) : ICONES_ENCADRE[0] }
        },
      }),
    ]
  },
  addProseMirrorPlugins() {
    const type = this.type
    return [
      new Plugin({
        key: new PluginKey('iconeEncadre'),
        props: {
          // Un clic sur l'icône (la marge gauche de l'encadré) passe à la suivante.
          handleDOMEvents: {
            mousedown: (view, e) => {
              const cible = e.target as HTMLElement
              if (!cible.classList?.contains('notak-encadre')) return false
              const r = cible.getBoundingClientRect()
              if (e.clientX - r.left > 30) return false
              const pos = view.posAtDOM(cible, 0) - 1
              const noeud = view.state.doc.nodeAt(pos)
              if (noeud?.type !== type) return false
              e.preventDefault()
              view.dispatch(view.state.tr.setNodeAttribute(pos, 'icone', iconeSuivante(noeud.attrs.icone as string)))
              return true
            },
          },
        },
      }),
    ]
  },
})

/**
 * Une table simple, pour ce qu'on colle depuis un tableur ou une page : des lignes, des cellules,
 * une ligne d'en-tête. On écrit dans les cellules ; on ne redimensionne ni ne fusionne rien.
 */
export const Table = Node.create({
  name: 'table',
  group: 'block',
  content: 'ligneTable+',
  isolating: true,
  parseHTML: () => [{ tag: 'table' }],
  renderHTML: ({ HTMLAttributes }) => ['table', mergeAttributes(HTMLAttributes, { class: 'notak-table' }), ['tbody', 0]],
})

export const LigneTable = Node.create({
  name: 'ligneTable',
  content: '(celluleTable|enteteTable)+',
  parseHTML: () => [{ tag: 'tr' }],
  renderHTML: ({ HTMLAttributes }) => ['tr', HTMLAttributes, 0],
})

export const CelluleTable = Node.create({
  name: 'celluleTable',
  content: 'paragraph+',
  isolating: true,
  parseHTML: () => [{ tag: 'td' }],
  renderHTML: ({ HTMLAttributes }) => ['td', HTMLAttributes, 0],
})

export const EnteteTable = Node.create({
  name: 'enteteTable',
  content: 'paragraph+',
  isolating: true,
  parseHTML: () => [{ tag: 'th' }],
  renderHTML: ({ HTMLAttributes }) => ['th', HTMLAttributes, 0],
})

/** Les adresses du texte, repérées sans devenir des liens : hors lien et hors code. */
function reperer(doc: NoeudPM): DecorationSet {
  const deco: Decoration[] = []
  doc.descendants((n, pos) => {
    if (!n.isText || n.marks.some((m) => m.type.name === 'link' || m.type.name === 'code')) return
    let ici = pos
    for (const m of decouperAdresses(n.text!)) {
      if (m.url) deco.push(Decoration.inline(ici, ici + m.texte.length, { class: 'notak-adresse', 'data-url': m.url }))
      ici += m.texte.length
    }
  })
  return DecorationSet.create(doc, deco)
}

/**
 * Une adresse tapée ou collée reste du texte : elle est seulement repérée (soulignée), et Cmd+clic l'ouvre.
 * Hors édition, le rendu figé la rend cliquable (voir `Note.tsx`).
 */
export const AdressesReperees = Extension.create({
  name: 'adressesReperees',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('adressesReperees'),
        state: {
          init: (_, { doc }) => reperer(doc),
          apply: (tr, avant) => (tr.docChanged ? reperer(tr.doc) : avant),
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
          handleClick: (_, __, e) => {
            const url = (e.target as HTMLElement).closest?.('.notak-adresse')?.getAttribute('data-url')
            if (!url || !(e.metaKey || e.ctrlKey)) return false
            window.open(url, '_blank', 'noopener')
            return true
          },
        },
      }),
    ]
  },
})
