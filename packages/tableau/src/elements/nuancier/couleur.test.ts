import { describe, expect, test } from 'vitest'
import { codeAffiche, normaliserHex, nouveauNuancier } from './couleur'

describe('le code couleur', () => {
  test('six chiffres, avec ou sans dièse, en minuscules', () => {
    expect(normaliserHex('#4F8CFF')).toBe('#4f8cff')
    expect(normaliserHex('  4f8cff ')).toBe('#4f8cff')
  })

  test('trois chiffres se doublent', () => {
    expect(normaliserHex('#48f')).toBe('#4488ff')
    expect(normaliserHex('FA0')).toBe('#ffaa00')
  })

  test('ce qui n’est pas un code est refusé', () => {
    for (const faux of ['', '#', '#12', '#12345', '#1234567', 'rouge', '#ggg', '##fff']) expect(normaliserHex(faux)).toBeNull()
  })

  test('affiché en majuscules', () => {
    expect(codeAffiche('#4f8cff')).toBe('#4F8CFF')
  })

  test('un nuancier neuf a une couleur valide', () => {
    const n = nouveauNuancier(3, 4)
    expect(normaliserHex(n.contenu.couleur)).toBe(n.contenu.couleur)
    expect([n.x, n.y]).toEqual([3, 4])
  })
})

describe('le code affiché', () => {
  test('hexadécimal par défaut, puis rgb et hsl', () => {
    expect(codeAffiche('#4f8cff')).toBe('#4F8CFF')
    expect(codeAffiche('#4f8cff', 'rgb')).toBe('rgb(79, 140, 255)')
    expect(codeAffiche('#4f8cff', 'hsl')).toBe('hsl(219, 100%, 65%)')
    expect(codeAffiche('#ff0000', 'hsl')).toBe('hsl(0, 100%, 50%)')
    expect(codeAffiche('#808080', 'hsl')).toBe('hsl(0, 0%, 50%)')
  })
})
