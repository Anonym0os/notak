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
  // La toile prend le pointeur au premier toucher, pour tirer le fond.
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  HTMLElement.prototype.hasPointerCapture ??= () => false
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

/** Un toucher du doigt sur le vide, à l'instant voulu (jsdom n'a pas de PointerEvent : un MouseEvent qui en a les champs). */
function toucher(cible: Element, instant: number, x = 300, y = 200) {
  for (const type of ['pointerdown', 'pointerup']) {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: x, clientY: y })
    Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: 1 }, isPrimary: { value: true }, timeStamp: { value: instant } })
    act(() => void cible.dispatchEvent(e))
  }
}

function monter() {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
  act(() => racine.render(<Toile magasin={magasin} />))
  return { magasin, toile: hote.querySelector('.notak-toile')! }
}

describe('deux touchers sur le vide', () => {
  it('rapprochés, ils posent une note comme un double-clic', () => {
    const { magasin, toile } = monter()
    toucher(toile, 1000)
    toucher(toile, 1200)
    expect(magasin.lire().elements).toHaveLength(1)
  })

  it('espacés dans le temps ou sur l’écran, ils ne posent rien', () => {
    const { magasin, toile } = monter()
    toucher(toile, 1000)
    toucher(toile, 1600)
    toucher(toile, 3000, 300, 200)
    toucher(toile, 3100, 400, 300)
    expect(magasin.lire().elements).toHaveLength(0)
  })

  it('le double-clic que la webview en tirerait ensuite ne pose pas une seconde note', () => {
    const { magasin, toile } = monter()
    toucher(toile, 1000)
    toucher(toile, 1200)
    const clic = new MouseEvent('dblclick', { bubbles: true, clientX: 300, clientY: 200 })
    Object.defineProperty(clic, 'timeStamp', { value: 1400 })
    act(() => void toile.dispatchEvent(clic))
    expect(magasin.lire().elements).toHaveLength(1)
  })
})
