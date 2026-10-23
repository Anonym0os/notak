// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELAI_PASTILLE_ZOOM, PastilleZoom } from './PastilleZoom'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  vi.useFakeTimers()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.useRealTimers()
})

const monter = (echelle: number, remettre = () => {}) => act(() => racine.render(<PastilleZoom echelle={echelle} remettre={remettre} />))
const pastille = () => hote.querySelector<HTMLButtonElement>('.notak-zoom-pastille')!
const visible = () => pastille().hasAttribute('data-visible')

describe('la pastille du zoom', () => {
  it('reste cachée à l’ouverture, même sur un tableau déjà zoomé', () => {
    monter(1.5)
    expect(visible()).toBe(false)
  })

  it('paraît à chaque changement, avec le pourcentage', () => {
    monter(1)
    monter(1.5)
    expect(visible()).toBe(true)
    expect(pastille().textContent).toBe('150 %')
  })

  it('disparaît une seconde après le dernier cran, pas avant', () => {
    monter(1)
    monter(1.2)
    act(() => void vi.advanceTimersByTime(DELAI_PASTILLE_ZOOM - 100))
    monter(1.5)
    act(() => void vi.advanceTimersByTime(DELAI_PASTILLE_ZOOM - 100))
    expect(visible()).toBe(true)
    act(() => void vi.advanceTimersByTime(100))
    expect(visible()).toBe(false)
  })

  it('un clic remet à 100 %', () => {
    const remettre = vi.fn()
    monter(1)
    monter(2, remettre)
    act(() => pastille().click())
    expect(remettre).toHaveBeenCalledOnce()
  })
})
