import { Extension, Node } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Fragment, type Node as NoeudPM, Slice } from '@tiptap/pm/model'
import { type EditorState, Plugin, TextSelection } from '@tiptap/pm/state'
import type { MutableRefObject } from 'react'
import type { NoeudTexte } from '../../coeur/tableau'
import { htmlEnTaches } from './html'
import { PROFONDEUR_MAX, hauteur, lignesEnTaches, peutDescendre } from './liste'
import { type GenrePuce, jourDe, puces } from './puces'

/** Le document n'est qu'une liste de tâches. */
const Document = Node.create({ name: 'doc', topNode: true, content: 'taskList' })

/** Pose `checked` sur la tâche en `pos` et, en cascade, sur toutes ses sous-tâches. */
export function cocherDansEditeur(editor: Editor, pos: number, enCascade: boolean) {
  const { tr } = editor.state
  const tache = tr.doc.nodeAt(pos)
  if (!tache || tache.type.name !== 'taskItem') return
  const fait = !tache.attrs.checked
  tr.setNodeMarkup(pos, undefined, { ...tache.attrs, checked: fait })
  if (enCascade) {
    tache.descendants((n, p) => {
      if (n.type.name === 'taskItem') tr.setNodeMarkup(pos + 1 + p, undefined, { ...n.attrs, checked: fait })
    })
  }
  editor.view.dispatch(tr)
}

/** Qui ouvre le menu d'une puce, par éditeur : la vue du nœud est du DOM nu, le menu est en React (voir `Taches.tsx`). */
export const ouvreursPuces = new WeakMap<Editor, (genre: GenrePuce, pos: number, ancre: HTMLElement) => void>()

