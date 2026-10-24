import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { blocA, decaler, dupliquer, racines, supprimer } from './gestes'
import { type Bloc, blocsDe } from './modele'

/**
 * La sélection de blocs (docs/NOTION.md § 7) : on est soit dans le texte, soit sur des blocs entiers. Elle va d'un bloc
 * d'ancrage à un bloc de tête, dans l'ordre de lecture ; l'état la garde par ids, donc elle survit aux gestes qui
 * déplacent les blocs. La sélection de l'éditeur couvre les mêmes blocs, pour que ⌘C, ⌘X et ⌘V fassent leur travail.
 */

export interface Choix {
  ancre: string
  tete: string
}

export const CLE_CHOIX = new PluginKey<Choix | null>('choixBlocs')

/** Les blocs qu'on parcourt aux flèches : ni les rangées ni les colonnes elles-mêmes, ni ce qu'un dépliant fermé cache. */
export function parcours(doc: NoeudPM): Bloc[] {
  const blocs = blocsDe(doc)
  const parId = new Map(blocs.map((b) => [b.id, b]))
  const cache = (b: Bloc) => {
    for (let p = b.parent ? parId.get(b.parent) : undefined; p; p = p.parent ? parId.get(p.parent) : undefined)
      if (p.type.startsWith('deroulant') || p.type.startsWith('titreDeroulant')) if (p.format.ouvert === false) return true
    return false
  }
  return blocs.filter((b) => b.id && b.type !== 'colonnes' && b.type !== 'colonne' && !cache(b))
}

/** Les ids des blocs choisis, d'ancre à tête, dans l'ordre de lecture. */
export function idsDuChoix(doc: NoeudPM, choix: Choix | null): string[] {
  if (!choix) return []
  const ordre = parcours(doc).map((b) => b.id!)
  const a = ordre.indexOf(choix.ancre)
  const t = ordre.indexOf(choix.tete)
  if (a < 0 || t < 0) return []
  return ordre.slice(Math.min(a, t), Math.max(a, t) + 1)
}

export const blocsChoisis = (state: EditorState): string[] => idsDuChoix(state.doc, CLE_CHOIX.getState(state) ?? null)

/** La transaction qui choisit des blocs (ou en sort, avec `null`) ; la sélection de l'éditeur les couvre. */
export function choisir(state: EditorState, choix: Choix | null, tr: Transaction = state.tr): Transaction {
  tr.setMeta(CLE_CHOIX, choix)
  const ids = idsDuChoix(tr.doc, choix)
  const r = racines(tr.doc, ids)
  if (r.length) {
    const premier = r[0]!
    const dernier = r[r.length - 1]!
    tr.setSelection(TextSelection.between(tr.doc.resolve(premier.pos), tr.doc.resolve(dernier.pos + dernier.noeud.nodeSize)))
  }
  return tr
}

/** Choisit le bloc qui contient la position (Échap, la poignée). */
export function choisirBlocA(view: EditorView, pos: number, etendre = false): boolean {
  const ou = blocA(view.state.doc.resolve(Math.min(pos, view.state.doc.content.size)))
  if (ou === null) return false
  const id = view.state.doc.nodeAt(ou)?.attrs.id as string | null
  if (!id) return false
  const avant = CLE_CHOIX.getState(view.state)
  view.dispatch(choisir(view.state, etendre && avant ? { ancre: avant.ancre, tete: id } : { ancre: id, tete: id }))
  return true
}

/** Sort de la sélection de blocs, le curseur à la fin du bloc de tête. */
function revenirAuTexte(view: EditorView, choix: Choix) {
  const b = blocsDe(view.state.doc).find((x) => x.id === choix.tete)
  const tr = view.state.tr.setMeta(CLE_CHOIX, null)
  if (b) tr.setSelection(TextSelection.near(tr.doc.resolve(b.pos + b.taille - 1), -1))
  view.dispatch(tr.scrollIntoView())
}

/** Les touches qui passent à l'éditeur même pendant la sélection de blocs : copier, couper, coller, annuler, tout choisir. */
const PASSENT = new Set(['c', 'x', 'v', 'z', 'y', 'a'])

