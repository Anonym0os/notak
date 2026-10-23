/**
 * Le titre d'une liste de tâches, dans le document comme chez Milanote : un nœud en tête (`titreListe`), facultatif,
 * d'une ligne ou plus, sans mise en forme. Il s'ajoute, se retire et se récupère avec ses mots : le texte du titre
 * retiré reste dans `Taches.titreCache` et revient au prochain ajout.
 *
 * Le contenu de l'élément garde son format (`titre` et `texte` séparés) pour tout ce qui le lit hors édition ;
 * `docEditeur` et `contenuDepuis` passent de l'un à l'autre aux deux bords de l'éditeur.
 */
import { Extension, Node } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { type Node as NoeudPM, Fragment } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import type { NoeudTexte, Taches } from '../../coeur/tableau'
import { docTaches } from './liste'

export const NOM_TITRE = 'titreListe'

/** Le titre : un `h2` d'une ligne, ou de plusieurs séparées par des retours à la ligne ; aucune marque. */
export const TitreListe = Node.create({
  name: NOM_TITRE,
  content: '(text | hardBreak)*',
  marks: '',
  defining: true,
  parseHTML: () => [{ tag: 'h2' }],
  renderHTML: () => ['h2', { class: 'notak-taches-titre' }, 0],
})

/** Le nœud JSON d'un titre : les retours à la ligne du texte deviennent des sauts de ligne. */
export function noeudTitre(texte: string): NoeudTexte {
  const content = texte
    .split('\n')
    .flatMap((ligne, i): NoeudTexte[] => [...(i > 0 ? [{ type: 'hardBreak' }] : []), ...(ligne ? [{ type: 'text', text: ligne }] : [])])
  return { type: NOM_TITRE, ...(content.length > 0 ? { content } : {}) }
}

/** Le texte d'un nœud titre, les sauts de ligne en retours à la ligne. */
export const texteDuTitre = (n: NoeudTexte): string => (n.content ?? []).map((x) => (x.type === 'hardBreak' ? '\n' : (x.text ?? ''))).join('')

/** Le document de l'éditeur : le titre s'il y en a un, puis la liste. */
export function docEditeur(c: Taches): NoeudTexte {
  return { type: 'doc', content: [...(c.titre !== undefined ? [noeudTitre(c.titre)] : []), ...docTaches(c.texte).content!] }
}

/**
 * Le contenu de l'élément d'après le document de l'éditeur. Sans titre dans le document, le titre d'avant (s'il
 * disait quelque chose) passe en `titreCache`.
 */
export function contenuDepuis(json: NoeudTexte, avant: Taches): Taches {
  const [premier, ...reste] = json.content ?? []
  const titre = premier?.type === NOM_TITRE ? premier : undefined
  const { titre: ancien, titreCache, ...sans } = avant
  const cache = ancien ? ancien : titreCache
  return {
    ...sans,
    ...(titre ? { titre: texteDuTitre(titre) } : cache ? { titreCache: cache } : {}),
    texte: { ...json, content: titre ? reste : (json.content ?? []) },
  }
}

/** Le contenu sans titre : son texte reste caché, il reviendra avec `avecTitre`. */
export function sansTitre(c: Taches): Taches {
  const { titre, ...reste } = c
  return titre ? { ...reste, titreCache: titre } : reste
}

/** Le contenu avec un titre : celui qu'on avait retiré, sinon un titre vide. Rien ne change s'il en a un. */
export function avecTitre(c: Taches): Taches {
  if (c.titre !== undefined) return c
  const { titreCache, ...reste } = c
  return { ...reste, titre: titreCache ?? '' }
}

/** Le titre de la liste en édition, avec sa position. */
export function titreDe(doc: NoeudPM): { noeud: NoeudPM; pos: 0 } | null {
  const premier = doc.firstChild
  return premier?.type.name === NOM_TITRE ? { noeud: premier, pos: 0 } : null
}

/** Met le curseur au bout du titre. */
export function curseurAuTitre(editor: Editor) {
  const t = titreDe(editor.state.doc)
  if (!t) return
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, t.noeud.nodeSize - 1)).scrollIntoView())
  editor.view.focus()
}

/** Met le curseur au début de la première tâche. */
function curseurPremiereTache(editor: Editor) {
  const debut = (titreDe(editor.state.doc)?.noeud.nodeSize ?? 0) + 3
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(debut))).scrollIntoView())
  editor.view.focus()
}

