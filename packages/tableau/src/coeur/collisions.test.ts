import { describe, expect, it } from 'vitest'
import { poussees } from './collisions'
import type { Rect } from './geometrie'

const r = (x: number, y: number, l: number, h: number): Rect => ({ min: { x, y }, max: { x: x + l, y: y + h } })
const voisins = (o: Record<string, Rect>) => new Map(Object.entries(o))

describe('collisions', () => {
  it('ce qui grandit pousse le voisin collé, qui garde son écart', () => {
    const d = poussees('a', { avant: r(0, 0, 20, 10), apres: r(0, 0, 20, 15) }, voisins({ b: r(0, 12, 20, 8) }), new Map())
    expect(d).toEqual(new Map([['b', 5]]))
  })

  it('pousse de proche en proche', () => {
    const v = voisins({ b: r(0, 12, 20, 8), c: r(5, 22, 20, 8) })
    expect(poussees('a', { avant: r(0, 0, 20, 10), apres: r(0, 0, 20, 16) }, v, new Map())).toEqual(
      new Map([
        ['b', 6],
        ['c', 6],
      ]),
    )
  })

  it('laisse ce qui n’est pas dessous, ni dans sa largeur', () => {
    const v = voisins({ cote: r(30, 12, 20, 8), dessus: r(0, -20, 20, 8) })
    expect(poussees('a', { avant: r(0, 0, 20, 10), apres: r(0, 0, 20, 20) }, v, new Map()).size).toBe(0)
  })

  it('ne touche à rien quand un voisin chevauchait déjà l’élément', () => {
    const v = voisins({ dessous: r(0, 9, 20, 8), loin: r(0, 30, 20, 8) })
    expect(poussees('a', { avant: r(0, 0, 20, 10), apres: r(0, 0, 20, 40) }, v, new Map()).size).toBe(0)
  })

  it('un voisin rattrapé de loin prend la marge, puis revient à sa place quand l’élément rapetisse', () => {
    const origines = new Map<string, number>()
    const grand = poussees('a', { avant: r(0, 0, 20, 10), apres: r(0, 0, 20, 25) }, voisins({ b: r(0, 20, 20, 8) }), origines)
    expect(grand).toEqual(new Map([['b', 7]]))
    const petit = poussees('a', { avant: r(0, 0, 20, 25), apres: r(0, 0, 20, 10) }, voisins({ b: r(0, 27, 20, 8) }), origines)
    expect(petit).toEqual(new Map([['b', -7]]))
  })

  it('en rapetissant, ramène le voisin collé sans le poser sur un élément resté au-dessus', () => {
    const v = voisins({ b: r(0, 22, 20, 8), reste: r(15, 12, 20, 6) })
    const d = poussees('a', { avant: r(0, 0, 10, 20), apres: r(0, 0, 10, 10) }, v, new Map())
    // b remonterait à 12, mais `reste` occupe sa largeur jusqu’à 18 : il s’arrête juste dessous.
    expect(d).toEqual(new Map([['b', -3]]))
  })

  it('un élément né sous un autre écarte ce qu’il recouvre', () => {
    const d = poussees('n', { avant: r(0, 0, 0, 0), apres: r(0, 11, 20, 10), nouveau: true }, voisins({ b: r(0, 12, 20, 8) }), new Map())
    // b était à 1 UG du haut de la nouvelle : il garde cet écart sous elle.
    expect(d).toEqual(new Map([['b', 10]]))
  })
})
