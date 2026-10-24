import { describe, expect, it } from 'vitest'
import { bezier, courbe, dureeImposee, ressort } from './courbes'

describe('les courbes de Xmind (anime.js 3)', () => {
  it('les puissances : Quad t², Cubic t³, Quart t⁴, et Expo t⁶ comme anime.js 3', () => {
    expect(courbe('easeInQuad')(0.5)).toBeCloseTo(0.25)
    expect(courbe('easeOutQuad')(0.5)).toBeCloseTo(0.75)
    expect(courbe('easeInOutCubic')(0.25)).toBeCloseTo(4 * 0.25 ** 3)
    expect(courbe('easeInOutQuart')(0.75)).toBeCloseTo(1 - 0.5 ** 4 / 2)
    expect(courbe('easeInQuart')(0.5)).toBeCloseTo(0.0625)
    expect(courbe('easeOutQuart')(0.5)).toBeCloseTo(1 - 0.0625)
    expect(courbe('easeInExpo')(0.5)).toBeCloseTo(0.5 ** 6)
  })

  it('toutes partent de 0 et arrivent à 1 ; un nom inconnu est linéaire', () => {
    for (const nom of ['linear', 'easeInOutQuart', 'easeOutElastic(1, .5)', 'easeOutElastic(1, 1.5)', 'spring(0.3, 20, 3, 0)', 'easeInOutBack', 'easeOutBounce']) {
      expect(courbe(nom)(0)).toBeCloseTo(0)
      expect(courbe(nom)(1)).toBeCloseTo(1)
    }
    expect(courbe('nimporte')(0.3)).toBe(0.3)
  })

  it("l'élastique dépasse son but avant de s'y poser", () => {
    const f = courbe('easeOutElastic(1, .5)')
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => f(i / 50)))).toBeGreaterThan(1)
  })

  it('le ressort des bulles, spring(0.3, 20, 3, 0), dure environ 1 667 ms et impose sa durée', () => {
    expect(ressort(0.3, 20, 3, 0).duree).toBeCloseTo(1667, -1)
    expect(dureeImposee('spring(0.3, 20, 3, 0)', 400)).toBeCloseTo(1667, -1)
    expect(dureeImposee('easeInOutQuart', 400)).toBe(400)
  })

  it('une Bézier cubique se résout comme en CSS (ease = 0,25 0,1 0,25 1)', () => {
    expect(bezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3)
    expect(courbe('cubicBezier(1, -0.41, 0, 1.41)')(0)).toBe(0)
  })
})
