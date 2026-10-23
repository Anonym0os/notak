import { describe, expect, test } from 'vitest'
import { COULEURS_MAX, paletteDePixels } from './palette'

const pixels = (...p: [number, number, number, number][]) => Uint8ClampedArray.from(p.flat())

describe('palette d’une image', () => {
  test('les couleurs les plus présentes d’abord, moyennées par case', () => {
    const p = pixels([255, 0, 0, 255], [250, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255])
    expect(paletteDePixels(p)).toEqual(['#fd0000', '#0000ff'])
  })
  test('les pixels transparents ne comptent pas', () => {
    expect(paletteDePixels(pixels([255, 0, 0, 0], [0, 255, 0, 255]))).toEqual(['#00ff00'])
    expect(paletteDePixels(pixels([255, 0, 0, 0]))).toEqual([])
  })
  test('au plus dix couleurs', () => {
    const p: [number, number, number, number][] = []
    for (let r = 0; r < 5; r++) for (let v = 0; v < 5; v++) p.push([r * 51 + 10, v * 51 + 10, 0, 255])
    expect(paletteDePixels(pixels(...p))).toHaveLength(COULEURS_MAX)
  })
})
