import { Extension, InputRule, markInputRule } from '@tiptap/react'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { basculerCentre, basculerSurlignage } from './commandes'
import { normaliserUrl } from './conversion'

/** Le surlignage garde un nom de couleur (`vert`), que `note.css` décline : le document ne porte aucune valeur. */
const Surlignage = Highlight.configure({ multicolor: true }).extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-color'),
        renderHTML: (attrs: { color?: string | null }) => (attrs.color ? { 'data-color': attrs.color } : {}),
      },
    }
  },
})

/** Les raccourcis de mise en forme, en plus de ceux de Tiptap. */
const RaccourcisFormat = Extension.create({
  name: 'raccourcisFormat',
  priority: 1000,
  addKeyboardShortcuts() {
    const e = () => this.editor
    return {
      'Mod-Shift-x': () => e().commands.toggleStrike(),
      'Mod-e': () => e().commands.toggleCode(),
      'Mod-Shift-1': () => e().commands.toggleHeading({ level: 1 }),
      'Mod-Shift-2': () => e().commands.toggleHeading({ level: 2 }),
      'Mod-Shift-0': () => e().chain().focus().clearNodes().run(),
      'Mod-Shift-8': () => e().commands.toggleBulletList(),
      'Mod-Shift-7': () => e().commands.toggleOrderedList(),
      'Mod-\\': () => basculerCentre(e()),
      'Mod-Shift-h': () => basculerSurlignage(e(), 'vert'),
    }
  },
})

/**
 * Le Markdown qu'on tape : `*mot*` met en gras (l'italique garde `_mot_`), `~mot~` barre, et `[texte](adresse)`
 * fait un lien. Ces règles passent avant celles de Tiptap.
 */
const MarkdownTape = Extension.create({
  name: 'markdownTape',
  priority: 1000,
  addInputRules() {
    const { bold, strike, link } = this.editor.schema.marks
    return [
      markInputRule({ find: /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/, type: bold! }),
      markInputRule({ find: /(?:^|\s)(~(?!~)((?:[^~]+))~(?!~))$/, type: strike! }),
      new InputRule({
        find: /\[([^\]]+)\]\((\S+)\)$/,
        handler: ({ state, range, match }) => {
          const [, texte, adresse] = match
          if (!texte || !adresse || !link) return
          state.tr.replaceWith(range.from, range.to, state.schema.text(texte, [link.create({ href: normaliserUrl(adresse) })]))
        },
      }),
    ]
  },
})

/** Une seule liste, pour l'éditeur comme pour le rendu figé. */
export const EXTENSIONS_NOTE = [
  StarterKit.configure({ heading: { levels: [1, 2] }, link: { openOnClick: false } }),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center'], defaultAlignment: 'left' }),
  Surlignage,
  TextStyle,
  Color,
  RaccourcisFormat,
  MarkdownTape,
]

export interface GestesEdition {
  lien(): void
  supprimerNote(): void
  noteDessous(): void
  estVide(): boolean
  /** Entrée, avant l'éditeur : rend vrai si la note a été convertie (une adresse seule devient un lien). */
  entree(): boolean
  /** La note n'est qu'une case (`[] `) : elle devient une liste de tâches. */
  enTaches(): boolean
}

/** Ce qui n'a de sens que pendant l'édition : lien, suppression de la note vide, note du dessous. */
export const raccourcisEdition = (gestes: { current: GestesEdition }) =>
  Extension.create({
    name: 'raccourcisEdition',
    priority: 1100,
    addInputRules() {
      // Une règle de saisie plutôt qu'une touche : elle voit aussi le texte dicté ou inséré d'un coup.
      return [
        new InputRule({
          find: /^\[[ xX]?\] $/,
          handler: ({ state }) => {
            if (state.doc.childCount !== 1) return null
            // Après la transaction en cours : la note change de type et l'édition repart.
            queueMicrotask(() => gestes.current.enTaches())
          },
        }),
      ]
    },
    addKeyboardShortcuts() {
      return {
        'Mod-k': () => {
          gestes.current.lien()
          return true
        },
        'Mod-Enter': () => {
          gestes.current.noteDessous()
          return true
        },
        Enter: () => gestes.current.entree(),
        Backspace: () => {
          if (!gestes.current.estVide()) return false
          gestes.current.supprimerNote()
          return true
        },
      }
    },
  })
