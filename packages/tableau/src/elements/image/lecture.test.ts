import { describe, expect, it } from 'vitest'
import { aDesTransparences } from './lecture'

const pixels = (n: number, alpha: number, clairs = 0, alphaClair = 0) => {
  const p = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) p[i * 4 + 3] = i < clairs ? alphaClair : alpha
  return p
}

describe('aDesTransparences', () => {
  it('une image pleine est opaque', () => {
    expect(aDesTransparences(pixels(400, 255))).toBe(false)
  })
  it('un détourage laisse voir le fond', () => {
    expect(aDesTransparences(pixels(400, 255, 200, 0))).toBe(true)
  })
  it('quelques bords adoucis ne font pas une image transparente', () => {
    expect(aDesTransparences(pixels(1000, 255, 5, 100))).toBe(false)
  })
  it('un voile très léger compte pour opaque', () => {
    expect(aDesTransparences(pixels(400, 250))).toBe(false)
  })
  it('une image vide n’est pas transparente', () => {
    expect(aDesTransparences(new Uint8ClampedArray(0))).toBe(false)
  })
})
