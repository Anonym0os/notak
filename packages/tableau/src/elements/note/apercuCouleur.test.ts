// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import { codesCouleur } from './apercuCouleur'
import { EXTENSIONS_NOTE } from './extensions'

const ouverts: Editor[] = []
afterEach(() => ouverts.splice(0).forEach((e) => e.destroy()))

const editeur = (texte: string, marques: { type: string }[] = []) => {
  const e = new Editor({
    extensions: EXTENSIONS_NOTE,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte, ...(marques.length ? { marks: marques } : {}) }] }] },
  })
  ouverts.push(e)
  return e
}
const pastilles = (e: Editor) => [...e.view.dom.querySelectorAll<HTMLElement>('.notak-apercu-couleur')]

describe('les codes couleur du texte', () => {
  it('se trouvent en début de texte ou après une espace, avant une espace ou la fin', () => {
    expect(codesCouleur('la #3a76df et rgb(1, 2, 3) puis hsl(0, 100%, 50%)').map((c) => [c.debut, c.fin, c.couleur])).toEqual([
      [3, 10, '#3a76df'],
      [14, 26, '#010203'],
      [32, 49, '#ff0000'],
    ])
    expect(codesCouleur('a#fff #fffz #12345 mot#abc')).toEqual([])
  })
})

describe("l'aperçu d'un code couleur", () => {
  it('pose une pastille devant le code, à sa couleur', () => {
    const e = editeur('fond #3a76df ici')
    e.commands.setTextSelection(1)
    expect(pastilles(e)).toHaveLength(1)
    expect(pastilles(e)[0]!.style.background).not.toBe('')
  })

  it('la cache tant que le curseur est dans le code', () => {
    const e = editeur('fond #3a76df ici')
    e.commands.setTextSelection(8)
    expect(pastilles(e)).toHaveLength(0)
    e.commands.setTextSelection(15)
    expect(pastilles(e)).toHaveLength(1)
  })

  it('ne regarde pas le code', () => {
    const e = editeur('#3a76df', [{ type: 'code' }])
    e.commands.setTextSelection(1)
    expect(pastilles(e)).toHaveLength(0)
  })
})
