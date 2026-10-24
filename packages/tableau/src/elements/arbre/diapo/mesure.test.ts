import { describe, expect, it } from 'vitest'
import { MARQUEUR, PLACE_MARQUEUR, couper, fonte, interlettrage, largeurEstimee, morceaux, police } from './mesure'

/** Dix px par caractère : la coupe se lit sans navigateur. */
const dix = (s: string) => [...s].length * 10

describe('la mesure du texte des diapositives', () => {
  it('coupe aux espaces, les espaces de fin ne comptent pas', () => {
    expect(couper('un deux trois', 70, dix).map((l) => l.texte)).toEqual(['un deux', 'trois'])
    expect(couper('un deux trois', 130, dix).map((l) => l.texte)).toEqual(['un deux trois'])
    expect(couper('un deux', 70, dix)[0]!.largeur).toBe(70)
  })

  it('un mot plus large que la ligne se coupe où il déborde', () => {
    expect(couper('abcdefghij', 40, dix).map((l) => l.texte)).toEqual(['abcd', 'efgh', 'ij'])
    expect(couper('ab abcdefghij', 40, dix).map((l) => l.texte)).toEqual(['ab', 'abcd', 'efgh', 'ij'])
  })

  it('un saut de ligne force une ligne ; les idéogrammes se coupent un à un', () => {
    expect(couper('a\nb', 100, dix).map((l) => l.texte)).toEqual(['a', 'b'])
    expect(morceaux('数据库')).toEqual(['数', '据', '库'])
    expect(couper('数据库', 20, dix).map((l) => l.texte)).toEqual(['数据', '库'])
  })

  it('la police porte graisse et famille ; un marqueur tient 1,2 em', () => {
    expect(fonte(police('Inter', 700), 72)).toBe('700 72px Inter')
    expect(fonte(police('Inter', 400, true), 36)).toBe('italic 400 36px Inter')
    expect(largeurEstimee(MARQUEUR, 50, police('x'))).toBe(PLACE_MARQUEUR * 50)
  })

  it('l’interlettrage des paroles rejoint la largeur du gras, par pas de 0,005 em, jusqu’à 0,1 em', () => {
    expect(interlettrage(100, 110, 10, 50)).toBeCloseTo(0.02)
    expect(interlettrage(100, 900, 10, 50)).toBe(0.1)
    expect(interlettrage(100, 90, 10, 50)).toBe(0)
  })
})
