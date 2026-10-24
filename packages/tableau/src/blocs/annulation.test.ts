// @vitest-environment jsdom
import Collaboration from '@tiptap/extension-collaboration'
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { FENETRE_MS, classeDe, rejoint } from './annulation'
import { entree, tab } from './clavier'
import { poserIds } from './ids'
import { yUndoPluginKey } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { EXTENSIONS_BLOCS, EXTENSIONS_BLOCS_PARTAGEE } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const p = (text: string): NoeudTexte => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })

function ouvrir(...blocs: NoeudTexte[]): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs.length ? blocs : [p('')] } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.atEnd(editeur.state.doc)))
  return editeur
}

/** Une frappe à l'instant `t` (millisecondes) : l'horloge de la transaction est posée à la main. */
function frapper(ed: Editor, c: string, t: number) {
  ed.view.dispatch(ed.state.tr.insertText(c).setTime(t))
}

const texte = (ed: Editor) => ed.state.doc.textContent

describe('annulation : la fenêtre des frappes', () => {
  it('une transaction rejoint le groupe dans les 700 ms depuis sa première, pas au-delà', () => {
    const g = { debut: 1000, classe: 'texte' as const, ferme: false }
    expect(rejoint(g, { time: 1000 + FENETRE_MS, classe: 'texte', apart: false })).toBe(true)
    expect(rejoint(g, { time: 1000 + FENETRE_MS + 1, classe: 'texte', apart: false })).toBe(false)
    expect(rejoint(g, { time: 1100, classe: 'bloc', apart: false })).toBe(false)
    expect(rejoint(g, { time: 1100, classe: 'texte', apart: true })).toBe(false)
    expect(rejoint({ ...g, ferme: true }, { time: 1100, classe: 'texte', apart: false })).toBe(false)
    expect(rejoint(null, { time: 1100, classe: 'texte', apart: false })).toBe(false)
  })

  it('la fenêtre est fixe : elle ne glisse pas avec les frappes', () => {
    const ed = ouvrir()
    // a, b, c dans la fenêtre ouverte à 10 000 ; d arrive à 10 701, chaque frappe à moins de 500 ms de la précédente.
    frapper(ed, 'a', 10_000)
    frapper(ed, 'b', 10_300)
    frapper(ed, 'c', 10_600)
    frapper(ed, 'd', 10_701)
    expect(texte(ed)).toBe('abcd')
    ed.commands.undo()
    expect(texte(ed)).toBe('abc')
    ed.commands.undo()
    expect(texte(ed)).toBe('')
  })

  it('une rafale longue fait plusieurs pas, chacun de 700 ms au plus', () => {
    const ed = ouvrir()
    for (let i = 0; i < 12; i++) frapper(ed, 'x', 20_000 + i * 300)
    // Fenêtres ouvertes à 0, 900 (le 4e), 1 800 (le 7e), 2 700 (le 10e) : quatre pas.
    let pas = 0
    while (texte(ed).length) {
      ed.commands.undo()
      pas++
    }
    expect(pas).toBe(4)
  })
})

describe('annulation : les gestes de bloc sont des pas à part', () => {
  it('Entrée n’est ni dans la frappe d’avant ni dans celle d’après', () => {
    const ed = ouvrir()
    frapper(ed, 'a', 30_000)
    frapper(ed, 'b', 30_050)
    ed.view.dispatch(entree(ed.state)!.setTime(30_100))
    frapper(ed, 'c', 30_150)
    expect((ed.getJSON().content ?? []).length).toBe(2)
    ed.commands.undo()
    expect(texte(ed)).toBe('ab')
    expect((ed.getJSON().content ?? []).length).toBe(2)
    ed.commands.undo()
    expect((ed.getJSON().content ?? []).length).toBe(1)
    expect(texte(ed)).toBe('ab')
    ed.commands.undo()
    expect(texte(ed)).toBe('')
  })

  it('un changement de type ne se regroupe pas avec la frappe d’avant', () => {
    const ed = ouvrir(p('a'))
    frapper(ed, 'b', 40_000)
    ed.view.dispatch(ed.state.tr.setNodeMarkup(0, ed.state.schema.nodes.puce!, ed.state.doc.child(0).attrs).setTime(40_100))
    expect(classeDe(ed.state.tr.setNodeMarkup(0, ed.state.schema.nodes.paragraph!, ed.state.doc.child(0).attrs))).toBe('bloc')
    ed.commands.undo()
    expect(ed.getJSON().content?.[0]?.type).toBe('paragraph')
    expect(texte(ed)).toBe('ab')
  })
})

