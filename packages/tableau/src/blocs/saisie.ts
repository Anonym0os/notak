import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { type Editor, Extension, InputRule, markInputRule } from '@tiptap/react'
import { normaliserUrl } from '../elements/note/conversion'
import { langue } from '../langue'
import type { Vers } from './catalogue'
import { transformer } from './transformer'

/**
 * Ce qu'on tape (docs/NOTION.md § 4 et § 5) : les raccourcis markdown que le kit n'a pas déjà (`#`, `-`, `1.`,
 * `[]`, ` ``` `, `---`, `**`, `*`, `` ` `` y sont), les remplacements typographiques, et les touches du moteur.
 */

/** Un remplacement typographique : ce qui finit le texte tapé, et ce qui le remplace. */
export const REMPLACEMENTS: readonly [RegExp, string][] = [
  [/←>$/u, '↔'],
  [/<->$/u, '↔'],
  [/->$/u, '→'],
  [/<-$/u, '←'],
  [/=>$/u, '⇒'],
  [/>=$/u, '≥'],
  [/<=$/u, '≤'],
  [/!=$/u, '≠'],
  [/--$/u, '—'],
  [/\.\.\.$/u, '…'],
]

/**
 * Les guillemets droits deviennent typographiques selon la langue : « » en français (avec l'espace insécable),
 * “ ” en anglais. En tête de bloc, `"` reste droit tant qu'on n'a pas tapé la suite : `" ` y fait une citation.
 */
