import { Extension, Node } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type EditorState, TextSelection } from '@tiptap/pm/state'
import type { NoeudTexte } from '../../coeur/tableau'
import { PROFONDEUR_MAX, hauteur, peutDescendre } from './liste'

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

/** La case ronde : un nœud à elle, pour garder la main sur le clic (Maj+clic) et la zone de clic. */
const Tache = TaskItem.extend({
  content: 'paragraph taskList?',
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
      li.append(case_, contenu)
      const poser = (n: NoeudPM) => {
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

/** Tab et Maj+Tab restent dans la note, même quand il n'y a rien à faire. */
const ClavierTaches = Extension.create({
  name: 'clavierTaches',
  priority: 200,
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
      // Une tâche vide tout en haut n'a pas de niveau où remonter : on ne fait rien.
      Enter: ({ editor }) => {
        const [v] = tachesAutour(editor.state)
        return !!v && v.niveau === 1 && !!v.tache && v.tache.childCount === 1 && v.tache.textContent === ''
      },
    }
  },
})

export const EXTENSIONS_TACHES = [
  StarterKit.configure({
    document: false,
    heading: false,
    codeBlock: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    horizontalRule: false,
  }),
  Document,
  TaskList,
  Tache,
  ClavierTaches,
]
