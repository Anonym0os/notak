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