export function guillemet(avant: string, francais: boolean): string | null {
  const ouvrant = avant === '' || /[\s([{ ]$/u.test(avant)
  if (ouvrant) return francais ? '« ' : '“'
  return francais ? ' »' : '”'
}

/** L'apostrophe : droite après une lettre, elle devient courbe (`l'arbre` → `l’arbre`). */
const APOSTROPHE = /(\p{L})'$/u

/**
 * Un raccourci en tête de bloc (NOTION.md § 4) : le motif tapé disparaît et le bloc change de type, en gardant son
 * id, son retrait et sa couleur. Jamais dans du code, ni dans un bloc qui n'est pas de la page (une cellule).
 */
const regleType = (find: RegExp, type: string, attrs: (m: RegExpMatchArray) => Record<string, unknown> = () => ({})) =>
  new InputRule({
    find,
    handler: ({ state, range, match }) => {
      const $d = state.doc.resolve(range.from)
      const bloc = $d.parent
      if (!bloc.isTextblock || bloc.type.name === 'codeBlock' || $d.depth < 1) return null
      if (!['doc', 'colonne'].includes($d.node($d.depth - 1).type.name)) return null
      const cible = state.schema.nodes[type]!
      const { id, retrait, couleur } = bloc.attrs
      state.tr.delete(range.from, range.to).setNodeMarkup($d.before(), cible, { id, retrait, couleur, ...attrs(match) })
    },
  })

/** Les raccourcis de type en tête de bloc, dans l'ordre où ils sont essayés. */
const reglesDeType = () => [
  regleType(/^(#{1,3})\s$/, 'heading', (m) => ({ level: m[1]!.length })),
  regleType(/^[-*+]\s$/, 'puce'),
  regleType(/^(?:\d+|[a-z]|[ivx]{1,4})\.\s$/, 'numero'),
  regleType(/^\[(x|X| )?\]\s$/, 'tache', (m) => ({ coche: !!m[1] && m[1] !== ' ' })),
  regleType(/^>\s$/, 'depliant'),
  regleType(/^["“«]\s$/u, 'citation'),
  regleType(/^```([\w+#.-]*)\s?$/, 'codeBlock', (m) => ({ language: m[1] || null })),
]

/** `---` (ou `***`, `___`) seul sur la ligne : un séparateur tout de suite, un texte neuf dessous (NOTION.md § 4). */
const regleSeparateur = () =>
  new InputRule({
    find: /^(?:---|—-|\*\*\*|___)$/,
    handler: ({ state, range }) => {
      const $d = state.doc.resolve(range.from)
      if ($d.parent.type.name === 'codeBlock' || $d.depth < 1 || !['doc', 'colonne'].includes($d.node($d.depth - 1).type.name)) return null
      const debut = $d.before()
      const { retrait } = $d.parent.attrs
      const tr = state.tr.delete(range.from, range.to)
      const bloc = tr.doc.nodeAt(debut)!
      tr.replaceWith(debut, debut + bloc.nodeSize, [state.schema.nodes.horizontalRule!.create({ retrait }), state.schema.nodes.paragraph!.create({ retrait })])
      tr.setSelection(TextSelection.create(tr.doc, debut + 2))
    },
  })

/** Remplace ce qui finit le texte tapé ; jamais dans du code (les règles de saisie n'y jouent pas). */
const remplacer = (find: RegExp, par: string | ((m: RegExpMatchArray) => string)) =>
  new InputRule({
    find,
    handler: ({ state, range, match }) => {
      state.tr.insertText(typeof par === 'string' ? par : par(match), range.from, range.to)
    },
  })

export const SaisieBlocs = Extension.create({
  name: 'saisieBlocs',
  priority: 1000,
  addInputRules() {
    const { strike, link } = this.editor.schema.marks
    const francais = () => langue() !== 'en'
    return [
      ...reglesDeType(),
      regleSeparateur(),
      markInputRule({ find: /(?:^|\s)(~(?!~)((?:[^~]+))~(?!~))$/, type: strike! }),
      new InputRule({
        find: /\[([^\]]+)\]\((\S+)\)$/,
        handler: ({ state, range, match }) => {
          const [, texte, adresse] = match
          if (!texte || !adresse || !link) return
          state.tr.replaceWith(range.from, range.to, state.schema.text(texte, [link.create({ href: normaliserUrl(adresse) })]))
        },
      }),
      ...REMPLACEMENTS.map(([find, par]) => remplacer(find, par)),
      remplacer(APOSTROPHE, (m) => `${m[1]}’`),
      new InputRule({
        find: /"$/u,
        handler: ({ state, range }) => {
          const $d = state.doc.resolve(range.from)
          const avant = $d.parent.textBetween(0, $d.parentOffset, undefined, '￼')
          // En tête de bloc, le guillemet attend : `" ` fera une citation.
          if (avant === '') return null
          state.tr.insertText(guillemet(avant, francais())!, range.from, range.to)
        },
      }),
      // En tête de bloc, le guillemet resté droit s'ouvre quand on écrit la suite.
      new InputRule({
        find: /^"([^\s"])$/u,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${guillemet('', francais())}${match[1]}`, range.from, range.to)
        },
      }),
    ]
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => basculer(this.editor),
      'Mod-Shift-s': () => this.editor.commands.toggleStrike(),
    }
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('chiffresBlocs'),
        props: {
          handleKeyDown: (_, e) => {
            if (!(e.metaKey || e.ctrlKey) || !e.altKey || e.shiftKey) return false
            const vers = TYPES_CHIFFRES[e.code]
            if (!vers) return false
            e.preventDefault()
            return transformer(editor, vers)
          },
        },
      }),
    ]
  },
})

/** ⌘⌥0 … ⌘⌥8 : les types, lus sur la touche (`event.code`) puisque ⌥ change le caractère (NOTION.md § 5). */
export const TYPES_CHIFFRES: Record<string, Vers> = {
  Digit0: 'texte',
  Digit1: 'titre1',
  Digit2: 'titre2',
  Digit3: 'titre3',
  Digit4: 'tache',
  Digit5: 'puce',
  Digit6: 'numero',
  Digit7: 'deroulant',
  Digit8: 'code',
}

export interface GestesBlocs {
  /** ⌘/ : « Transformer en » sur le bloc du curseur. */
  transformerEn(): void
  /** ⌘⇧H : la dernière couleur employée. */
  derniereCouleur(): void
}

/** ⌘Entrée : coche la tâche du curseur, ou ouvre et ferme son dépliant (NOTION.md § 5). */
export function basculer(editor: Editor): boolean {
  const { $from } = editor.state.selection
  const n = $from.parent
  const pos = $from.depth ? $from.before() : -1
  const attribut = n.type.name === 'tache' ? 'coche' : n.type.name === 'depliant' || (n.type.name === 'heading' && n.attrs.depliant) ? 'ouvert' : null
  if (!attribut || pos < 0) return false
  const valeur = attribut === 'coche' ? !n.attrs.coche : n.attrs.ouvert === false
  editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, attribut, valeur))
  return true
}

/** Les touches qui ouvrent un menu de l'élément : ⌘/ et ⌘⇧H. */
export const raccourcisBlocs = (gestes: { current: GestesBlocs }) =>
  Extension.create({
    name: 'raccourcisBlocs',
    priority: 1100,
    addKeyboardShortcuts() {
      return {
        'Mod-/': () => {
          gestes.current.transformerEn()
          return true
        },
        'Mod-Shift-h': () => {
          gestes.current.derniereCouleur()
          return true
        },
      }
    },
  })
