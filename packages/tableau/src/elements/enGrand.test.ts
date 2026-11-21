// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DUREE_TENUE, tenirLaPlace } from './enGrand'

describe('tenirLaPlace', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    for (const garde of document.querySelectorAll('.notak-place-tenue')) garde.remove()
  })

  it('libère la place à la fin du délai, quand le bouton est déjà relâché', () => {
    vi.useFakeTimers()
    tenirLaPlace(10, 10)
    expect(document.querySelector('.notak-place-tenue')).not.toBeNull()
    vi.advanceTimersByTime(DUREE_TENUE)
    expect(document.querySelector('.notak-place-tenue')).toBeNull()
  })

  // Le minuteur peut sonner après la fenêtre : à la fin d'un fichier d'essais, l'environnement suivant l'a déjà
  // retirée. Relue à ce moment, elle faisait tomber toute la suite (« window is not defined », 21/11/2026).
  it('libère la place même quand la fenêtre a disparu avant le minuteur', () => {
    vi.useFakeTimers()
    tenirLaPlace(10, 10)
    vi.stubGlobal('window', undefined)
    expect(() => vi.advanceTimersByTime(DUREE_TENUE)).not.toThrow()
    vi.unstubAllGlobals()
    expect(document.querySelector('.notak-place-tenue')).toBeNull()
  })
})
