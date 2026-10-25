import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { type Editor, Extension, InputRule } from '@tiptap/react'
import { normaliserUrl } from '../elements/note/conversion'
import { AnnulationBlocs } from './annulation'
import type { Vers } from './catalogue'
import { CollageBlocs } from './collage'
import { CopieBlocs } from './copie'
import { FlechesBlocs } from './fleches'
import { CONTENEURS } from './ids'
import { blocsDe } from './modele'
import { transformer } from './transformer'
import { DELIMITEURS, REMPLACEMENTS, chercherMarque, dansCodeOuvert, guillemet } from './typographie'

export { REMPLACEMENTS, guillemet } from './typographie'

/**
 * Ce qu'on tape (docs/NOTION.md § 4 et § 5) : les raccourcis markdown (`#`, `-`, `1.`, `[]`, ` ``` `, `---`, `**`,
 * `*`, `` ` ``…), les remplacements typographiques, et les touches du moteur. Chaque règle est une règle de saisie de
 * Tiptap : la frappe est une transaction, la conversion en est une autre, qui forme un pas d'annulation à part
 * (⌘Z rend le motif tapé, `annulation.ts`).
 */

/** Les types d'où un raccourci en tête de bloc part : ni un encadré, ni un code (NOTION.md § 4). */
const DEPART = new Set(['paragraph', 'heading', 'puce', 'numero', 'tache', 'depliant', 'citation'])

/** Le bloc de texte où le motif a été tapé, s'il peut le convertir : un bloc de la page ou d'une colonne. */
function departDe(state: EditorState, de: number): { debut: number; bloc: NoeudPM } | null {
  const $d = state.doc.resolve(de)
  const bloc = $d.parent
  if (!bloc.isTextblock || $d.depth < 1 || !DEPART.has(bloc.type.name)) return null
  if (!CONTENEURS.has($d.node($d.depth - 1).type.name)) return null
  return { debut: $d.before(), bloc }
}

/** Le texte du bloc jusqu'à la position. */
const avantLe = (state: EditorState, pos: number): string => {
  const $p = state.doc.resolve(pos)
  return $p.parent.textBetween(0, $p.parentOffset, undefined, '￼')
}

/** Les valeurs qu'un jeton de numéro peut avoir : chiffres, lettre seule (a = 1), chiffres romains (i = 1). */
export function valeursDeNumero(jeton: string): number[] {
  if (/^\d+$/.test(jeton)) return [Number(jeton)]
  const valeurs: number[] = []
  if (/^[a-z]$/.test(jeton)) valeurs.push(jeton.charCodeAt(0) - 96)
  const R: [string, number][] = [['m', 1000], ['cm', 900], ['d', 500], ['cd', 400], ['c', 100], ['xc', 90], ['l', 50], ['xl', 40], ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]]
  let reste = jeton
  let n = 0
  for (const [signe, valeur] of R) while (reste.startsWith(signe)) (reste = reste.slice(signe.length)), (n += valeur)
  if (!reste && n > 0 && /^[ivxlcdm]+$/.test(jeton)) {
    // Le jeton doit s'écrire comme le nombre : `iiii` n'en est pas un.
    let ecrit = ''
    let m = n
    for (const [signe, valeur] of R) while (m >= valeur) (ecrit += signe), (m -= valeur)
    if (ecrit === jeton) valeurs.push(n)
  }
  return valeurs
}

/**
 * Un numéro tapé en tête de bloc est-il accepté (NOTION.md § 4) ? Seulement s'il continue la liste qui précède
 * (`attendu` = son dernier numéro + 1) ; en tête d'une liste (`attendu` = 1) : `1.`, `a.` ou `i.`. En tête de liste, un
 * autre nombre en chiffres est aussi pris, comme numéro de départ (voir la règle plus bas).
 */
export const numeroAccepte = (jeton: string, attendu: number): boolean => valeursDeNumero(jeton).includes(attendu)

/** Le dernier numéro de la liste qui précède le bloc à `pos` (ses frères numérotés juste avant lui) ; 0 s'il n'y en a pas. */
export function numeroAvant(state: EditorState, pos: number): number {
  const blocs = blocsDe(state.doc)
  const b = blocs.find((x) => x.pos === pos)
  if (!b) return 0
  const freres = blocs.filter((x) => x.parent === b.parent && x.pos < b.pos && x.type !== 'colonne')
  let n = 0
  for (let i = freres.length - 1; i >= 0 && freres[i]!.type === 'numero'; i--) n++
  return n
}

