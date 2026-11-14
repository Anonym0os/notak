// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import './elements'
import { fermerMenus } from './menuUnique'
import { Toile } from './Toile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
})

const clicDroit = (cible: Element) => {
  const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 })
  act(() => void cible.dispatchEvent(e))
  return e
}

describe('le clic droit de la toile', () => {
  it('sur la toile, ouvre le menu de Notak à la place de celui du système', () => {
    act(() => racine.render(<Toile magasin={creerMagasin({ titre: '', etiquettes: [], elements: [] })} services={{}} />))
    expect(clicDroit(hote.querySelector('.notak-toile')!).defaultPrevented).toBe(true)
    expect(document.querySelector('.notak-menu-ctx')).not.toBeNull()
  })

  it('dans une note qu’on écrit, laisse celui du système (orthographe, presse-papiers) et n’ouvre pas le sien', async () => {
    act(() => racine.render(<Toile magasin={creerMagasin({ titre: '', etiquettes: [], elements: [] })} services={{}} />))
    // Un double-clic sur le vide crée une note et l'édite.
    act(() => void hote.querySelector('.notak-toile')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 300, clientY: 200 })))
    await act(async () => {})
    const texte = hote.querySelector('[data-edition] [contenteditable="true"]')
    expect(texte).not.toBeNull()
    expect(clicDroit(texte!).defaultPrevented).toBe(false)
    expect(document.querySelector('.notak-menu-ctx')).toBeNull()
  })
})
