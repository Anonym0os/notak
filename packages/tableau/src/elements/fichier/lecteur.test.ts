import { describe, expect, it } from 'vitest'
import { dureeLisible, tempsLisible } from './lecteur'

describe('durée d’un son ou d’une vidéo', () => {
  it('écrit m:ss, et h:mm:ss au-delà d’une heure', () => {
    expect(dureeLisible(0)).toBe('0:00')
    expect(dureeLisible(65.9)).toBe('1:05')
    expect(dureeLisible(3725)).toBe('1:02:05')
  })
  it('ne plante pas sur une durée inconnue', () => {
    expect(dureeLisible(Number.NaN)).toBe('0:00')
    expect(dureeLisible(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
  it('met le temps courant et la durée côte à côte', () => {
    expect(tempsLisible(5, 200)).toBe('0:05 / 3:20')
  })
})
