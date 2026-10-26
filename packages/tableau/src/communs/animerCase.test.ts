// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { animerCase } from './animerCase'

let case_: HTMLElement
beforeEach(() => {
  vi.useFakeTimers()
  case_ = document.createElement('button')
})
afterEach(() => vi.useRealTimers())

describe('l’animation d’une case', () => {
  it('se pose au geste, puis s’efface d’elle-même : 300 ms au cochage, 100 ms au décochage', () => {
    animerCase(case_, true)
    expect(case_.dataset.anime).toBe('coche')
    vi.advanceTimersByTime(299)
    expect(case_.dataset.anime).toBe('coche')
    vi.advanceTimersByTime(1)
    expect(case_.dataset.anime).toBeUndefined()
    animerCase(case_, false)
    expect(case_.dataset.anime).toBe('decoche')
    vi.advanceTimersByTime(100)
    expect(case_.dataset.anime).toBeUndefined()
  })

  it('un clic pendant l’animation la relance : le nettoyage du geste d’avant ne coupe pas le nouveau', () => {
    animerCase(case_, true)
    vi.advanceTimersByTime(100)
    animerCase(case_, false)
    vi.advanceTimersByTime(100)
    animerCase(case_, true)
    // Le nettoyage du premier geste tombe ici (300 ms) : le troisième continue.
    vi.advanceTimersByTime(100)
    expect(case_.dataset.anime).toBe('coche')
    vi.advanceTimersByTime(199)
    expect(case_.dataset.anime).toBe('coche')
    vi.advanceTimersByTime(1)
    expect(case_.dataset.anime).toBeUndefined()
  })

  it('chaque case a son geste : en animer une ne touche pas l’autre', () => {
    const autre = document.createElement('button')
    animerCase(case_, true)
    vi.advanceTimersByTime(150)
    animerCase(autre, true)
    vi.advanceTimersByTime(150)
    expect(case_.dataset.anime).toBeUndefined()
    expect(autre.dataset.anime).toBe('coche')
  })

  it('le même genre deux fois de suite repart de zéro', () => {
    animerCase(case_, true)
    vi.advanceTimersByTime(200)
    animerCase(case_, true)
    vi.advanceTimersByTime(200)
    expect(case_.dataset.anime).toBe('coche')
    vi.advanceTimersByTime(100)
    expect(case_.dataset.anime).toBeUndefined()
  })
})
