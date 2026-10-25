import { describe, expect, it } from 'vitest'
import { cadreEntre, cadreUtile, commencer, ellipseDe, geometrieDeFleche, marqueUtile, prolonger } from './marques'

describe('les marques du signalement', () => {
  it('la flèche : la tige s’arrête à la base de la pointe, la pointe touche l’arrivée', () => {
    const { tige, pointe } = geometrieDeFleche([0, 0], [100, 0], 4)
    expect(tige).toEqual([[0, 0], [82, 0]])
    expect(pointe[0]).toEqual([100, 0])
    expect(pointe[1][0]).toBeCloseTo(82)
    expect(Math.abs(pointe[1][1] - pointe[2][1])).toBeCloseTo(18 * 0.6 * 2)
  })

  it('le cercle s’inscrit dans le geste, quel qu’en soit le sens', () => {
    expect(ellipseDe([40, 30], [0, 10])).toEqual({ cx: 20, cy: 20, rx: 20, ry: 10 })
  })

  it('un geste minuscule est un clic : rien n’est gardé', () => {
    expect(marqueUtile(commencer('stylo', [5, 5], 4))).toBe(false)
    expect(marqueUtile(prolonger(commencer('stylo', [5, 5], 4), [6, 6]))).toBe(true)
    expect(marqueUtile(prolonger(commencer('fleche', [0, 0], 4), [3, 4]))).toBe(false)
    expect(marqueUtile(prolonger(commencer('cercle', [0, 0], 4), [30, 2]))).toBe(true)
    expect(cadreUtile(cadreEntre([10, 10], [4, 60]))).toBe(false)
    expect(cadreUtile(cadreEntre([60, 60], [10, 10]))).toBe(true)
  })
})
