import { describe, expect, test } from 'vitest'
import { PALETTE_DEPART, analyserCode, avecNomEnLegende, nomDeCouleur, codeAffiche, couleurSuivante, normaliserHex, nouveauNuancier } from './couleur'

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
    expect(codeAffiche('#4f8cff', 'rgb')).toBe('79,140,255')
    expect(codeAffiche('#4f8cff', 'hsl')).toBe('219,100%,65%')
    expect(codeAffiche('#ff0000', 'hsl')).toBe('0,100%,50%')
    expect(codeAffiche('#808080', 'hsl')).toBe('0,0%,50%')
  })
})

describe('le code tapé', () => {
  test('hexadécimal, rgb, hsl et R,G,B', () => {
    expect(analyserCode('4f8cff')).toBe('#4f8cff')
    expect(analyserCode('rgb(79, 140, 255)')).toBe('#4f8cff')
    expect(analyserCode('79,140,255')).toBe('#4f8cff')
    expect(analyserCode('hsl(0, 100%, 50%)')).toBe('#ff0000')
    expect(analyserCode('120,100%,25%')).toBe('#008000')
  })

  test('hors bornes ou incomplet : refusé', () => {
    for (const faux of ['rgb(300, 0, 0)', '79,140', 'hsl(400, 10%, 10%)', 'rgb(1,2,3,4)', 'bleu']) expect(analyserCode(faux)).toBeNull()
  })
})

test('les couleurs de naissance se suivent', () => {
  const a = couleurSuivante()
  const b = couleurSuivante()
  expect(a).not.toBe(b)
  expect(PALETTE_DEPART).toContain(b)
})

describe('la légende de naissance', () => {
  test('le nom de la couleur la plus proche', () => {
    expect(nomDeCouleur('#ff0000')).toBe('Red')
    expect(nomDeCouleur('#fe0101', 'fr')).toBe('Rouge')
    expect(nomDeCouleur('#000001')).toBe('Black')
    expect(nomDeCouleur('pas une couleur')).toBe('')
  })

  test('un nuancier posé par un geste porte sa légende', () => {
    const e = avecNomEnLegende(nouveauNuancier(0, 0, '#ffffff'))
    expect(e.contenu).toMatchObject({ avecLegende: true, legende: expect.stringMatching(/White|Blanc/) })
  })
})
