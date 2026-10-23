// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fermerMenus } from '../../menuUnique'
import { EXTENSIONS_NOTE } from '../note/extensions'
import { ColonneOutils, outilsVisibles } from './ColonneOutils'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
const ouverts: Editor[] = []
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  ouverts.splice(0).forEach((e) => e.destroy())
})

function monter() {
  const editor = new Editor({ extensions: EXTENSIONS_NOTE, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }] } })
  ouverts.push(editor)
  act(() => racine.render(<ColonneOutils editor={editor} lien={null} surLien={() => {}} />))
  return editor
}
const outil = (nom: string) => hote.querySelector<HTMLButtonElement>(`button[aria-label="${nom}"]`)!

describe('la colonne d’outils du document', () => {
  it('Style de texte et Insérer portent leur nom, les autres sont des icônes seules', () => {
    monter()
    const tuiles = [...hote.querySelectorAll('.notak-document-tuile')].map((b) => b.textContent)
    expect(tuiles).toEqual(['Style de texte', 'Insérer'])
    expect(outil('Gras').textContent).toBe('')
    const noms = [...hote.querySelectorAll<HTMLButtonElement>('button.notak-outil-texte')].map((b) => b.getAttribute('aria-label'))
    expect(noms.slice(0, 7)).toEqual(['Gras', 'Italique', 'Puces', 'Numérotée', 'Retrait +', 'Retrait −', 'Centrer'])
  })

  it('le retrait est grisé hors d’une liste, le lien sans sélection', () => {
    monter()
    expect(outil('Retrait +').getAttribute('aria-disabled')).toBe('true')
    expect(outil('Lien').getAttribute('aria-disabled')).toBe('true')
    expect(outil('Gras').getAttribute('aria-disabled')).toBeNull()
  })

  it('le menu Insérer propose le séparateur et les émojis', () => {
    monter()
    act(() => hote.querySelectorAll<HTMLButtonElement>('.notak-document-tuile')[1]!.click())
    expect(hote.querySelector('[role="menu"]')?.textContent).toContain('Séparateur')
  })

  it('ce qui ne tient pas en hauteur passe derrière « ••• »', () => {
    expect(outilsVisibles(0, 11)).toBe(11)
    expect(outilsVisibles(600, 11)).toBeLessThan(11)
    expect(outilsVisibles(100, 11)).toBe(0)
  })
})
