import { describe, expect, it } from 'vitest'
import { EMOJIS } from './insertion'

describe('EMOJIS', () => {
  it('ne se répètent pas, et se remplissent en lignes entières de huit', () => {
    expect(new Set(EMOJIS).size).toBe(EMOJIS.length)
    expect(EMOJIS.length % 8).toBe(0)
  })
})