describe('annulation : les raccourcis de saisie', () => {
  /** Tape comme au clavier : chaque caractère passe par les règles de saisie (à l'horloge réelle, comme la règle). */
  function taper(ed: Editor, s: string) {
    for (const c of s) {
      const { from, to } = ed.state.selection
      const pris = ed.view.someProp('handleTextInput', (f) => f(ed.view, from, to, c, () => ed.state.tr.insertText(c, from, to)))
      if (!pris) ed.view.dispatch(ed.state.tr.insertText(c, from, to))
    }
  }

  it('⌘Z juste après `# ` défait la conversion et rend le motif tapé', () => {
    const ed = ouvrir()
    taper(ed, '# ')
    expect(ed.getJSON().content?.[0]?.type).toBe('heading')
    expect(texte(ed)).toBe('')
    ed.commands.undo()
    expect(ed.getJSON().content?.[0]?.type).toBe('paragraph')
    expect(texte(ed)).toBe('# ')
    ed.commands.undo()
    expect(texte(ed)).toBe('')
  })

  it('⌘Z juste après `->` rend `->` ; la frappe qui suit n’est pas dans le même pas', () => {
    const ed = ouvrir()
    taper(ed, 'a ->')
    expect(texte(ed)).toBe('a →')
    taper(ed, 'b')
    ed.commands.undo()
    expect(texte(ed)).toBe('a →')
    ed.commands.undo()
    expect(texte(ed)).toBe('a ->')
  })
})

describe('annulation : avec le partage (Y.UndoManager)', () => {
  it('la fenêtre est la même : 700 ms fixes depuis la première frappe du groupe, un geste de bloc à part', () => {
    const doc = new Y.Doc()
    const ed = new Editor({ extensions: [...EXTENSIONS_BLOCS_PARTAGEE, Collaboration.configure({ fragment: doc.getXmlFragment('texte') })] })
    editeur = ed
    const ids = poserIds(ed.state)
    if (ids) ed.view.dispatch(ids)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.atEnd(ed.state.doc)))
    frapper(ed, 'a', 70_000)
    frapper(ed, 'b', 70_300)
    frapper(ed, 'c', 70_600)
    frapper(ed, 'd', 70_701)
    expect(texte(ed)).toBe('abcd')
    ed.commands.undo()
    expect(texte(ed)).toBe('abc')
    ed.commands.undo()
    expect(texte(ed)).toBe('')
    ed.commands.redo()
    ed.commands.redo()
    expect(texte(ed)).toBe('abcd')
    // Un geste de bloc (Tab) est un pas à part : [abc] [d] [Tab] [e]. Le contenu posé d'office (et ses ids, qui
    // entrent dans l'historique du geste qui crée les blocs) ferme son groupe avant qu'on frappe.
    ed.commands.setContent('<p>x</p><p></p>')
    ed.commands.setTextSelection(ed.state.doc.content.size - 1)
    yUndoPluginKey.getState(ed.state)!.undoManager.stopCapturing()
    const avant = yUndoPluginKey.getState(ed.state)!.undoManager.undoStack.length
    frapper(ed, 'a', 80_000)
    ed.view.dispatch(tab(ed.state, 1)!.setTime(80_050))
    frapper(ed, 'e', 80_100)
    expect(yUndoPluginKey.getState(ed.state)!.undoManager.undoStack.length - avant).toBe(3)
  })
})
