// @vitest-environment jsdom
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { MARQUE_FIL, filsDuTexte } from '../elements/note/fils'
import { blocSansTexteChoisi, filDuBlocChoisi, placeDuFil } from './commentaires'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})
const ouvrir = (content: NoeudTexte[]) => (editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content } }))

describe('NOTION.md § 9 : les commentaires sur tous les blocs', () => {
  it('un passage de code reçoit la marque d’un fil', () => {
    const ed = ouvrir([{ type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: 'const total = 1' }] }])
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 7, 12)))
    expect(ed.chain().setMark(MARQUE_FIL, { fil: 'f1' }).run()).toBe(true)
    expect(filsDuTexte(ed.getJSON() as NoeudTexte)).toEqual(['f1'])
    expect(placeDuFil(ed.state.doc, 'f1').texte).toBe('total')
  })

  it('une image choisie porte son fil dans son attribut, retrouvé comme un passage', () => {
    const ed = ouvrir([{ type: 'paragraph', content: [{ type: 'text', text: 'Avant' }] }, { type: 'image', attrs: { url: 'x.png' } }])
    const pos = ed.state.doc.child(0).nodeSize
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos)))
    expect(blocSansTexteChoisi(ed.state)?.pos).toBe(pos)
    ed.view.dispatch(ed.state.tr.setNodeAttribute(pos, 'fil', 'f2'))
    expect(filDuBlocChoisi(ed.state)).toBe('f2')
    expect(filsDuTexte(ed.getJSON() as NoeudTexte)).toEqual(['f2'])
    expect(placeDuFil(ed.state.doc, 'f2')).toMatchObject({ pos, texte: '' })
  })
})
