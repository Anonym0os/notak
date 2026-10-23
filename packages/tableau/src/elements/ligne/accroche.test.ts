// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELAI_DEDANS, suiviDedans, surbrillance } from './accroche'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('mode dedans (bout tenu immobile)', () => {
  it('s’active après 500 ms immobile au-dessus d’un élément', () => {
    const quand = vi.fn()
    const s = suiviDedans(quand)
    s.bouger('a')
    vi.advanceTimersByTime(DELAI_DEDANS - 1)
    expect(s.actif()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(s.actif()).toBe(true)
    expect(quand).toHaveBeenCalledOnce()
  })

  it('un mouvement relance le délai tant que le mode n’est pas pris', () => {
    const s = suiviDedans(() => {})
    s.bouger('a')
    vi.advanceTimersByTime(400)
    s.bouger('a')
    vi.advanceTimersByTime(400)
    expect(s.actif()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(s.actif()).toBe(true)
  })

  it('une fois pris, le mode reste sur le même élément et tombe quand on en change ou qu’on le quitte', () => {
    const s = suiviDedans(() => {})
    s.bouger('a')
    vi.advanceTimersByTime(DELAI_DEDANS)
    s.bouger('a')
    expect(s.actif()).toBe(true)
    s.bouger('b')
    expect(s.actif()).toBe(false)
    s.bouger(null)
    vi.advanceTimersByTime(DELAI_DEDANS * 2)
    expect(s.actif()).toBe(false)
  })
})

describe('surbrillance de la cible', () => {
  it('contourne un seul élément, en gris en mode dedans, et s’éteint', () => {
    const toile = document.createElement('div')
    toile.innerHTML = '<div class="notak-carte" data-id="a"></div><div class="notak-carte" data-id="b"></div>'
    const [a, b] = [...toile.children]
    surbrillance(toile, 'a')
    expect(a!.getAttribute('data-cible-ligne')).toBe('')
    surbrillance(toile, 'b', true)
    expect(a!.hasAttribute('data-cible-ligne')).toBe(false)
    expect(b!.getAttribute('data-cible-ligne')).toBe('dedans')
    surbrillance(toile, null)
    expect(b!.hasAttribute('data-cible-ligne')).toBe(false)
  })
})
