import { describe, expect, test } from 'vitest'
import { avecTexteLegende } from './LegendeLocale'

describe('la légende d’une carte', () => {
  test('un texte vide retire la clé', () => {
    const c = { type: 'croquis' as const, traits: [], legende: 'Vue de face' }
    expect(avecTexteLegende(c, '')).toEqual({ type: 'croquis', traits: [] })
    expect(avecTexteLegende(c, 'Vue de côté').legende).toBe('Vue de côté')
  })
})
