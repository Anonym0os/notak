import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { type Editor, Extension, InputRule, markInputRule, wrappingInputRule } from '@tiptap/react'
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

/** `>` puis une espace en tête d'un paragraphe : il devient un dépliant (NOTION.md § 4 ; la note garde la citation). */
const regleDeroulant = () =>
  new InputRule({
    find: /^\s*>\s$/,
    handler: ({ state, range }) => {
      const $d = state.doc.resolve(range.from)
      if ($d.parent.type.name !== 'paragraph') return null
      const { deroulant, resumeDeroulant } = state.schema.nodes
      const conteneur = $d.node($d.depth - 1)
      const index = $d.index($d.depth - 1)
      if (!conteneur.canReplaceWith(index, index + 1, deroulant!)) return null
      const tr = state.tr.delete(range.from, range.to)
      const debut = $d.before()
      const p = tr.doc.nodeAt(debut)!
      tr.replaceWith(debut, debut + p.nodeSize, deroulant!.create({ id: p.attrs.id, couleur: p.attrs.couleur }, resumeDeroulant!.create(null, p.content)))
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
    const { blockquote, orderedList } = this.editor.schema.nodes
    const francais = () => langue() !== 'en'
    return [
      regleDeroulant(),
      wrappingInputRule({ find: /^\s*["“«]\s$/u, type: blockquote! }),
      // `a. ` et `i. ` font aussi une liste numérotée ; sa numérotation suit la profondeur.
      wrappingInputRule({ find: /^(?:[a-z]|[ivx]{1,4})\.\s$/, type: orderedList! }),
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

/** ⌘Entrée : coche la tâche du curseur, ou ouvre et ferme son dépliant. */
export function basculer(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    const attribut = n.type.name === 'taskItem' ? 'checked' : n.type.name === 'deroulant' ? 'ouvert' : null
    if (!attribut) continue
    editor.view.dispatch(editor.state.tr.setNodeAttribute($from.before(d), attribut, !n.attrs[attribut]))
    return true
  }
  return false
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
