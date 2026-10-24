import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { type AnyExtension, type Editor, Extension, InputRule, Mark, markInputRule, mergeAttributes } from '@tiptap/react'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { ApercuCouleurs } from './apercuCouleur'
import { PassageExtrait } from './extraction'
import { basculerCentre, basculerCode, basculerSurlignage, poserStyle } from './commandes'
import { normaliserUrl } from './conversion'
import { MARQUE_FIL } from './fils'
import { AdressesReperees, Citation, CelluleTable, Encadre, EnteteTable, LienTableau, LigneTable, Mention, Table } from './noeuds'
import { augmenterRetrait, changerCasse, diminuerRetrait } from './texte'

/** Le surlignage garde un nom de couleur (`vert`), que `note.css` décline : le document ne porte aucune valeur. */
export const Surlignage = Highlight.configure({ multicolor: true }).extend({
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

/**
 * Un passage commenté : la marque ne porte que la clé du fil (`Note.fils`), que la marge de la note en édition
 * retrouve. Elle est dans le schéma partagé, donc elle voyage avec le texte dans le fragment Yjs.
 */
export const FilTexte = Mark.create({
  name: MARQUE_FIL,
  inclusive: false,
  addAttributes() {
    return {
      fil: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-fil'),
        renderHTML: (attrs: { fil?: string | null }) => (attrs.fil ? { 'data-fil': attrs.fil } : {}),
      },
    }
  },
  parseHTML: () => [{ tag: 'span[data-fil]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class: 'notak-fil-texte' }), 0],
})

/**
 * Le code en ligne. Comme celui de Tiptap, mais il laisse passer les autres marques : on peut y mettre du gras,
 * un lien, un surlignage ou un commentaire (celui de Tiptap les exclut toutes).
 */
const CodeEnLigne = Mark.create({
  name: 'code',
  excludes: '',
  code: true,
  parseHTML: () => [{ tag: 'code' }],
  renderHTML: ({ HTMLAttributes }) => ['code', mergeAttributes(HTMLAttributes), 0],
  addCommands() {
    return {
      setCode: () => ({ commands }) => commands.setMark(this.name),
      toggleCode: () => ({ commands }) => commands.toggleMark(this.name),
      unsetCode: () => ({ commands }) => commands.unsetMark(this.name),
    }
  },
  addKeyboardShortcuts() {
    return { 'Mod-e': () => this.editor.commands.toggleCode() }
  },
  addInputRules() {
    return [markInputRule({ find: /(^|[^`])`([^`]+)`(?!`)$/, type: this.type })]
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
      'Mod-.': () => basculerCode(e()),
      'Mod->': () => basculerCode(e()),
      'Mod-Shift-.': () => basculerCode(e()),
      'Mod-"': () => poserStyle(e(), 'citation'),
      "Mod-Shift-'": () => poserStyle(e(), 'citation'),
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

/**
 * Retour arrière en tête d'un titre ou d'un petit texte : le bloc redevient un paragraphe normal.
 * Avant les listes, dont l'élément remonte d'un niveau quand il n'y a rien de tel à défaire.
 */
const BlocEnParagraphe = Extension.create({
  name: 'blocEnParagraphe',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state
        if (!selection.empty || selection.$from.parentOffset !== 0) return false
        const parent = selection.$from.parent
        if (parent.type.name === 'heading') return this.editor.commands.setParagraph()
        if (parent.type.name === 'paragraph' && parent.attrs.petit) return this.editor.commands.updateAttributes('paragraph', { petit: null })
        return false
      },
    }
  },
})

/** Entrée efface les marques en cours (gras, couleur, surlignage) : la ligne suivante repart sans mise en forme en ligne. */
const MarquesALEntree = Extension.create({
  name: 'marquesALEntree',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('marquesALEntree'),
        props: {
          handleKeyDown: (view, e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.isComposing) return false
            // Après la touche : le bloc est coupé, les marques gardées vivent dans les « marques en attente ».
            queueMicrotask(() => {
              if (editor.isDestroyed) return
              const { selection, storedMarks } = view.state
              if (selection.empty && selection.$from.parent.content.size === 0 && storedMarks?.length) {
                view.dispatch(view.state.tr.setStoredMarks([]))
              }
            })
            return false
          },
        },
      }),
    ]
  },
})

/**
 * Quand l'éditeur perd le focus alors que du texte est choisi (clic dans le champ d'adresse du lien, dans un menu),
 * le passage reste surligné ; il le cesse au retour du focus.
 */
const SelectionVirtuelle = Extension.create({
  name: 'selectionVirtuelle',
  addProseMirrorPlugins() {
    const cle = new PluginKey<boolean>('selectionVirtuelle')
    return [
      new Plugin<boolean>({
        key: cle,
        state: {
          init: () => false,
          apply: (tr, avant) => (tr.getMeta(cle) as boolean | undefined) ?? avant,
        },
        props: {
          decorations: (state) => {
            const { from, to, empty } = state.selection
            if (empty || !cle.getState(state)) return null
            return DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: 'notak-selection-virtuelle' })])
          },
          handleDOMEvents: {
            blur: (view) => {
              if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(cle, true))
              return false
            },
            focus: (view) => {
              if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(cle, false))
              return false
            },
          },
        },
      }),
    ]
  },
})

/**
 * Entrée en tête d'une citation ou d'un encadré dont le texte n'est pas vide : un paragraphe neuf est créé avant le
 * bloc, hors de lui, et le curseur y va (le texte du bloc ne bouge pas).
 */
const EntreeEnTeteDeBloc = Extension.create({
  name: 'entreeEnTeteDeBloc',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.parentOffset !== 0 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size === 0) return false
        const bloc = $from.depth > 1 ? $from.node($from.depth - 1) : null
        if (!bloc || (bloc.type.name !== 'blockquote' && bloc.type.name !== 'encadre') || $from.index($from.depth - 1) !== 0) return false
        const avant = $from.before($from.depth - 1)
        const tr = state.tr.insert(avant, state.schema.nodes.paragraph!.create())
        view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(avant + 1))).scrollIntoView())
        return true
      },
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
      // `---`, `***` ou `___` seuls sur la ligne font un séparateur tout de suite, sans espace après.
      new InputRule({
        find: /^(?:---|\*\*\*|___)$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setHorizontalRule().run()
        },
      }),
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
// Pas de paragraphe vide ajouté d'office en fin de note (comme Milanote) : il grandissait la carte d'une ligne.
export const KIT = {
  code: false as const,
  blockquote: false as const,
  heading: { levels: [1, 2] as (1 | 2)[] },
  link: { openOnClick: false, autolink: false, linkOnPaste: false },
  trailingNode: false as const,
}

export const EXTENSIONS_NOTE = [
  StarterKit.configure(KIT),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center'], defaultAlignment: 'left' }),
  Surlignage,
  TextStyle,
  Color,
  PetitTexte,
  RaccourcisFormat,
  Retraits,
  CodeEnLigne,
  BlocEnParagraphe,
  MarquesALEntree,
  SelectionVirtuelle,
  MarkdownTape,
  Citation,
  EntreeEnTeteDeBloc,
  ApercuCouleurs,
  PassageExtrait,
  Encadre,
  Table,
  LigneTable,
  CelluleTable,
  EnteteTable,
  AdressesReperees,
  Mention,
  LienTableau,
  FilTexte,
]

/** Les mêmes, quand le texte s'écrit à plusieurs : l'annulation est alors celle du partage (voir `partage.ts`). */
export const EXTENSIONS_NOTE_PARTAGEE = [StarterKit.configure({ ...KIT, undoRedo: false }), ...EXTENSIONS_NOTE.slice(1)]

/** Dans un titre, un bloc neuf (Entrée, passage en titre) naît centré, comme le titre lui-même. */
export const centreParDefaut = (extensions: readonly AnyExtension[]): AnyExtension[] =>
  extensions.map((x) => (x.name === 'textAlign' ? TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center'], defaultAlignment: 'center' }) : x))

/**
 * La légende : gras, italique, barré, souligné, lien, couleur, surlignage et centrage ; ni titre, ni liste, ni citation,
 * ni code. Le Markdown qu'on tape (`*gras*`, `[t](u)`) n'y est pas : ses règles posent aussi des blocs.
 */
const KIT_LEGENDE = {
  ...KIT,
  heading: false as const,
  bulletList: false as const,
  orderedList: false as const,
  listItem: false as const,
  listKeymap: false as const,
  codeBlock: false as const,
  horizontalRule: false as const,
  trailingNode: false as const,
}

export const EXTENSIONS_LEGENDE = [
  StarterKit.configure(KIT_LEGENDE),
  TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center'], defaultAlignment: 'left' }),
  Surlignage,
  TextStyle,
  Color,
  AdressesReperees,
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
  /** Commente le passage choisi, ou ouvre le fil de celui où l'on est. */
  commenter(): void
  /** Des tâches collées dans une note vide : elle devient une liste de tâches. Rend vrai si le collage a servi. */
  collerTaches(texte: string): boolean
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
        'Mod-Alt-m': () => {
          gestes.current.commenter()
          return true
        },
        'Mod-Enter': () => {
          gestes.current.noteDessous()
          return true
        },
        Enter: () => gestes.current.entree(),
        // Retour arrière et Suppr, seuls ou avec Maj, Alt, Ctrl, Cmd : tous mettent la note vide à la corbeille.
        ...Object.fromEntries(
          ['Backspace', 'Delete'].flatMap((touche) =>
            ['', 'Shift-', 'Alt-', 'Ctrl-', 'Mod-'].map((mod) => [
              `${mod}${touche}`,
              () => {
                if (!gestes.current.estVide()) return false
                gestes.current.supprimerNote()
                return true
              },
            ]),
          ),
        ),
      }
    },
  })
