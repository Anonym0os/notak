// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cleVu, lireVus, noterVu } from './vus'

describe('les récents de l’appareil', () => {
  it('retient la dernière ouverture de chaque toile et de chaque élément', () => {
    localStorage.clear()
    noterVu('a', 100)
    noterVu(cleVu('b', 'x'), 200)
    noterVu('a', 300)
    expect(lireVus()).toEqual({ a: 300, 'b/e/x': 200 })
  })
})
