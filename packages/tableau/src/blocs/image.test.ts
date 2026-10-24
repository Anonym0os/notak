// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
  document.body.replaceChildren()
})

function ouvrir(legende = ''): { ed: Editor; figure: HTMLElement } {
  const element = document.createElement('div')
  document.body.append(element)
  editeur = new Editor({
    element,
    extensions: EXTENSIONS_BLOCS,
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Avant' }] },
        { type: 'image', attrs: { url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', legende } },
        { type: 'paragraph', content: [{ type: 'text', text: 'Après' }] },
      ],
    },
  })
  return { ed: editeur, figure: editeur.view.dom.querySelector<HTMLElement>('figure.notak-image-bloc')! }
}

const image = (ed: Editor) => ed.state.doc.child(1).attrs
const boutons = (figure: HTMLElement) => [...figure.querySelectorAll<HTMLButtonElement>('.notak-image-barre button')]

describe('NOTION.md § 2 : la barre de l’image', () => {
  it('aligne l’image et marque l’alignement choisi', () => {
    const { ed, figure } = ouvrir()
    boutons(figure)[0]!.click()
    expect(image(ed).alignement).toBe('gauche')
    expect(figure.dataset.alignement).toBe('gauche')
    expect(figure.querySelector('[data-actif="true"]')?.getAttribute('data-valeur')).toBe('gauche')
  })

  it('« Légende » ouvre une légende à écrire, Entrée l’écrit et repasse sous l’image', () => {
    const { ed, figure } = ouvrir()
    expect(figure.querySelector('figcaption')).toBeNull()
    boutons(figure)[3]!.click()
    const legende = figure.querySelector('figcaption')!
    expect(document.activeElement).toBe(legende)
    legende.textContent = '  Un port  '
    legende.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(image(ed).legende).toBe('Un port')
    expect(ed.state.selection.$from.parent.textContent).toBe('Après')
  })

  it('une légende vidée part avec son invite', () => {
    const { ed, figure } = ouvrir('Un port')
    const legende = figure.querySelector('figcaption')!
    legende.focus()
    legende.textContent = ''
    legende.blur()
    expect(image(ed).legende).toBe('')
    expect(figure.querySelector('figcaption')).toBeNull()
  })
})
