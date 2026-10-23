import { describe, expect, it } from 'vitest'
import { RESSORT_LISTES, courbeRessort, dureeRessort, ecartRessort } from './ressort'

describe('ressort des listes d’outils', () => {
  it('part de la distance, arrive à zéro et dépasse à peine', () => {
    expect(ecartRessort(RESSORT_LISTES, 72, 0)).toBeCloseTo(72)
    expect(Math.abs(ecartRessort(RESSORT_LISTES, 72, 2))).toBeLessThan(0.001)
    // Raideur 300 et amortissement 30 : sous-amorti, le dépassement reste inférieur à 1 % de la distance.
    const plusBas = Math.min(...Array.from({ length: 200 }, (_, i) => ecartRessort(RESSORT_LISTES, 1, i / 100)))
    expect(plusBas).toBeLessThan(0)
    expect(plusBas).toBeGreaterThan(-0.01)
  })

  it('se pose en moins d’une demi-seconde, sous la précision demandée', () => {
    const duree = dureeRessort(RESSORT_LISTES, 72)
    expect(duree).toBeGreaterThan(150)
    expect(duree).toBeLessThan(500)
    expect(Math.abs(ecartRessort(RESSORT_LISTES, 72, duree / 1000))).toBeLessThanOrEqual(0.1 + 1e-9)
  })

  it('donne une courbe CSS qui va de 0 à 1', () => {
    const { duree, easing } = courbeRessort(RESSORT_LISTES, 72)
    expect(duree).toBeGreaterThan(0)
    const valeurs = easing.replace('linear(', '').replace(')', '').split(', ').map(Number)
    expect(valeurs[0]).toBe(0)
    expect(valeurs.at(-1)).toBe(1)
    expect(Math.max(...valeurs)).toBeGreaterThan(1)
  })

  it('un amortissement fort ne dépasse pas', () => {
    const lourd = { ...RESSORT_LISTES, amortissement: 80 }
    const min = Math.min(...Array.from({ length: 200 }, (_, i) => ecartRessort(lourd, 1, i / 50)))
    expect(min).toBeGreaterThanOrEqual(-1e-9)
  })
})