/** Ajoute le titre (avec `texte`, vide par défaut) et y met le curseur ; sans effet s'il existe. */
export function ajouterTitre(editor: Editor, texte = ''): boolean {
  if (titreDe(editor.state.doc)) return false
  const noeud = editor.state.schema.nodeFromJSON(noeudTitre(texte))
  const tr = editor.state.tr.insert(0, noeud)
  tr.setSelection(TextSelection.create(tr.doc, noeud.nodeSize - 1))
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
  return true
}

/** Retire le titre ; le curseur passe au début de la première tâche. Rend le texte retiré, `null` s'il n'y en avait pas. */
export function retirerTitre(editor: Editor): string | null {
  const t = titreDe(editor.state.doc)
  if (!t) return null
  editor.view.dispatch(editor.state.tr.delete(0, t.noeud.nodeSize))
  curseurPremiereTache(editor)
  return t.noeud.textBetween(0, t.noeud.content.size, undefined, '\n')
}

/** Une tâche neuve tout en haut de la liste, curseur dedans. */
export function tacheEnTete(editor: Editor, coche = false, contenu: Fragment = Fragment.empty) {
  const { schema } = editor.state
  const debut = titreDe(editor.state.doc)?.noeud.nodeSize ?? 0
  const tache = schema.nodes.taskItem!.create({ checked: coche }, schema.nodes.paragraph!.create(null, contenu))
  // Dans la liste : après son ouverture.
  const tr = editor.state.tr.insert(debut + 1, tache)
  tr.setSelection(TextSelection.create(tr.doc, debut + 3))
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
}

/** `[] ` (ou `[x] `) tapé au début du titre : le titre devient une tâche en tête de liste, le reste du texte avec. */
const CASE_EN_TETE = /^\[([ xX]?)\]$/

/**
 * Entrée, Retour arrière et les règles de saisie du titre :
 * - Entrée dans le titre : une tâche neuve en tête de liste, curseur dedans (la première tâche ne sert pas).
 * - Retour arrière dans le titre vide : il disparaît, le curseur va au début de la première tâche.
 * - `[] ` au début du titre : le titre devient une tâche.
 * - `# ` dans la première tâche, quand la liste n'a pas de titre : la tâche devient le titre.
 */
export const ClavierTitre = Extension.create({
  name: 'clavierTitre',
  priority: 300,
  addKeyboardShortcuts() {
    const dansTitre = (editor: Editor) => {
      const { $from, empty } = editor.state.selection
      return empty && $from.parent.type.name === NOM_TITRE
    }
    return {
      Enter: ({ editor }) => {
        if (!dansTitre(editor)) return false
        tacheEnTete(editor)
        return true
      },
      Backspace: ({ editor }) => {
        if (!dansTitre(editor) || editor.state.selection.$from.parent.content.size > 0) return false
        retirerTitre(editor)
        return true
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput(view, from, to, texte) {
            if (texte !== ' ' || from !== to) return false
            const { state } = view
            const $from = state.doc.resolve(from)
            // `[] ` au début du titre.
            if ($from.parent.type.name === NOM_TITRE) {
              const avant = $from.parent.textBetween(0, $from.parentOffset)
              const c = CASE_EN_TETE.exec(avant)
              if (!c) return false
              const reste = $from.parent.content.cut($from.parentOffset)
              const { schema } = state
              const tache = schema.nodes.taskItem!.create({ checked: c[1]!.toLowerCase() === 'x' }, schema.nodes.paragraph!.create(null, reste))
              const titre = $from.parent.nodeSize
              const tr = state.tr.delete(0, titre)
              tr.insert(1, tache)
              tr.setSelection(TextSelection.create(tr.doc, 3))
              view.dispatch(tr.scrollIntoView())
              return true
            }
            // `# ` dans la première tâche d'une liste sans titre.
            const { schema } = state
            if ($from.depth !== 3 || $from.parent.type.name !== 'paragraph' || $from.node(2).type.name !== 'taskItem') return false
            if (titreDe(state.doc) || $from.index(1) !== 0 || $from.parent.textContent !== '#' || $from.parentOffset !== 1) return false
            const tache = $from.node(2)
            const liste = $from.node(1)
            const vide = schema.nodeFromJSON(noeudTitre(''))
            const tr = state.tr
            if (liste.childCount > 1 && tache.childCount === 1) {
              const debut = $from.before(2)
              tr.delete(debut, debut + tache.nodeSize)
            } else tr.delete($from.start(), $from.start() + 1)
            tr.insert(0, vide)
            tr.setSelection(TextSelection.create(tr.doc, 1))
            view.dispatch(tr.scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})
