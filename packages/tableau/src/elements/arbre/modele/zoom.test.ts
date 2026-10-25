import { describe, expect, it } from 'vitest'
import { enPourcent, entreesZoom } from './zoom'

describe('le menu du zoom', () => {
  it('les paliers de la carte, du plus grand au plus petit, le courant coché', () => {
    const e = entreesZoom(1)
    expect(e.map((x) => x.valeur)).toEqual([800, 500, 400, 300, 200, 150, 120, 100, 80, 50, 20, 10, 5, 2])
    expect(e.filter((x) => x.coche).map((x) => x.valeur)).toEqual([100])
  })

  it('un zoom qui n’est pas un palier s’ajoute à sa place, coché', () => {
    const e = entreesZoom(1.37)
    expect(e.map((x) => x.valeur)).toEqual([800, 500, 400, 300, 200, 150, 137, 120, 100, 80, 50, 20, 10, 5, 2])
    expect(e.find((x) => x.coche)?.valeur).toBe(137)
  })

  it('le plan se réduit à 300…80', () => {
    expect(entreesZoom(1, true).map((x) => x.valeur)).toEqual([300, 200, 150, 120, 100, 80])
  })

  it('un pourcentage entier, de 2 à 800', () => {
    expect(enPourcent(1.004)).toBe(100)
    expect(enPourcent(0.001)).toBe(2)
    expect(enPourcent(12)).toBe(800)
  })
})
