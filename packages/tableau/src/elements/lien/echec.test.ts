import { describe, expect, it } from 'vitest'
import { lireCause, messageEchec } from './echec'

describe('lireCause', () => {
  it('lit la cause d’une erreur qui en porte une', () => {
    expect(lireCause(new Error('Aperçu indisponible', { cause: 'refuse' }))).toBe('refuse')
  })
  it('ignore ce qui n’est pas une cause connue', () => {
    expect(lireCause(new Error('x', { cause: 'autre' }))).toBeUndefined()
    expect(lireCause(new Error('x', { cause: 12 }))).toBeUndefined()
    expect(lireCause(new Error('x'))).toBeUndefined()
    expect(lireCause('refuse')).toBeUndefined()
  })
})

describe('messageEchec', () => {
  it('dit chaque cause avec un message distinct', () => {
    const causes = ['introuvable', 'refuse', 'injoignable', 'delai', 'interdit', 'illisible'] as const
    const messages = new Set([...causes.map((c) => messageEchec(c)), messageEchec(undefined)])
    expect(messages.size).toBe(7)
  })
})
