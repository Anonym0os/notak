import { describe, expect, test } from 'vitest'
import { type Disposable, aligner, ecartRepartition, repartir } from './arrangement'
import { depuisTaille, point } from './geometrie'

const el = (id: string, x: number, y: number, l: number, h: number): Disposable => ({
  id,
  x,
  y,
  rect: depuisTaille(point(x, y), l, h),
})
const versDe = (ds: ReturnType<typeof aligner>) => Object.fromEntries(ds.map((d) => [d.id, d.vers]))

describe('aligner', () => {
  // a: x0..10, y0..10 ; b: x12..32, y5..25 ; c: x12..22, y30..60
  const trois = [el('a', 0, 0, 10, 10), el('b', 12, 5, 20, 20), el('c', 12, 30, 10, 30)]

  test('gauche : le bord le plus fréquent l’emporte', () => {
    expect(versDe(aligner(trois, 'gauche'))).toEqual({ a: [12, 0] })
  })
  test('gauche : tout diffère, on prend le plus à gauche', () => {
    expect(versDe(aligner([el('a', 5, 0, 10, 10), el('b', 20, 0, 10, 10)], 'gauche'))).toEqual({ b: [5, 0] })
  })
  test('droite : le plus à droite en cas d’égalité', () => {
    // bords droits : 10, 32, 22
    expect(versDe(aligner(trois, 'droite'))).toEqual({ a: [22, 0], c: [22, 30] })
  })
  test('haut : le plus haut quand tout diffère', () => {
    expect(versDe(aligner(trois, 'haut'))).toEqual({ b: [12, 0], c: [12, 0] })
  })
  test('bas : le plus bas quand tout diffère', () => {
    // bords bas : 10, 25, 60
    expect(versDe(aligner(trois, 'bas'))).toEqual({ a: [0, 50], b: [12, 40] })
  })
  test('centre horizontal : tout diffère, le centre le plus près de celui du groupe (16 → 17)', () => {
    // centres : 5, 22, 17
    expect(versDe(aligner(trois, 'centre-horizontal'))).toEqual({ a: [12, 0], b: [7, 5] })
  })
  test('centre vertical : à égalité de distance, le premier rencontré (5, 15, 45 autour de 30 → 15)', () => {
    expect(versDe(aligner(trois, 'centre-vertical'))).toEqual({ a: [0, 10], c: [12, 0] })
  })
  test('centre : le centre que partagent le plus d’éléments l’emporte', () => {
    const deux = [el('a', 0, 0, 10, 10), el('b', 2, 20, 6, 6), el('c', 40, 40, 4, 4)]
    // a et b sont centrés sur 5 ; c s'y range, même loin du centre du groupe.
    expect(versDe(aligner(deux, 'centre-horizontal'))).toEqual({ c: [3, 40] })
  })
  test('un élément déjà en place ne produit pas d’opération', () => {
    expect(aligner([el('a', 3, 0, 10, 10), el('b', 3, 20, 5, 5)], 'gauche')).toEqual([])
  })
  test('moins de deux éléments : rien', () => {
    expect(aligner([el('a', 0, 0, 1, 1)], 'gauche')).toEqual([])
  })
})

describe('écart de répartition', () => {
  test.each([
    [10, 2, 5],
    [5, 2, 3],
    [0.2, 1, 1],
    [0, 3, 0],
    [-0.5, 1, 0],
    [-1, 1, -1],
    [-1.5, 1, -1],
    [-7, 2, -3],
  ])('vide %f sur %i intervalles → %f', (vide, n, attendu) => {
    expect(ecartRepartition(vide, n)).toBe(attendu)
  })
})

describe('répartir', () => {
  test('horizontal : écart égal, le premier ne bouge pas', () => {
    // étendue 0..60, tailles 30, vide 30, écart 15
    const r = repartir([el('c', 50, 0, 10, 10), el('a', 0, 0, 10, 10), el('b', 12, 0, 10, 10)], 'horizontal')
    expect(versDe(r)).toEqual({ b: [25, 0] })
    expect(r.find((d) => d.id === 'a')).toBeUndefined()
  })
  test('horizontal : l’écart fractionnaire est arrondi vers le haut', () => {
    // étendue 0..30, tailles 20, vide 10, écart 5 ; avec 0..31 → 5.5 → 6
    const r = repartir([el('a', 0, 0, 10, 10), el('b', 5, 0, 5, 10), el('c', 26, 0, 5, 10)], 'horizontal')
    expect(versDe(r)).toEqual({ b: [16, 0], c: [27, 0] })
  })
  test('vertical : trié sur le haut', () => {
    const r = repartir([el('a', 0, 0, 10, 10), el('b', 0, 12, 10, 10), el('c', 0, 40, 10, 20)], 'vertical')
    // étendue 60, tailles 40, vide 20, écart 10
    expect(versDe(r)).toEqual({ b: [0, 20] })
  })
  test('écart négatif : les éléments se recouvrent d’autant', () => {
    // étendue 0..25, tailles 30, vide -5, intervalles 2 → -2.5 → -2
    const r = repartir([el('a', 0, 0, 10, 10), el('b', 3, 0, 10, 10), el('c', 15, 0, 10, 10)], 'horizontal')
    expect(versDe(r)).toEqual({ b: [8, 0], c: [16, 0] })
  })
  test('écart négatif entre −1 et 0 : zéro, les éléments se touchent', () => {
    // étendue 0..29, tailles 30, vide -1, 2 intervalles → -0.5 → 0
    const r = repartir([el('a', 0, 0, 10, 10), el('b', 5, 0, 10, 10), el('c', 19, 0, 10, 10)], 'horizontal')
    expect(versDe(r)).toEqual({ b: [10, 0], c: [20, 0] })
  })
  test('à égalité sur le bord de début, l’autre axe départage', () => {
    const r = repartir([el('b', 0, 20, 10, 10), el('a', 0, 0, 10, 10), el('c', 40, 0, 10, 10)], 'horizontal')
    // tri : a (y0), b (y20), c ; étendue 50, tailles 30, vide 20, écart 10
    expect(versDe(r)).toEqual({ b: [20, 20] })
  })
  test('moins de trois éléments : rien', () => {
    expect(repartir([el('a', 0, 0, 1, 1), el('b', 9, 0, 1, 1)], 'horizontal')).toEqual([])
  })
})
