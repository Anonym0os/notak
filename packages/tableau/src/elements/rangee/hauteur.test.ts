import { describe, expect, it } from 'vitest'
import { CRAN, hauteurApresCran } from './hauteur'

describe('la hauteur d’un élément rangé', () => {
  it('un cran de plus garde de la place sous le contenu', () => {
    expect(hauteurApresCran(undefined, 20, 1)).toEqual({ min: 20 + CRAN })
  })
  it('un cran de moins coupe le contenu sous un voile', () => {
    expect(hauteurApresCran(undefined, 20, -1)).toEqual({ max: 20 - CRAN })
  })
  it('un plafond se monte et se descend, jamais sous le plancher', () => {
    expect(hauteurApresCran({ max: 12 }, 12, 1)).toEqual({ max: 12 + CRAN })
    expect(hauteurApresCran({ max: 12 }, 12, -1)).toEqual({ max: 12 - CRAN })
    expect(hauteurApresCran({ max: 5 }, 5, -1)).toEqual({ max: 5 })
  })
  it('un plancher qui redescend au contenu le rend libre', () => {
    expect(hauteurApresCran({ min: 30 }, 30, -1)).toEqual({ min: 30 - CRAN })
    expect(hauteurApresCran({ min: 10 }, 14, -1)).toBeNull()
  })
  it('un élément trop bas ne se réduit pas : il redevient libre', () => {
    expect(hauteurApresCran(undefined, 6, -1)).toBeNull()
  })
})
