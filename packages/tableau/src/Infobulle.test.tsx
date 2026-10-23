// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELAI_INFOBULLE, FONDU_INFOBULLE, Infobulle, REPRISE_INFOBULLE, delaiAvantInfobulle, oublierInfobulle } from './Infobulle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('le délai d’une infobulle', () => {
  it('700 ms, sauf si l’on vient d’en quitter une', () => {
    expect(delaiAvantInfobulle(10_000, -Infinity)).toBe(DELAI_INFOBULLE)
    expect(delaiAvantInfobulle(10_000, 10_000 - REPRISE_INFOBULLE + 1)).toBe(0)
    expect(delaiAvantInfobulle(10_000, 10_000 - REPRISE_INFOBULLE)).toBe(DELAI_INFOBULLE)
  })
})

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  vi.useFakeTimers()
  oublierInfobulle()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  act(() =>
    racine.render(
      <Infobulle libelle="Rétablir" raccourci="⇧⌘Z">
        <button type="button">Ok</button>
      </Infobulle>,
    ),
  )
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.useRealTimers()
})

const survol = (type: 'pointerover' | 'pointerout') => act(() => void hote.querySelector('button')!.dispatchEvent(new MouseEvent(type, { bubbles: true })))
const bulle = () => hote.querySelector('.notak-infobulle')

describe('l’infobulle', () => {
  it('paraît après 700 ms de survol, avec son raccourci en pastilles', () => {
    survol('pointerover')
    act(() => void vi.advanceTimersByTime(DELAI_INFOBULLE - 1))
    expect(bulle()).toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(bulle()?.textContent).toContain('Rétablir')
    expect([...bulle()!.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['⇧', '⌘', 'Z'])
  })

  it('ne paraît pas si l’on repart avant le délai', () => {
    survol('pointerover')
    act(() => void vi.advanceTimersByTime(300))
    survol('pointerout')
    act(() => void vi.advanceTimersByTime(1000))
    expect(bulle()).toBeNull()
  })

  it('se retire après son fondu, et la suivante vient sans attendre', () => {
    survol('pointerover')
    act(() => void vi.advanceTimersByTime(DELAI_INFOBULLE))
    survol('pointerout')
    act(() => void vi.advanceTimersByTime(FONDU_INFOBULLE))
    expect(bulle()).toBeNull()
    survol('pointerover')
    act(() => void vi.advanceTimersByTime(1))
    expect(bulle()).not.toBeNull()
  })
})
