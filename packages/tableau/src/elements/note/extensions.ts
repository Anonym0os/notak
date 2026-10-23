import { type Editor, Extension, InputRule, markInputRule } from '@tiptap/react'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { basculerCentre, basculerSurlignage, poserStyle } from './commandes'
import { normaliserUrl } from './conversion'
import { AdressesReperees, CelluleTable, Encadre, EnteteTable, LienTableau, LigneTable, Mention, Table } from './noeuds'
import { augmenterRetrait, changerCasse, diminuerRetrait } from './texte'

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

/** Le petit texte : un paragraphe marqué, que `note.css` dessine plus petit. */
const PetitTexte = Extension.create({
  name: 'petitTexte',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          petit: {
            default: null,
            parseHTML: (el: HTMLElement) => (el.getAttribute('data-taille') === 'petit' ? true : null),
            renderHTML: (attrs: { petit?: boolean | null }) => (attrs.petit ? { 'data-taille': 'petit' } : {}),
          },
        },
      },
    ]
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
      'Mod-Shift-0': () => poserStyle(e(), 'texte'),
      'Mod-Shift-9': () => poserStyle(e(), styleActifPetit(e()) ? 'texte' : 'petit'),
      'Mod-Shift-8': () => e().commands.toggleBulletList(),
      'Mod-Shift-u': () => e().commands.toggleBulletList(),
      'Mod-Shift-7': () => e().commands.toggleOrderedList(),
      'Mod-Shift-o': () => e().commands.toggleOrderedList(),
      'Mod-Shift-b': () => poserStyle(e(), 'citation'),
      "Mod-'": () => poserStyle(e(), 'citation'),
      'Mod-.': () => poserStyle(e(), 'code'),
      'Mod-\\': () => basculerCentre(e()),
      'Mod-Shift-h': () => basculerSurlignage(e(), 'vert'),
      'Mod-j': () => basculerSurlignage(e(), 'vert'),
      'Shift-F3': () => changerCasse(e()),
    }
  },
})

/** Tab et Maj+Tab : le retrait du texte. Après les listes (priorité plus basse), qui font descendre leurs éléments. */
const Retraits = Extension.create({
  name: 'retraits',
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: () => augmenterRetrait(this.editor),
      'Shift-Tab': () => diminuerRetrait(this.editor),
    }
  },
})

const styleActifPetit = (ed: Editor) => ed.isActive('paragraph', { petit: true })

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

/**
 * Une seule liste, pour l'éditeur comme pour le rendu figé. Une adresse tapée ou collée ne devient pas un lien
 * d'elle-même (`autolink`, `linkOnPaste`) : elle reste du texte, que `AdressesReperees` souligne.
 */
const KIT = { heading: { levels: [1, 2] as (1 | 2)[] }, link: { openOnClick: false, autolink: false, linkOnPaste: false } }

export const EXTENSIONS_NOTE = [
  StarterKit.configure(KIT),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center'], defaultAlignment: 'left' }),
  Surlignage,
  TextStyle,
  Color,
  PetitTexte,
  RaccourcisFormat,
  Retraits,
  MarkdownTape,
  Encadre,
  Table,
  LigneTable,
  CelluleTable,
  EnteteTable,
  AdressesReperees,
  Mention,
  LienTableau,
]

/** Les mêmes, quand le texte s'écrit à plusieurs : l'annulation est alors celle du partage (voir `partage.ts`). */
export const EXTENSIONS_NOTE_PARTAGEE = [StarterKit.configure({ ...KIT, undoRedo: false }), ...EXTENSIONS_NOTE.slice(1)]

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
