import { describe, expect, it } from 'vitest'
import { decalerMois, initialesDesJours, jourDuMois, nomDuMois, semaines } from './mois'

describe('semaines', () => {
  it('range octobre 2026 en six semaines, la semaine au lundi', () => {
    const s = semaines(2026, 9, true)
    expect(s).toHaveLength(6)
    expect(s.every((w) => w.length === 7)).toBe(true)
    // Le 1er octobre 2026 est un jeudi.
    expect(s[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(s[4]!.slice(0, 5)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'])
    expect(s[4]![5]).toBe('2026-10-31')
    expect(s[5]!.every((j) => j === null)).toBe(true)
  })

  it('commence au dimanche quand on le demande', () => {
    const s = semaines(2026, 9, false)
    expect(s[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('compte les jours de février, bissextile ou non', () => {
    const jours = (a: number) => semaines(a, 1, true).flat().filter(Boolean).length
    expect(jours(2028)).toBe(29)
    expect(jours(2027)).toBe(28)
  })
})

describe('mois', () => {
  it('passe d’une année à l’autre', () => {
    expect(decalerMois(2026, 11, 1)).toEqual({ annee: 2027, mois: 0 })
    expect(decalerMois(2026, 0, -1)).toEqual({ annee: 2025, mois: 11 })
    expect(decalerMois(2026, 5, 0)).toEqual({ annee: 2026, mois: 5 })
  })

  it('écrit un jour et nomme le mois', () => {
    expect(jourDuMois(2026, 0, 5)).toBe('2026-01-05')
    expect(nomDuMois(2026, 9)).toBe('octobre 2026')
  })

  it('donne l’initiale des sept jours', () => {
    expect(initialesDesJours(true)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D'])
    expect(initialesDesJours(false)).toEqual(['D', 'L', 'M', 'M', 'J', 'V', 'S'])
  })
})
