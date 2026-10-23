import { describe, expect, it } from 'vitest'
import { bornesCurseur, ecouterVue, etatVue, pourcentage, publierVue } from './vueZoom'

describe('le zoom de la vue', () => {
  it('le pourcentage est l’échelle arrondie', () => {
    expect([pourcentage(1), pourcentage(1.024), pourcentage(0.375), pourcentage(3)]).toEqual([100, 102, 38, 300])
  })

  it('le curseur va de 3 à 300 %, ou du plancher du tableau', () => {
    expect(bornesCurseur(0.01)).toEqual({ min: 3, max: 300 })
    expect(bornesCurseur(0.4)).toEqual({ min: 40, max: 300 })
    expect(bornesCurseur(0.2501)).toEqual({ min: 26, max: 300 })
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
