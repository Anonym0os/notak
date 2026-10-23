import { describe, expect, test } from 'vitest'
import { isoDeSerie, moitiesIso, serieDeIso } from './dates'

describe('le calendrier et les numéros de série', () => {
  test('un jour fait l’aller-retour', () => {
    const serie = serieDeIso('2026-02-01')!
    expect(isoDeSerie(serie)).toBe('2026-02-01')
  })
  test('avec l’heure', () => {
    const serie = serieDeIso('2026-02-01 14:30')!
    expect(Number(serie) % 1).toBeCloseTo(14.5 / 24, 6)
    expect(isoDeSerie(serie)).toBe('2026-02-01 14:30')
  })
  test('un texte qui n’est pas un jour n’est pas lu', () => {
    expect(serieDeIso('1er février')).toBeNull()
    expect(serieDeIso('2026-13-40')).toBeNull()
    expect(isoDeSerie('abc')).toBeNull()
  })
  test('deux moitiés', () => {
    expect(moitiesIso('2026-02-01 08:05')).toEqual({ jour: '2026-02-01', heure: '08:05' })
    expect(moitiesIso('2026-02-01')).toEqual({ jour: '2026-02-01', heure: '' })
    expect(moitiesIso('hier')).toBeNull()
  })
})
