import { describe, expect, it } from 'vitest'
import { enMathml, equation } from './equation'

describe('les équations', () => {
  it('du LaTeX devient du MathML', () => {
    const m = enMathml('\\frac{a}{b} + \\sqrt{x^2}')
    expect(m).toContain('<math')
    expect(m).toContain('<mfrac')
    expect(m).toContain('<msqrt')
  })

  it('un LaTeX qui ne se lit pas rend null, sans lever', () => {
    expect(enMathml('\\frac{a}{')).toBeNull()
    expect(enMathml('\\commandeinconnue{x}')).toBeNull()
  })

  it('une équation rendue a une taille, estimée d’après son texte quand la page n’a pas de mise en page ; elle se garde', () => {
    const e = equation('x^2 + y^2 = z^2')
    expect(e.html).toContain('<math')
    expect(e.l).toBeGreaterThan(30)
    expect(e.h).toBeGreaterThanOrEqual(30)
    expect(equation('x^2 + y^2 = z^2')).toBe(e)
    // Une fraction est plus haute qu'une ligne.
    expect(equation('\\frac{1}{2}').h).toBeGreaterThan(equation('1 + 2').h)
    expect(equation('\\frac{').html).toBeNull()
  })
})
