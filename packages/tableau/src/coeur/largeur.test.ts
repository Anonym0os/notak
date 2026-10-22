import { describe, expect, test } from 'vitest'
import { largeurDoubleClic, largeurTiree } from './largeur'

describe('largeur tirée', () => {
  test('arrondie à l’unité', () => {
    expect(largeurTiree(20.4)).toBe(20)
    expect(largeurTiree(20.6)).toBe(21)
  })

  test('bornée par le minimum du type, 17 par défaut', () => {
    expect(largeurTiree(3)).toBe(17)
    expect(largeurTiree(3, 4)).toBe(4)
    expect(largeurTiree(-10, 4)).toBe(4)
  })

  test('collée à 34 à moins de 2 UG', () => {
    expect(largeurTiree(32.6)).toBe(34)
    expect(largeurTiree(35.4)).toBe(34)
    expect(largeurTiree(32)).toBe(32)
    expect(largeurTiree(36)).toBe(36)
  })

  test('sans maximum', () => {
    expect(largeurTiree(900)).toBe(900)
  })
})

describe('largeur au double-clic', () => {
  test('de 34 à la largeur naturelle', () => {
    expect(largeurDoubleClic(34, 160)).toBe(160)
    expect(largeurDoubleClic(34, 12.4)).toBe(17)
    expect(largeurDoubleClic(34, 3, 4)).toBe(4)
  })

  test('de toute autre largeur, retour à 34', () => {
    expect(largeurDoubleClic(160, 160)).toBe(34)
    expect(largeurDoubleClic(20, undefined)).toBe(34)
  })

  test('sans largeur naturelle, 34 reste 34', () => {
    expect(largeurDoubleClic(34, undefined)).toBe(34)
  })
})
