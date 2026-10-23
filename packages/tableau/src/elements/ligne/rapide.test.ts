import { describe, expect, it } from 'vitest'
import { depuisTaille, point } from '../../coeur/geometrie'
import { arriveeDe, coinPoignee } from './rapide'

describe('ligne rapide, où se pose le bout lâché', () => {
  const source = depuisTaille(point(0, 0), 20, 10)
  const autre = { id: 'b', rect: depuisTaille(point(40, 0), 20, 10) }

  it('lâché dans un autre élément, loin des bords : il vise le centre', () => {
    const a = arriveeDe(source, point(47, 4), autre, false)!
    expect(a.extremite).toEqual({ element: 'b' })
    expect(a.vise).toEqual(point(50, 5))
    expect(a.rect).toBe(autre.rect)
  })

  it('lâché sur le bord d’un autre élément, sans mode dedans : toujours le centre', () => {
    const a = arriveeDe(source, point(40.2, 8), autre, false)!
    expect(a.extremite).toEqual({ element: 'b' })
    expect(a.vise).toEqual(point(50, 5))
  })

  it('en mode dedans : il s’accroche au point précis, collé à un repère tout proche', () => {
    const a = arriveeDe(source, point(40.2, 8), autre, false, true)!
    expect(a.extremite).toEqual({ element: 'b', ancre: { x: 0, y: 0.8 } })
    expect(a.vise).toEqual(point(40, 8))
    expect(a.rect).toBeNull()
    const coin = arriveeDe(source, point(59.5, 0.4), autre, false, true)!
    expect(coin.extremite).toEqual({ element: 'b', ancre: { x: 1, y: 0 } })
  })

  it('lâché dans le vide : un point libre, exactement où est le curseur', () => {
    const a = arriveeDe(source, point(33.4, 7.6), null, false)!
    expect(a.extremite).toEqual({ x: 33.4, y: 7.6 })
    expect(a.rect).toBeNull()
  })

  it('Maj cale la ligne sur un angle de 45° depuis le centre de l’élément', () => {
    const a = arriveeDe(source, point(40, 6), null, true)!
    // Du centre (10, 5) à (40, 6) : presque horizontal, donc horizontal.
    expect(a.extremite).toEqual({ x: 40, y: 5 })
  })

  it('lâché sur l’élément d’où elle part : pas de ligne', () => {
    expect(arriveeDe(source, point(12, 4), null, false)).toBeNull()
  })

  it('la poignée se pose au coin haut droit', () => {
    expect(coinPoignee(source)).toEqual(point(20, 0))
  })
})
