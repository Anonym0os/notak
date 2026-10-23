import { describe, expect, test } from 'vitest'
import type { Trait } from '../../coeur/tableau'
import { ajouterPoint, cheminLisse, distanceSegment, gommer, resume, simplifier, toucheTrait } from './trace'

const trait = (points: number[], epaisseur = 2): Trait => ({ points, couleur: '#000000', epaisseur })

describe('le tracé', () => {
  test('un point trop proche du dernier n’est pas gardé', () => {
    const t = [0, 0]
    expect(ajouterPoint(t, 0.5, 0.5)).toBe(t)
    expect(ajouterPoint(t, 5, 0)).toEqual([0, 0, 5, 0])
  })

  test('la simplification écarte les points alignés et garde les coins', () => {
    const droite = [0, 0, 5, 0, 10, 0, 15, 0, 20, 0]
    expect(simplifier(droite)).toEqual([0, 0, 20, 0])
    const coin = [0, 0, 10, 0, 20, 0, 20, 10, 20, 20]
    expect(simplifier(coin)).toEqual([0, 0, 20, 0, 20, 20])
  })

  test('un trait de un ou deux points reste tel quel', () => {
    expect(simplifier([1, 2])).toEqual([1, 2])
    expect(simplifier([1, 2, 3, 4])).toEqual([1, 2, 3, 4])
  })

  test('le chemin lissé : un point, une ligne, puis des courbes qui finissent sur le dernier point', () => {
    expect(cheminLisse([])).toBe('')
    expect(cheminLisse([4, 5])).toBe('M4 5l0 0.01')
    expect(cheminLisse([0, 0, 10, 10])).toBe('M0 0L10 10')
    expect(cheminLisse([0, 0, 10, 0, 10, 10])).toBe('M0 0Q10 0 10 10')
    expect(cheminLisse([0, 0, 10, 0, 10, 10, 0, 10])).toBe('M0 0Q10 0 10 5Q10 10 0 10')
  })

  test('la distance à un segment, y compris au-delà de ses bouts', () => {
    expect(distanceSegment(5, 3, 0, 0, 10, 0)).toBe(3)
    expect(distanceSegment(13, 4, 0, 0, 10, 0)).toBe(5)
    expect(distanceSegment(3, 4, 0, 0, 0, 0)).toBe(5)
  })

  test('la gomme retire les traits qu’elle touche, pas les autres', () => {
    const a = trait([0, 0, 100, 0])
    const b = trait([0, 50, 100, 50])
    expect(gommer([a, b], 50, 3, 6)).toEqual([b])
    const rien = [a, b]
    expect(gommer(rien, 50, 25, 6)).toBe(rien)
  })

  test('l’épaisseur du trait compte pour le toucher ; un simple point se gomme aussi', () => {
    expect(toucheTrait(trait([0, 0, 100, 0], 20), 50, 14, 6)).toBe(true)
    expect(toucheTrait(trait([0, 0, 100, 0], 2), 50, 14, 6)).toBe(false)
    expect(toucheTrait(trait([10, 10]), 12, 10, 3)).toBe(true)
  })

  test('le résumé compte les traits', () => {
    expect(resume({ type: 'croquis', traits: [] })).toBe('Croquis vide')
    expect(resume({ type: 'croquis', traits: [trait([0, 0])] })).toBe('Croquis (1 trait)')
    expect(resume({ type: 'croquis', traits: [trait([0, 0]), trait([1, 1])] })).toBe('Croquis (2 traits)')
  })
})
