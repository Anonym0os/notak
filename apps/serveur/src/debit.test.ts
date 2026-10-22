import { describe, expect, it } from 'vitest'
import { creerLimiteur } from './debit.ts'

describe('limiteur', () => {
  it('refuse le onzième essai de la minute', () => {
    const l = creerLimiteur(10, 60_000)
    for (let i = 0; i < 10; i++) expect(l.autoriser('ip', 1_000 + i)).toBe(true)
    expect(l.autoriser('ip', 2_000)).toBe(false)
  })
  it('compte chaque clé à part', () => {
    const l = creerLimiteur(1, 60_000)
    expect(l.autoriser('a', 0)).toBe(true)
    expect(l.autoriser('b', 0)).toBe(true)
    expect(l.autoriser('a', 1)).toBe(false)
  })
  it('rouvre quand la fenêtre est passée', () => {
    const l = creerLimiteur(2, 60_000)
    l.autoriser('ip', 0)
    l.autoriser('ip', 10_000)
    expect(l.autoriser('ip', 59_999)).toBe(false)
    expect(l.autoriser('ip', 60_000)).toBe(true)
  })
  it('dit combien attendre', () => {
    const l = creerLimiteur(1, 60_000)
    l.autoriser('ip', 5_000)
    expect(l.attente('ip', 20_000)).toBe(45_000)
    expect(l.attente('autre', 20_000)).toBe(0)
  })
})
