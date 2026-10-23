import { describe, expect, test } from 'vitest'
import type { Trait } from '../../coeur/tableau'
import {
  COULEURS_TRAIT,
  EPAISSEURS_TRAIT,
  HAUTEUR_FEUILLE,
  HAUTEUR_FEUILLE_NEUVE,
  LARGEUR_FEUILLE,
  ajouterPoint,
  arrondir,
  cheminLisse,
  distanceSegment,
  epaisseurFeuille,
  gommer,
  hauteurFeuille,
  nouveauCroquis,
  resume,
  toucheTrait,
  traitVise,
} from './trace'

const trait = (points: number[], epaisseur = 2): Trait => ({ points, couleur: '#000000', epaisseur })

describe('le tracé', () => {
  test('tous les points sont gardés, seul un doublon exact du dernier est écarté', () => {
    const t = [0, 0]
    expect(ajouterPoint(t, 0, 0)).toBe(t)
    expect(ajouterPoint(t, 0.1, 0.1)).toEqual([0, 0, 0.1, 0.1])
    let suite: number[] = [0, 0]
    for (let i = 1; i <= 50; i++) suite = ajouterPoint(suite, i * 0.2, 0)
    expect(suite.length).toBe(102)
  })

  test('les points sont arrondis au centième', () => {
    expect(arrondir([1.234, 5.678, 2, 3.001])).toEqual([1.23, 5.68, 2, 3])
  })

  test('le chemin lissé : un point, une ligne, puis des quadratiques entre milieux et un dernier segment droit', () => {
    expect(cheminLisse([])).toBe('')
    expect(cheminLisse([4, 5])).toBe('M4 5l0 0.01')
    expect(cheminLisse([0, 0, 10, 10])).toBe('M0 0L10 10')
    expect(cheminLisse([0, 0, 10, 0, 10, 10])).toBe('M0 0Q10 0 10 5L10 10')
    expect(cheminLisse([0, 0, 10, 0, 10, 10, 0, 10])).toBe('M0 0Q10 0 10 5Q10 10 5 10L0 10')
    expect(cheminLisse([0, 0, 1.234, 0.333, 3, 3])).toBe('M0 0Q1.23 0.33 2.12 1.67L3 3')
  })

  test('l’épaisseur à l’écran est constante : 2, 4, 8 et 32 pixels, rangés en unités de feuille', () => {
    expect(EPAISSEURS_TRAIT.map((e) => e.px)).toEqual([2, 4, 8, 32])
    expect(epaisseurFeuille(4, 1)).toBe(4)
    // Une feuille affichée deux fois plus large : un pixel vaut deux fois moins d'unités.
    expect(epaisseurFeuille(4, 2)).toBe(2)
    expect(epaisseurFeuille(4, 0.5)).toBe(8)
    // Une échelle absurde ne fait pas de trait infini.
    expect(epaisseurFeuille(4, 0)).toBe(4)
  })

  test('treize couleurs, de l’encre au blanc', () => {
    expect(COULEURS_TRAIT).toHaveLength(13)
    expect(COULEURS_TRAIT[0]).toBe('#323b4a')
    expect(COULEURS_TRAIT.at(-1)).toBe('#ffffff')
  })

  test('une feuille neuve a le rapport de 1,63 et 34 UG de large ; un ancien croquis garde ses 4:3', () => {
    const neuf = nouveauCroquis(0, 0)
    expect(neuf.largeur).toBe(34)
    expect(hauteurFeuille(neuf.contenu)).toBe(HAUTEUR_FEUILLE_NEUVE)
    expect(LARGEUR_FEUILLE / HAUTEUR_FEUILLE_NEUVE).toBeCloseTo(1.63, 2)
    expect(hauteurFeuille({ type: 'croquis', traits: [] })).toBe(HAUTEUR_FEUILLE)
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

  test('la gomme vise le trait du dessus qu’elle touche', () => {
    const dessous = trait([0, 0, 100, 0])
    const dessus = trait([0, 0, 100, 0])
    const loin = trait([0, 50, 100, 50])
    expect(traitVise([dessous, loin, dessus], 50, 1, 3)).toBe(2)
    expect(traitVise([dessous, loin], 50, 25, 3)).toBe(-1)
    expect(traitVise([], 0, 0, 3)).toBe(-1)
  })

  test('le résumé compte les traits', () => {
    expect(resume({ type: 'croquis', traits: [] })).toBe('Croquis vide')
    expect(resume({ type: 'croquis', traits: [trait([0, 0])] })).toBe('Croquis (1 trait)')
    expect(resume({ type: 'croquis', traits: [trait([0, 0]), trait([1, 1])] })).toBe('Croquis (2 traits)')
  })
})
