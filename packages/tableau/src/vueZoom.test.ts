import { describe, expect, it } from 'vitest'
import { bornesCurseur, depuisCran, ecouterVue, etatVue, pourcentage, publierVue, versCran } from './vueZoom'

describe('le zoom de la vue', () => {
  it('le pourcentage est l’échelle arrondie', () => {
    expect([pourcentage(1), pourcentage(1.024), pourcentage(0.375), pourcentage(3)]).toEqual([100, 102, 38, 300])
  })

  it('le curseur va de 2 à 800 %, ou du plancher du tableau', () => {
    expect(bornesCurseur(0.01)).toEqual({ min: 2, max: 800 })
    expect(bornesCurseur(0.4)).toEqual({ min: 40, max: 800 })
    expect(bornesCurseur(0.2501)).toEqual({ min: 26, max: 800 })
  })

  it('le curseur avance en logarithme, et revient sur le même pourcentage', () => {
    expect(versCran(200) - versCran(100)).toBe(versCran(400) - versCran(200))
    for (const p of [2, 3, 37, 100, 137, 800]) expect(depuisCran(versCran(p))).toBe(p)
    // 100 % tombe aux deux tiers de la course, de 2 à 800 %.
    const part = (versCran(100) - versCran(2)) / (versCran(800) - versCran(2))
    expect(part).toBeGreaterThan(0.6)
    expect(part).toBeLessThan(0.7)
  })

  it('ne prévient que si le zoom change, et se vide quand la toile part', () => {
    const commandes = { details: () => ({ min: 0.4, toutAffiche: false }), zoomer() {}, tout() {}, cent() {} }
    let appels = 0
    const fin = ecouterVue(() => appels++)
    publierVue({ echelle: 1 }, commandes)
    publierVue({ echelle: 1 }, commandes)
    expect(appels).toBe(1)
    publierVue({ echelle: 2 }, commandes)
    expect(etatVue()).toEqual({ echelle: 2 })
    publierVue(null, null)
    expect(etatVue()).toBeNull()
    expect(appels).toBe(3)
    fin()
  })
})