type Cible = [nom: string, attrs: Record<string, unknown>]

/**
 * Un raccourci de type en tête de bloc (NOTION.md § 4) : le motif tapé disparaît et le bloc change de type, en gardant
 * son id, son retrait et sa couleur ; le curseur reste au début du texte qui suit. `choisir` rend le type visé, ou `null`
 * si le motif ne doit rien faire ici. Dans une citation, le motif ne change pas le bloc : il crée un enfant du type visé,
 * qui reçoit le reste du texte.
 */
const regleBloc = (find: RegExp, choisir: (m: RegExpMatchArray, bloc: NoeudPM, debut: number, state: EditorState) => Cible | null) =>
  new InputRule({
    find,
    handler: ({ state, range, match }) => {
      const depart = departDe(state, range.from)
      if (!depart) return null
      const { debut, bloc } = depart
      const cible = choisir(match, bloc, debut, state)
      const type = cible && state.schema.nodes[cible[0]]
      if (!cible || !type) return null
      const { id, retrait, couleur } = bloc.attrs
      const tr = state.tr.delete(range.from, range.to)
      const reste = tr.doc.nodeAt(debut)!
      if (!type.validContent(reste.content)) return null
      if (bloc.type.name === 'citation' && cible[0] !== 'citation') {
        const enfant = type.create({ retrait: Math.min(12, (Number(retrait) || 0) + 1), ...cible[1] }, reste.content)
        tr.replaceWith(debut, debut + reste.nodeSize, [bloc.type.create({ id, retrait, couleur }), enfant])
        tr.setSelection(TextSelection.create(tr.doc, debut + 2 + 1))
        return
      }
      tr.setNodeMarkup(debut, type, { id, retrait, couleur, ...cible[1] })
    },
  })

