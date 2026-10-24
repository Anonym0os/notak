import { describe, expect, it } from 'vitest'
import { COLONNES_GRILLE, GRILLE_COULEURS, assemblerCouleur, decouperCouleur, degradeConique, estCouleur, normaliserHex, recentes, sansOpacite } from './couleurs'

describe('les couleurs du nuancier', () => {
  it('la grille a 45 couleurs sur 9 colonnes, sans doublon, du blanc au noir pour la première rangée', () => {
    expect(GRILLE_COULEURS).toHaveLength(45)
    expect(COLONNES_GRILLE).toBe(9)
    expect(new Set(GRILLE_COULEURS).size).toBe(45)
    expect(GRILLE_COULEURS[0]).toBe('#ffffff')
    expect(GRILLE_COULEURS[8]).toBe('#000000')
    expect(GRILLE_COULEURS.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true)
  })

  it('un hexa de trois chiffres est étendu à six', () => {
    expect(normaliserHex('abc')).toBe('#aabbcc')
    expect(normaliserHex('#F0A')).toBe('#ff00aa')
  })

  it('un hexa trop court est complété de zéros, un hexa invalide devient du noir', () => {
    expect(normaliserHex('12')).toBe('#120000')
    expect(normaliserHex('12345')).toBe('#123450')
    expect(normaliserHex('zz')).toBe('#000000')
    expect(normaliserHex('')).toBe('#000000')
  })

  it('un hexa trop long est coupé à six chiffres', () => {
    expect(normaliserHex('a1b2c3d4')).toBe('#a1b2c3')
  })

  it('assemble la valeur : #rrggbb tant que la couleur est pleine, #rrggbbaa sinon', () => {
    expect(assemblerCouleur('#ff8800', 100)).toBe('#ff8800')
    expect(assemblerCouleur('ff8800', 50)).toBe('#ff880080')
    expect(assemblerCouleur('#ff8800', 0)).toBe('#ff880000')
    expect(assemblerCouleur('#ff8800', 250)).toBe('#ff8800')
    expect(assemblerCouleur('#ff8800', -4)).toBe('#ff880000')
  })

  it('découpe une valeur en couleur et opacité', () => {
    expect(decouperCouleur('#FF8800')).toEqual({ hex: '#ff8800', opacite: 100 })
    expect(decouperCouleur('#ff880080')).toEqual({ hex: '#ff8800', opacite: 50 })
    expect(decouperCouleur('rouge')).toEqual({ hex: '#000000', opacite: 100 })
    expect(sansOpacite('#ff880080')).toBe('#ff8800')
  })

  it('reconnaît une couleur valide', () => {
    expect(estCouleur('#aabbcc')).toBe(true)
    expect(estCouleur('#aabbccdd')).toBe(true)
    expect(estCouleur('#abc')).toBe(false)
    expect(estCouleur(12)).toBe(false)
  })

  it('garde les couleurs récentes : la dernière en tête, sans doublon, neuf au plus', () => {
    expect(recentes(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111'])
    expect(recentes(['#111111'], '#AAAAAA')).toEqual(['#aaaaaa', '#111111'])
    const longue = Array.from({ length: 9 }, (_, i) => `#00000${i}`)
    expect(recentes(longue, '#ffffff')).toHaveLength(9)
  })

  it('un jeu en anneau a six secteurs de 60°, départ en haut', () => {
    const d = degradeConique(['#111111', '#222222'])
    expect(d.startsWith('conic-gradient(from 0deg')).toBe(true)
    expect(d).toContain('#111111 0deg 60deg')
    expect(d).toContain('#222222 60deg 120deg')
    expect(d).toContain('#222222 300deg 360deg')
  })
})
