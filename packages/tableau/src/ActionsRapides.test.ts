import { describe, expect, it } from 'vitest'
import { placerActions } from './ActionsRapides'
import { point } from './coeur/geometrie'

const vue = { largeur: 400, hauteur: 800 }
const taille = { largeur: 320, hauteur: 40 }
const libre = { haut: 120, bas: 110 }
const cadre = (x0: number, y0: number, x1: number, y1: number) => ({ min: point(x0, y0), max: point(x1, y1) })

describe('placerActions', () => {
  it('centre la barre au-dessus de l’élément', () => {
    expect(placerActions(cadre(100, 400, 300, 500), taille, vue, libre)).toEqual({ x: 40, y: 350 })
  })

  it('reste entière dans la largeur de la vue, à droite comme à gauche', () => {
    expect(placerActions(cadre(300, 400, 420, 500), taille, vue, libre)?.x).toBe(72)
    expect(placerActions(cadre(-50, 400, 60, 500), taille, vue, libre)?.x).toBe(8)
  })

  it('passe sous l’élément quand il touche le haut, et colle au haut libre s’il est plus grand que la vue', () => {
    expect(placerActions(cadre(100, 130, 300, 300), taille, vue, libre)?.y).toBe(310)
    expect(placerActions(cadre(100, 50, 300, 750), taille, vue, libre)?.y).toBe(120)
  })

  it('se cache quand l’élément sort de la vue', () => {
    expect(placerActions(cadre(100, -300, 300, 100), taille, vue, libre)).toBeNull()
    expect(placerActions(cadre(500, 400, 600, 500), taille, vue, libre)).toBeNull()
  })
})