/** Les attributs d'une tâche qui ne se recopient pas sur la tâche née d'une scission (Entrée). */
const attributTexte = (nom: string) => ({
  default: null,
  keepOnSplit: false,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${nom}`),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[nom] ? { [`data-${nom}`]: String(attrs[nom]) } : {}),
})

/** La case ronde : un nœud à elle, pour garder la main sur le clic (Maj+clic) et la zone de clic. */
const Tache = TaskItem.extend({
  content: 'paragraph taskList?',
  addAttributes() {
    return { ...this.parent?.(), echeance: attributTexte('echeance'), assigne: attributTexte('assigne') }
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const li = document.createElement('li')
      const case_ = document.createElement('span')
      const contenu = document.createElement('div')
      case_.className = 'notak-case'
      case_.contentEditable = 'false'
      case_.setAttribute('role', 'checkbox')
      case_.addEventListener('mousedown', (e) => e.preventDefault())
      case_.addEventListener('click', (e) => {
        e.preventDefault()
        const pos = getPos()
        if (typeof pos === 'number') cocherDansEditeur(editor, pos, e.shiftKey)
      })
      // Au survol, de quoi retirer la tâche (et ses sous-tâches).
      const suppr = document.createElement('span')
      suppr.className = 'notak-tache-suppr'
      suppr.contentEditable = 'false'
      suppr.title = 'Supprimer la tâche'
      suppr.addEventListener('mousedown', (e) => e.preventDefault())
      suppr.addEventListener('click', (e) => {
        e.preventDefault()
        const pos = getPos()
        if (typeof pos === 'number') retirerDansEditeur(editor, pos)
      })
      // À droite du texte : l'échéance, la personne.
      const zonePuces = document.createElement('span')
      zonePuces.className = 'notak-puces'
      zonePuces.contentEditable = 'false'
      li.append(case_, contenu, zonePuces, suppr)
      const dessinerPuces = (n: NoeudPM) => {
        zonePuces.replaceChildren(
          ...puces(n.attrs, jourDe(new Date())).map((p) => {
            const b = document.createElement('button')
            b.type = 'button'
            b.tabIndex = -1
            b.className = 'notak-puce'
            b.dataset.genre = p.genre
            if (p.vide) b.dataset.vide = ''
            if (p.retard) b.dataset.retard = ''
            b.title = p.titre
            b.textContent = p.texte
            if (p.teinte) b.style.setProperty('--teinte', p.teinte)
            b.addEventListener('mousedown', (e) => e.preventDefault())
            b.addEventListener('click', (e) => {
              e.preventDefault()
              const pos = getPos()
              if (typeof pos === 'number') ouvreursPuces.get(editor)?.(p.genre, pos, b)
            })
            return b
          }),
        )
      }
      const poser = (n: NoeudPM) => {
        dessinerPuces(n)
        li.dataset.type = 'taskItem'
        li.dataset.checked = String(n.attrs.checked === true)
        case_.setAttribute('aria-checked', String(n.attrs.checked === true))
      }
      poser(node)
      return {
        dom: li,
        contentDOM: contenu,
        update(n) {
          if (n.type !== node.type) return false
          poser(n)
          return true
        },
      }
    }
  },
}).configure({ nested: true })

/** Retire la tâche en `pos` ; seule dans sa liste, elle emporte la liste, ou laisse une tâche vide tout en haut. */
export function retirerDansEditeur(editor: Editor, pos: number) {
  const { state } = editor
  const tache = state.doc.nodeAt(pos)
  if (!tache) return
  const $pos = state.doc.resolve(pos)
  const liste = $pos.parent
  const tr = state.tr
  if (liste.childCount > 1) tr.delete(pos, pos + tache.nodeSize)
  else if ($pos.depth > 1) tr.delete(pos - 1, pos + tache.nodeSize + 1)
  else tr.replaceWith(pos, pos + tache.nodeSize, state.schema.nodes.taskItem!.create({ checked: false }, state.schema.nodes.paragraph!.create()))
  editor.view.dispatch(tr)
}

/** Ce que l'éditeur demande à la liste autour de lui. */
export interface GestesTaches {
  /** La liste a-t-elle un titre ? */
  aUnTitre(): boolean
  /** Met le curseur au bout du titre, après l'avoir créé vide s'il n'existait pas. */
  versTitre(): void
  /** La liste vide part à la corbeille. */
  jeter(): void
}

/**
 * Retour arrière dans la première tâche, vide : avec d'autres tâches, elle devient le titre ; seule, le curseur
 * remonte au titre, ou la liste part à la corbeille s'il n'y en a pas.
 */
export const clavierListe = (gestes: MutableRefObject<GestesTaches>) => {
  const retour = ({ editor }: { editor: Editor }) => {
    const { $from, empty } = editor.state.selection
    if (!empty || $from.parentOffset !== 0 || $from.depth !== 3) return false
    const tache = $from.node(2)
    if ($from.index(1) !== 0 || tache.childCount > 1 || tache.textContent !== '') return false
    const liste = $from.node(1)
    if (liste.childCount > 1) {
      const pos = $from.before(2)
      editor.view.dispatch(editor.state.tr.delete(pos, pos + tache.nodeSize))
      gestes.current.versTitre()
    } else if (gestes.current.aUnTitre()) gestes.current.versTitre()
    else gestes.current.jeter()
    return true
  }
  // Cmd ou Alt + retour arrière sur une tâche vide : comme le retour arrière seul (voir `ClavierTaches`).
  const retourModifie = (p: { editor: Editor }) => texteVide(p.editor.state) && retour(p)
  return Extension.create({
    name: 'clavierListe',
    priority: 300,
    addKeyboardShortcuts() {
      return { Backspace: retour, 'Mod-Backspace': retourModifie, 'Alt-Backspace': retourModifie }
    },
  })
}

/** Le curseur est dans le texte d'une tâche, et ce texte est vide. */
export function texteVide(etat: EditorState): boolean {
  const { $from, empty } = etat.selection
  return empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.node(-1).type.name === 'taskItem'
}

/** Les tâches parmi les ancêtres de la sélection : leur niveau (1 = en haut) et leur hauteur. */
function tachesAutour(etat: EditorState) {
  const { $from, $to } = etat.selection
  const vues = [$from, $to].map((p) => {
    let niveau = 0
    let derniere: NoeudPM | null = null
    for (let d = p.depth; d > 0; d--) {
      const n = p.node(d)
      if (n.type.name !== 'taskItem') continue
      niveau += 1
      derniere ??= n
    }
    return { niveau, tache: derniere }
  })
  return vues
}

/**
 * Retour arrière au début d'une tâche : son texte rejoint la tâche d'avant (la dernière sous-tâche
 * de la précédente, s'il y en a), et ses propres sous-tâches la suivent. Sans tâche d'avant dans sa liste,
 * en haut on ne fait rien, plus bas Tiptap la remonte d'un niveau (rend faux).
 */
export function fusionnerAvecPrecedente(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  const profItem = $from.depth - 1
  if (!empty || $from.parentOffset !== 0 || profItem < 1 || $from.node(profItem).type.name !== 'taskItem') return false
  const indice = $from.index(profItem - 1)
  const niveau = tachesAutour(state)[0]!.niveau
  if (indice === 0) return niveau === 1

  const item = $from.node(profItem)
  const posItem = $from.before(profItem)
  let cible = $from.node(profItem - 1).child(indice - 1)
  let posCible = posItem - cible.nodeSize
  let niveauCible = niveau
  while (cible.childCount > 1) {
    const sous = cible.child(1)
    const derniere = sous.lastChild!
    posCible += 2 + cible.child(0).nodeSize + sous.content.size - derniere.nodeSize
    cible = derniere
    niveauCible += 1
  }
  if (niveauCible + hauteur(item.toJSON() as NoeudTexte) - 1 > PROFONDEUR_MAX) return true

  const finTexte = posCible + cible.child(0).nodeSize
  const tr = state.tr.delete(posItem, posItem + item.nodeSize)
  if (item.childCount > 1) tr.insert(finTexte + 1, item.child(1))
  tr.insert(finTexte, item.child(0).content)
  tr.setSelection(TextSelection.create(tr.doc, finTexte))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Cmd ou Alt + retour arrière sur une tâche vide la réduit : elle se fond dans la précédente, ou, première
 * de sa sous-liste, remonte d'un niveau. Sur une tâche qui a du texte, c'est l'effacement d'un mot, comme partout.
 */
export function reduireVide(editor: Editor): boolean {
  if (!texteVide(editor.state)) return false
  if (fusionnerAvecPrecedente(editor)) return true
  editor.commands.liftListItem('taskItem')
  return true
}

/** La profondeur des nœuds ouverts au bout d'un nœud, jusqu'à son dernier bloc de texte (compris). */
function ouvertsAuBout(n: NoeudPM | null): number {
  let d = 0
  while (n && !n.isTextblock) {
    n = n.lastChild
    d++
  }
  return d + 1
}

/**
 * Des lignes ou une liste collées (d'un autre logiciel) deviennent des tâches ; ce qui vient de Notak se colle tel quel.
 * Le HTML passe en premier (puces et sous-listes de Google Docs), le texte brut sinon.
 */
const CollageEnTaches = new Plugin({
  props: {
    handlePaste(view, event) {
      const donnees = event.clipboardData
      const html = donnees?.getData('text/html') ?? ''
      if (!donnees || html.includes('data-pm-slice')) return false
      const taches = htmlEnTaches(html) ?? lignesEnTaches(donnees.getData('text/plain'))
      if (!taches) return false
      const noeuds = taches.map((t) => view.state.schema.nodeFromJSON(t))
      const tranche = new Slice(Fragment.fromArray(noeuds), 2, ouvertsAuBout(noeuds.at(-1) ?? null))
      view.dispatch(view.state.tr.replaceSelection(tranche).scrollIntoView())
      return true
    },
  },
})

/** Tab et Maj+Tab restent dans la note, même quand il n'y a rien à faire. */
const ClavierTaches = Extension.create({
  name: 'clavierTaches',
  priority: 200,
  addProseMirrorPlugins() {
    return [CollageEnTaches]
  },
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const ok = tachesAutour(editor.state).every(
          (v) => v.tache && peutDescendre(v.niveau, hauteur(v.tache.toJSON() as NoeudTexte)),
        )
        if (ok) editor.commands.sinkListItem('taskItem')
        return true
      },
      'Shift-Tab': ({ editor }) => {
        if (tachesAutour(editor.state).every((v) => v.niveau >= 2)) editor.commands.liftListItem('taskItem')
        return true
      },
      Backspace: ({ editor }) => fusionnerAvecPrecedente(editor),
      'Mod-Backspace': ({ editor }) => reduireVide(editor),
      'Alt-Backspace': ({ editor }) => reduireVide(editor),
      // Une tâche vide tout en haut n'a pas de niveau où remonter : on ne fait rien.
      Enter: ({ editor }) => {
        const [v] = tachesAutour(editor.state)
        return !!v && v.niveau === 1 && !!v.tache && v.tache.childCount === 1 && v.tache.textContent === ''
      },
    }
  },
})

const KIT_TACHES = {
  document: false,
  heading: false,
  codeBlock: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  horizontalRule: false,
} as const

export const EXTENSIONS_TACHES = [
  StarterKit.configure(KIT_TACHES),
  Document,
  TaskList,
  Tache,
  ClavierTaches,
]

/** Les mêmes, quand la liste s'écrit à plusieurs : l'annulation est alors celle du partage (voir `partage.ts`). */
export const EXTENSIONS_TACHES_PARTAGEE = [StarterKit.configure({ ...KIT_TACHES, undoRedo: false }), ...EXTENSIONS_TACHES.slice(1)]
