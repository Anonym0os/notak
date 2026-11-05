// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ECART_MIN_MS, RELIRE_MS, memeLecture, useRelecture } from './relecture'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let cache = false
beforeEach(() => {
  vi.useFakeTimers()
  cache = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => cache })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  vi.useRealTimers()
})

function Relecture({ relire, actif }: { relire: () => void; actif: boolean }) {
  useRelecture(relire, actif)
  return null
}
const monter = (actif = true) => {
  const relire = vi.fn()
  act(() => racine.render(<Relecture relire={relire} actif={actif} />))
  return relire
}
const passer = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const toucher = (touche: Partial<KeyboardEventInit>) => {
  const e = new KeyboardEvent('keydown', { cancelable: true, ...touche })
  act(() => void window.dispatchEvent(e))
  return e
}

describe('la bibliothèque d’un serveur se relit d’elle-même', () => {
  it('toutes les quinze secondes tant qu’on la regarde, jamais cachée', () => {
    const relire = monter()
    passer(RELIRE_MS - 1)
    expect(relire).not.toHaveBeenCalled()
    passer(1)
    expect(relire).toHaveBeenCalledTimes(1)
    cache = true
    passer(RELIRE_MS * 3)
    expect(relire).toHaveBeenCalledTimes(1)
  })

  it('en revenant sur elle : l’onglet repris, l’app au premier plan, la fenêtre de nouveau active, une seule fois', () => {
    const relire = monter()
    passer(ECART_MIN_MS)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(relire).toHaveBeenCalledTimes(1)
    passer(ECART_MIN_MS)
    act(() => void window.dispatchEvent(new Event('pageshow')))
    expect(relire).toHaveBeenCalledTimes(2)
  })

  it('juste ouverte, elle vient de se lire : le focus qui suit ne la relit pas', () => {
    const relire = monter()
    act(() => void window.dispatchEvent(new Event('focus')))
    expect(relire).not.toHaveBeenCalled()
  })

  it('dans l’app, ⌘R, Ctrl+R ou F5 la relisent ; le navigateur, lui, garde son rechargement', () => {
    const relire = monter()
    expect(toucher({ key: 'r', metaKey: true }).defaultPrevented).toBe(false)
    expect(relire).not.toHaveBeenCalled()
    ;(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    expect(toucher({ key: 'r', metaKey: true }).defaultPrevented).toBe(true)
    expect(toucher({ key: 'R', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(toucher({ key: 'F5' }).defaultPrevented).toBe(true)
    expect(relire).toHaveBeenCalledTimes(3)
    // ⇧⌘R, ⌥⌘R : d'autres gestes.
    expect(toucher({ key: 'r', metaKey: true, shiftKey: true }).defaultPrevented).toBe(false)
    expect(relire).toHaveBeenCalledTimes(3)
  })

  it('éteinte (les toiles de l’appareil préviennent d’elles-mêmes), elle ne fait rien', () => {
    const relire = monter(false)
    passer(RELIRE_MS * 2)
    act(() => void window.dispatchEvent(new Event('focus')))
    expect(relire).not.toHaveBeenCalled()
  })

  it('démontée, elle s’arrête', () => {
    const relire = monter()
    act(() => racine.render(null))
    passer(RELIRE_MS * 2)
    expect(relire).not.toHaveBeenCalled()
  })

  it('deux lectures qui disent la même chose sont la même', () => {
    expect(memeLecture([{ a: 1 }], [{ a: 1 }])).toBe(true)
    expect(memeLecture([{ a: 1 }], [{ a: 2 }])).toBe(false)
  })
})
