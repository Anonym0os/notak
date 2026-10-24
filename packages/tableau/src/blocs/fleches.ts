import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { cache } from './clavier'
import { CONTENEURS } from './ids'
import { blocsDe } from './modele'
import { CLE_CHOIX } from './selection'

/**
 * Les flèches, ⌘A et le code en ligne (docs/NOTION.md § 5, relevé 1 § 4). Le navigateur gère les flèches au milieu du
 * texte, et d'un texte à l'autre ; ce plugin ne reprend la main que là où il ferait mal :
 * - **à travers un séparateur ou une image** : Haut, Bas, Gauche, Droite sautent le bloc sans texte, au lieu de le
 *   sélectionner, et arrivent dans le texte d'après, à la même colonne horizontale pour Haut et Bas ;
 * - **⌘A en deux temps** : le texte du bloc (ou des blocs touchés), puis tout le texte de la page ;
 * - **Droite après un code en ligne en fin de bloc** : le code se ferme et une espace est écrite ;
 * - **⌃A et ⌃E** (macOS) : début et fin de la ligne logique, entre deux retours à la ligne forcés.
 * Maj+flèche, et Échap, sont ceux de la sélection de blocs (`selection.ts`).
 */

/** Les blocs que les flèches enjambent : ils n'ont pas de texte où poser le curseur. */
export const SANS_TEXTE = new Set(['horizontalRule', 'image', 'apercuLien'])

/**
 * Là où une flèche arrive quand elle sort du bloc du curseur dans le sens `sens` : `null` si le bloc voisin a du texte
 * (le navigateur s'en charge) ; sinon la position du texte d'après les blocs sans texte, ou `false` s'il n'y a plus de
 * texte de ce côté (la flèche ne fait rien).
 */
export function apresLesBlocsSansTexte(state: EditorState, sens: 1 | -1): number | false | null {
  const { $from } = state.selection
  if (!$from.parent.isTextblock || $from.depth < 1) return null
  const conteneur = $from.node($from.depth - 1)
  if (!CONTENEURS.has(conteneur.type.name)) return null
  const index = $from.index($from.depth - 1)
  let j = index + sens
  if (j < 0 || j >= conteneur.childCount || !SANS_TEXTE.has(conteneur.child(j).type.name)) return null
  while (j >= 0 && j < conteneur.childCount && SANS_TEXTE.has(conteneur.child(j).type.name)) j += sens
  // La limite juste après le dernier bloc sauté, dans le sens de la flèche.
  let limite = $from.start($from.depth - 1)
  for (let k = 0; k < (sens > 0 ? j : j + 1); k++) limite += conteneur.child(k).nodeSize
  const blocs = blocsDe(state.doc)
  let cible = Selection.findFrom(state.doc.resolve(limite), sens, true)
  // Un bloc caché par un dépliant fermé n'a pas de curseur visible : on continue au-delà.
  while (cible) {
    const b = blocs.find((x) => x.pos <= cible!.from && cible!.from < x.pos + x.taille && state.doc.nodeAt(x.pos)?.isTextblock)
    if (!b || !cache(blocs, b)) break
    cible = Selection.findFrom(state.doc.resolve(sens > 0 ? b.fin : b.pos), sens, true)
  }
  return cible ? cible.from : false
}

/** Le curseur est-il au bord du bloc, dans le sens de la flèche horizontale ? */
const auBordDuBloc = (state: EditorState, sens: 1 | -1): boolean => {
  const { $from, empty } = state.selection
  return empty && (sens < 0 ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size)
}

/** Où commence et finit la ligne logique du curseur : entre deux retours à la ligne forcés. */
export function ligneLogique(parent: NoeudPM, decalage: number): [debut: number, fin: number] {
  let debut = 0
  let fin = parent.content.size
  parent.forEach((n, d) => {
    if (n.type.name !== 'hardBreak') return
    if (d + n.nodeSize <= decalage) debut = d + n.nodeSize
    else if (d >= decalage && fin === parent.content.size) fin = d
  })
  return [debut, fin]
}

/** La plage du texte des blocs de texte que la sélection touche : du début du premier à la fin du dernier. */
export function plageDesBlocs(state: EditorState): [number, number] | null {
  const { from, to } = state.selection
  let debut: number | null = null
  let fin = 0
  state.doc.nodesBetween(from, to, (n, pos, parent) => {
    if (!n.isTextblock || !parent || !CONTENEURS.has(parent.type.name)) return !n.isTextblock && n.type.name !== 'table'
    if (debut === null) debut = pos + 1
    fin = pos + 1 + n.content.size
    return false
  })
  return debut === null ? null : [debut, fin]
}