/** Les raccourcis de type en tête de bloc, dans l'ordre où ils sont essayés. */
const reglesDeType = () => [
  regleBloc(/^\[(x|X| )?\]\s$/, (m, bloc) => {
    const coche = !!m[1] && m[1] !== ' '
    return bloc.type.name === 'tache' && !!bloc.attrs.coche === coche ? null : ['tache', { coche }]
  }),
  // Dans un dépliant, `#` fait un titre dépliant du niveau ; ailleurs un titre simple (NOTION.md § 4).
  regleBloc(/^(#{1,3})\s$/, (m, bloc) => {
    const level = m[1]!.length
    const depliant = bloc.type.name === 'depliant' || (bloc.type.name === 'heading' && !!bloc.attrs.depliant)
    if (bloc.type.name === 'heading' && bloc.attrs.level === level && !!bloc.attrs.depliant === depliant) return null
    return ['heading', depliant ? { level, depliant: true, ouvert: bloc.attrs.ouvert !== false } : { level, depliant: false }]
  }),
  // Dans un titre simple, `>` fait le titre dépliant du même niveau.
  regleBloc(/^>\s$/, (_, bloc) => {
    if (bloc.type.name === 'depliant' || (bloc.type.name === 'heading' && bloc.attrs.depliant)) return null
    return bloc.type.name === 'heading' ? ['heading', { level: bloc.attrs.level, depliant: true, ouvert: true }] : ['depliant', { ouvert: true }]
  }),
  regleBloc(/^(?:["“«]|\|)\s$/u, (_, bloc) => (bloc.type.name === 'citation' ? null : ['citation', {}])),
  regleBloc(/^[-*+•]\s$/u, (_, bloc) => (bloc.type.name === 'puce' ? null : ['puce', {}])),
  // Un numéro n'est accepté que s'il continue la liste d'avant, ou s'il en commence une : un nombre tapé là devient
  // son numéro de départ (« 3. » fait une liste qui part de 3). Un titre ne devient pas une liste.
  regleBloc(/^(\d+|[a-z]|[ivxlcdm]+)[.)]\s$/, (m, bloc, debut, state) => {
    if (bloc.type.name === 'numero' || bloc.type.name === 'heading') return null
    const attendu = numeroAvant(state, debut) + 1
    if (numeroAccepte(m[1]!, attendu)) return ['numero', {}]
    return attendu === 1 && /^\d+$/.test(m[1]!) && Number(m[1]) > 0 ? ['numero', { depart: Number(m[1]) }] : null
  }),
  regleBloc(/^```([\w+#.-]*)\s?$/, (m) => ['codeBlock', { language: m[1] || null }]),
]

/**
 * `---` seul sur la ligne, sans espace : un séparateur tout de suite, et un texte neuf dessous qui reçoit le reste du
 * texte et le curseur (NOTION.md § 4). Les deux tirets du début sont déjà devenus `—` ; `***` et `___` n'en font pas.
 */
const regleSeparateur = () =>
  new InputRule({
    find: /^(?:---|—-)$/,
    handler: ({ state, range }) => {
      const depart = departDe(state, range.from)
      if (!depart) return null
      const { debut, bloc } = depart
      const { retrait } = bloc.attrs
      const tr = state.tr.delete(range.from, range.to)
      const reste = tr.doc.nodeAt(debut)!
      tr.replaceWith(debut, debut + reste.nodeSize, [state.schema.nodes.horizontalRule!.create({ retrait }), state.schema.nodes.paragraph!.create({ retrait }, reste.content)])
      tr.setSelection(TextSelection.create(tr.doc, debut + 2))
    },
  })

/** `**gras**`, `*italique*`, `~barré~`, `` `code` `` : les délimiteurs disparaissent, la marque se pose et ne se prolonge pas. */
const regleMarque = (delim: string, nom: string) =>
  new InputRule({
    find: (avant) => {
      const m = chercherMarque(avant, delim)
      return m ? { index: m.debut, text: avant.slice(m.debut), data: { contenu: m.contenu } } : null
    },
    handler: ({ state, range, match }) => {
      const type = state.schema.marks[nom]
      const contenu = String(match.data?.contenu ?? '')
      if (!type || !contenu) return null
      const n = delim.length
      // Pas de code dans du code.
      if (nom === 'code' && state.doc.rangeHasMark(range.from + n, range.to - n, type)) return null
      const tr = state.tr.delete(range.to - n, range.to).delete(range.from, range.from + n)
      tr.addMark(range.from, range.from + contenu.length, type.create())
      tr.removeStoredMark(type)
    },
  })

/** Remplace ce qui finit le texte tapé, sauf dans un code en ligne resté ouvert (dans un bloc de code, aucune règle ne joue). */
const remplacer = (find: RegExp, par: string) =>
  new InputRule({
    find,
    handler: ({ state, range }) => {
      if (dansCodeOuvert(avantLe(state, range.from))) return null
      state.tr.insertText(par, range.from, range.to)
    },
  })

/** `"` et `'` : ouvrants en tête de bloc et après une espace, fermants ailleurs (NOTION.md § 4). */
const reglesDeGuillemets = () =>
  (['"', "'"] as const).map(
    (signe) =>
      new InputRule({
        find: new RegExp(`${signe}$`, 'u'),
        handler: ({ state, range }) => {
          const avant = avantLe(state, range.from)
          if (dansCodeOuvert(avant)) return null
          state.tr.insertText(guillemet(avant, signe === "'"), range.from, range.to)
        },
      }),
  )

/** Les motifs de type qui ne font rien dans un encadré : la frappe passe sans que les règles du kit s'en mêlent. */
const MOTIFS_DE_TYPE = /^(?:\[[xX ]?\]|#{1,3}|>|-|\*|\+|•|\||["“«]|\d+[.)]|[a-z][.)]|[ivxlcdm]+[.)])\s$/u

/**
 * Entre nos règles et celles du kit : un délimiteur de marque (`*`, `_`, `~`, `` ` ``) que nos règles n'ont pas pris n'est
 * pas repris par celles du kit, qui acceptent plus que Notion (`~~x~~`, `* x*`, un code en plein mot) ; `***` et `___`
 * suivis d'une espace non plus ne font pas de séparateur. La frappe s'écrit, et c'est tout.
 */
const GardeMarques = Extension.create({
  name: 'gardeMarques',
  priority: 500,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('gardeMarques'),
        props: {
          handleTextInput: (view, from, to, texte) => {
            const delimiteur = ['*', '_', '~', '`'].includes(texte)
            if (!delimiteur && !(texte === ' ' && /^(?:\*{3}|_{3})$/.test(avantLe(view.state, from)))) return false
            view.dispatch(view.state.tr.insertText(texte, from, to))
            return true
          },
        },
      }),
    ]
  },
})

export const SaisieBlocs = Extension.create({
  name: 'saisieBlocs',
  priority: 1000,
  addExtensions() {
    return [AnnulationBlocs, FlechesBlocs, CollageBlocs, CopieBlocs, GardeMarques]
  },
  addInputRules() {
    const { link } = this.editor.schema.marks
    return [
      ...reglesDeType(),
      regleSeparateur(),
      ...DELIMITEURS.map(([delim, nom]) => regleMarque(delim, nom)),
      new InputRule({
        find: /\[([^\]]+)\]\((\S+)\)$/,
        handler: ({ state, range, match }) => {
          const [, texte, adresse] = match
          if (!texte || !adresse || !link) return
          state.tr.replaceWith(range.from, range.to, state.schema.text(texte, [link.create({ href: normaliserUrl(adresse) })]))
        },
      }),
      ...REMPLACEMENTS.map(([find, par]) => remplacer(find, par)),
      ...reglesDeGuillemets(),
    ]
  },
  addKeyboardShortcuts() {
    return {
      // ⌘Entrée coche une tâche, ouvre ou ferme un dépliant ; sur un texte, elle ne fait rien (NOTION.md § 5).
      'Mod-Enter': () => {
        basculer(this.editor)
        return true
      },
      // ⇧⌘S signale un bug, partout dans l'app (comme dans Silak) : le barré reste sur ⇧⌘X.
      'Mod-Shift-x': () => this.editor.commands.toggleStrike(),
    }
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      // Dans un encadré, les motifs de type ne convertissent rien : on écrit l'espace, et c'est tout.
      new Plugin({
        key: new PluginKey('motifsDansEncadre'),
        props: {
          handleTextInput: (view, from, to, texte) => {
            const { $from } = view.state.selection
            if ($from.parent.type.name !== 'encadreBloc' || !/^\s$/.test(texte)) return false
            if (!MOTIFS_DE_TYPE.test(avantLe(view.state, from) + texte)) return false
            view.dispatch(view.state.tr.insertText(texte, from, to))
            return true
          },
        },
      }),
      // Une mention est suivie d'une espace qu'on a écrite pour l'auteur ; une ponctuation tapée juste après la retire.
      new Plugin({
        key: new PluginKey('ponctuationApresMention'),
        props: {
          handleTextInput: (view, from, to, texte) => {
            if (from !== to || from < 2 || !/^[.,;?!)\]]$/.test(texte)) return false
            const { doc } = view.state
            const espace = doc.textBetween(from - 1, from, undefined, '￼')
            const mention = doc.resolve(from - 1).nodeBefore
            if (espace !== ' ' || !mention || (mention.type.name !== 'mention' && mention.type.name !== 'lienTableau')) return false
            view.dispatch(view.state.tr.insertText(texte, from - 1, from))
            return true
          },
        },
      }),
      new Plugin({
        key: new PluginKey('chiffresBlocs'),
        props: {
          handleKeyDown: (view, e) => {
            if (e.isComposing || view.composing) return false
            const mod = e.metaKey || e.ctrlKey
            // ⌘⌥\ efface la mise en forme, ⌘⌥T ouvre ou ferme tous les dépliants (NOTION.md § 5).
            if (mod && e.altKey && !e.shiftKey && e.code === 'Backslash') {
              e.preventDefault()
              return effacerFormat(editor)
            }
            if (mod && e.altKey && !e.shiftKey && e.code === 'KeyT') {
              e.preventDefault()
              return basculerDepliants(editor)
            }
            // ⌘⌥chiffre (macOS) ou Ctrl+Maj+chiffre (Windows, Linux) : « Transformer en ».
            const touche = (mod && e.altKey && !e.shiftKey) || (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)
            if (!touche) return false
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

/** Les marques que ⌘⌥\ retire : le gras, l'italique, le souligné, le barré, le code et les couleurs, mais pas le lien. */
const MARQUES_EFFACEES = ['bold', 'italic', 'underline', 'strike', 'code', 'textStyle', 'highlight']

/** ⌘⌥\ : retire la mise en forme du passage choisi (le lien reste). */
export function effacerFormat(editor: Editor): boolean {
  const c = editor.chain()
  for (const nom of MARQUES_EFFACEES) if (editor.schema.marks[nom]) c.unsetMark(nom)
  return c.run()
}

/** ⌘⌥T : ferme tous les dépliants si l'un est ouvert, sinon les ouvre tous. */
export function basculerDepliants(editor: Editor): boolean {
  const positions: [number, boolean][] = []
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === 'depliant' || (n.type.name === 'heading' && n.attrs.depliant)) positions.push([pos, n.attrs.ouvert !== false])
    return n.type.name === 'colonnes' || n.type.name === 'colonne'
  })
  if (positions.length === 0) return true
  const ouvrir = !positions.some(([, ouvert]) => ouvert)
  const tr = editor.state.tr
  for (const [pos] of positions) tr.setNodeAttribute(pos, 'ouvert', ouvrir)
  editor.view.dispatch(tr)
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