function toucheDuChoix(view: EditorView, e: KeyboardEvent, choix: Choix): boolean {
  const { state } = view
  const mod = e.metaKey || e.ctrlKey
  const ids = idsDuChoix(state.doc, choix)
  // Après un déplacement, les mêmes blocs restent choisis.
  const garder = (tr: Transaction | null) => {
    if (tr) view.dispatch(choisir(state, choix, tr))
    return true
  }
  if (e.key === 'Escape') return false
  if (e.key === 'Enter' && !mod) {
    revenirAuTexte(view, choix)
    return true
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const tr = supprimer(state, ids)
    if (tr) view.dispatch(tr.setMeta(CLE_CHOIX, null))
    return true
  }
  if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return garder(decaler(state, ids, e.key === 'ArrowUp' ? -1 : 1))
  if (mod && e.key.toLowerCase() === 'd') {
    const tr = dupliquer(state, ids)
    if (tr) view.dispatch(tr.setMeta(CLE_CHOIX, null))
    return true
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const ordre = parcours(state.doc).map((b) => b.id!)
    const i = ordre.indexOf(choix.tete)
    const suivant = ordre[Math.max(0, Math.min(ordre.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)))]
    if (suivant) view.dispatch(choisir(state, e.shiftKey ? { ancre: choix.ancre, tete: suivant } : { ancre: suivant, tete: suivant }).scrollIntoView())
    return true
  }
  if (mod && PASSENT.has(e.key.toLowerCase())) return false
  // ⌘⌥chiffre, ⌘/ : la transformation s'applique aux blocs choisis par la sélection de l'éditeur.
  if (mod) return false
  // Une lettre tapée n'écrase rien (NOTION.md § 7).
  if (e.key.length === 1 || e.key === 'Tab') return true
  return false
}

export const SelectionBlocs = Extension.create({
  name: 'selectionBlocs',
  // Après les menus (« / », `@`), qui gardent leurs touches tant qu'ils sont ouverts.
  priority: 1150,
  addProseMirrorPlugins() {
    return [
      new Plugin<Choix | null>({
        key: CLE_CHOIX,
        state: {
          init: () => null,
          apply: (tr, avant) => {
            const meta = tr.getMeta(CLE_CHOIX) as Choix | null | undefined
            if (meta !== undefined) return meta
            if (!avant) return null
            // Un clic dans le texte, une frappe : on revient au texte.
            if (tr.selectionSet) return null
            return idsDuChoix(tr.doc, avant).length ? avant : null
          },
        },
        props: {
          decorations(state) {
            const choix = CLE_CHOIX.getState(state)
            if (!choix) return null
            const r = racines(state.doc, idsDuChoix(state.doc, choix))
            return DecorationSet.create(
              state.doc,
              r.map(({ pos, noeud }) => Decoration.node(pos, pos + noeud.nodeSize, { class: 'notak-bloc-choisi' })),
            )
          },
          attributes: (state): Record<string, string> => (CLE_CHOIX.getState(state) ? { 'data-choix-blocs': '' } : {}),
          handleKeyDown(view, e) {
            if (e.isComposing) return false
            const choix = CLE_CHOIX.getState(view.state)
            if (choix) return toucheDuChoix(view, e, choix)
            if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey) return choisirBlocA(view, view.state.selection.from)
            const mod = e.metaKey || e.ctrlKey
            const ici = blocA(view.state.selection.$from)
            const id = ici === null ? null : (view.state.doc.nodeAt(ici)?.attrs.id as string | null)
            if (!id || !mod) return false
            if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              const tr = decaler(view.state, [id], e.key === 'ArrowUp' ? -1 : 1)
              if (tr) view.dispatch(tr)
              return true
            }
            if (!e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
              const tr = dupliquer(view.state, [id])
              if (tr) view.dispatch(tr)
              return true
            }
            return false
          },
          handleDOMEvents: {
            // Un appui dans le texte quitte la sélection de blocs : l'éditeur, qui la couvre, y verrait le début d'un glisser.
            mousedown: (view, e) => {
              if (!CLE_CHOIX.getState(view.state) || e.shiftKey || e.button !== 0) return false
              const ou = view.posAtCoords({ left: e.clientX, top: e.clientY })
              const tr = view.state.tr.setMeta(CLE_CHOIX, null)
              if (ou) tr.setSelection(TextSelection.near(view.state.doc.resolve(ou.pos)))
              view.dispatch(tr)
              return false
            },
          },
          // Ce qui s'écrit sans touche (la dictée, un collage de texte brut) n'écrase pas non plus les blocs choisis.
          handleTextInput: (view) => !!CLE_CHOIX.getState(view.state),
          handleClick(view, pos, e) {
            const choix = CLE_CHOIX.getState(view.state)
            if (!choix || !e.shiftKey) return false
            return choisirBlocA(view, pos, true)
          },
        },
      }),
    ]
  },
})