/** ⌘A : d'abord le texte du bloc, puis tout le texte de la page (NOTION.md § 5). */
export function toutSelectionner(state: EditorState): Selection | null {
  const plage = plageDesBlocs(state)
  if (!plage) return null
  const { from, to } = state.selection
  const page = TextSelection.create(state.doc, Selection.atStart(state.doc).from, Selection.atEnd(state.doc).to)
  // Rien à choisir de plus dans le bloc (vide, ou déjà tout choisi) : la page entière.
  if (plage[0] === plage[1] || (from === plage[0] && to === plage[1])) return page.eq(state.selection) ? state.selection : page
  return TextSelection.create(state.doc, plage[0], plage[1])
}

/** La sélection (sans la garder) quand Droite sort d'un code en ligne en fin de bloc : le code se ferme, une espace s'écrit. */
function sortirDuCode(view: EditorView): boolean {
  const { state } = view
  const { $from, empty } = state.selection
  const code = state.schema.marks.code
  if (!empty || !code || !$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size || $from.parentOffset === 0) return false
  if (!code.isInSet($from.marks())) return false
  const tr = state.tr.insert($from.pos, state.schema.text(' '))
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, $from.pos + 1)).setStoredMarks([]).scrollIntoView())
  return true
}

const macOS = () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** L'abscisse du curseur à l'écran, ou `null` quand la page n'a pas de mise en page. */
function abscisse(view: EditorView): number | null {
  try {
    return view.coordsAtPos(view.state.selection.head).left
  } catch {
    return null
  }
}

/** Pose le curseur à `pos` ; pour Haut et Bas, à l'abscisse `x` de la dernière (ou première) ligne du bloc d'arrivée. */
function aller(view: EditorView, pos: number, x: number | null, sens: 1 | -1 | 0) {
  let ou = pos
  if (x !== null && sens !== 0) {
    try {
      const $p = view.state.doc.resolve(pos)
      const bord = view.coordsAtPos(sens > 0 ? $p.start() : $p.end())
      const trouve = view.posAtCoords({ left: x, top: (bord.top + bord.bottom) / 2 })
      if (trouve && view.state.doc.resolve(trouve.pos).parent === $p.parent) ou = trouve.pos
    } catch {
      // Pas de mise en page : le bord du bloc d'arrivée.
    }
  }
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, ou)).scrollIntoView())
}

export const FlechesBlocs = Extension.create({
  name: 'flechesBlocs',
  // Après les menus et la sélection de blocs (1150), avant le noyau et le kit.
  priority: 1060,
  addProseMirrorPlugins() {
    // L'abscisse retenue par Haut et Bas : le plus grand de ce qui est retenu et de l'abscisse du curseur.
    let colonne: number | null = null
    return [
      new Plugin({
        key: new PluginKey('flechesBlocs'),
        props: {
          handleKeyDown(view, e) {
            if (e.isComposing || view.composing || e.key === 'Process') return false
            if (CLE_CHOIX.getState(view.state)) return false
            const mod = e.metaKey || e.ctrlKey
            const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown'
            if (!vertical && !['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) colonne = null
            if (e.key.toLowerCase() === 'a' && mod && !e.shiftKey && !e.altKey && (e.metaKey || !macOS())) {
              const choix = toutSelectionner(view.state)
              if (!choix) return false
              if (!choix.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(choix))
              return true
            }
            // ⌃A et ⌃E (macOS) : la ligne logique.
            if (macOS() && e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'a' || e.key === 'e')) {
              const { $head } = view.state.selection
              if (!$head.parent.isTextblock) return false
              const [debut, fin] = ligneLogique($head.parent, $head.parentOffset)
              const ou = $head.start() + (e.key === 'a' ? debut : fin)
              const tr = view.state.tr
              tr.setSelection(e.shiftKey ? TextSelection.create(tr.doc, view.state.selection.anchor, ou) : TextSelection.create(tr.doc, ou))
              view.dispatch(tr)
              return true
            }
            if (mod || e.altKey || e.shiftKey) return false
            if (e.key === 'ArrowRight' && sortirDuCode(view)) return true
            const sens = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0
            if (!sens || !view.state.selection.empty) return false
            if (vertical) {
              if (!view.endOfTextblock(sens < 0 ? 'up' : 'down')) return false
            } else if (!auBordDuBloc(view.state, sens)) return false
            const cible = apresLesBlocsSansTexte(view.state, sens)
            if (cible === null) return false
            if (cible !== false) {
              if (vertical) {
                const x = abscisse(view)
                colonne = x === null ? colonne : Math.max(colonne ?? x, x)
                aller(view, cible, colonne, sens)
              } else aller(view, cible, null, 0)
            }
            return true
          },
          handleDOMEvents: {
            mousedown: () => {
              colonne = null
              return false
            },
          },
        },
      }),
    ]
  },
})
