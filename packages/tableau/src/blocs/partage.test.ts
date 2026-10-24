// @vitest-environment jsdom
import Collaboration from '@tiptap/extension-collaboration'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { EXTENSIONS_BLOCS_PARTAGEE } from './schema'
import { deplacer } from './gestes'
import { blocsDe } from './modele'
import { transformer } from './transformer'

const editeurs: Editor[] = []
afterEach(() => {
  for (const e of editeurs.splice(0)) e.destroy()
})

/** Deux personnes sur le même document : deux Y.Doc qui s'échangent leurs mises à jour. */
function aDeux() {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on('update', (u: Uint8Array, origine: unknown) => origine !== 'b' && Y.applyUpdate(b, u, 'a'))
  b.on('update', (u: Uint8Array, origine: unknown) => origine !== 'a' && Y.applyUpdate(a, u, 'b'))
  const ouvrir = (doc: Y.Doc) => {
    const e = new Editor({ extensions: [...EXTENSIONS_BLOCS_PARTAGEE, Collaboration.configure({ fragment: doc.getXmlFragment('texte') })] })
    editeurs.push(e)
    return e
  }
  return [ouvrir(a), ouvrir(b)] as const
}

describe('NOTION.md § 9 : le document écrit à plusieurs', () => {
  it('ce que l’un écrit, l’autre le lit, blocs et ids compris', () => {
    const [moi, autre] = aDeux()
    moi.commands.insertContent('Bonjour')
    transformer(moi, 'deroulant')
    expect(autre.getJSON()).toEqual(moi.getJSON())
    expect(autre.getJSON().content?.[0]?.type).toBe('depliant')
    expect(blocsDe(autre.state.doc)[0]?.id).toBeTruthy()
  })

  it('deux écritures en même temps ne s’écrasent pas', () => {
    const [moi, autre] = aDeux()
    moi.commands.setContent('<p>un</p><p>deux</p>')
    moi.commands.setTextSelection(3)
    moi.commands.insertContent('!')
    autre.commands.setTextSelection(autre.state.doc.content.size - 1)
    autre.commands.insertContent('?')
    expect(moi.state.doc.textContent).toBe('un!deux?')
    expect(autre.state.doc.textContent).toBe('un!deux?')
  })

  it('un bloc déplacé chez l’un se déplace chez l’autre, avec son id', () => {
    const [moi, autre] = aDeux()
    moi.commands.setContent('<p data-bloc="A">a</p><p data-bloc="B">b</p>')
    moi.view.dispatch(deplacer(moi.state, ['A'], 'B', 'dessous')!)
    expect(blocsDe(autre.state.doc).map((b) => b.id)).toEqual(['B', 'A'])
  })
})
