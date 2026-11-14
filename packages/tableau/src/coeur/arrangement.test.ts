import { describe, expect, test } from 'vitest'
import { type Disposable, aligner, axesRepartissables, repartir } from './arrangement'
import { depuisTaille, point } from './geometrie'

const el = (id: string, x: number, y: number, l: number, h: number): Disposable => ({
  id,
  x,
  y,
  rect: depuisTaille(point(x, y), l, h),
})
/** Une image légendée de 18 UG de large : 2 px de retrait, la photo calée sur la grille (−2 px), 60 px de légende. */
const image = (id: string, x: number, y: number, photo = 27) => el(id, x, y, 17.8, photo - 0.2 + 6)
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

  describe('rectangles fractionnaires', () => {
    test('des images légendées de hauteurs différentes s’alignent exactement en bas et au centre', () => {
      // Bas : 32,8, 26,8 + 3 = 29,8 et 20,8 + 1 = 21,8 → toutes à 32,8.
      const imgs = [image('a', 0, 0, 27), image('b', 20, 3, 21), image('c', 40, 1, 15)]
      const bas = versDe(aligner(imgs, 'bas'))
      expect(bas).toEqual({ b: [20, 6], c: [40, 12] })
      expect(6 + 26.8).toBeCloseTo(32.8)
      // Centres : 16,4 ; 3 + 13,4 = 16,4 ; 1 + 10,4 = 11,4 → c rejoint 16,4.
      expect(versDe(aligner(imgs, 'centre-vertical'))).toEqual({ c: [40, 6] })
    })
    test('la référence est le bord d’un élément, pas son arrondi : l’écart restant ne dépasse pas une demi-UG', () => {
      // Le bas de a est à 32,8 ; b (25,4 de haut) s'y range à 32,4 (et non 33,4, qu'aurait donné la référence 33).
      expect(versDe(aligner([el('a', 0, 0, 10, 32.8), el('b', 20, 5, 10, 25.4)], 'bas'))).toEqual({ b: [20, 7] })
    })
    test('deux bords qui s’arrondissent pareil mais diffèrent de 0,8 UG se rangent quand même (grille de 9 px)', () => {
      // Une légende d'une ligne et une de deux, en UG de 9 px : bas à 33,444 et 32,667.
      expect(versDe(aligner([el('a', 0, 0, 10, 33.444), el('b', 20, 0, 10, 32.667)], 'bas'))).toEqual({ b: [20, 1] })
    })
    test('les mesures d’une toile zoomée (bruit de calcul) donnent le même résultat', () => {
      const bruit = (d: Disposable, e: number): Disposable => ({ ...d, rect: { min: point(d.rect.min.x + e, d.rect.min.y - e), max: point(d.rect.max.x - e, d.rect.max.y + e) } })
      const imgs = [image('a', 0, 0, 27), image('b', 20, 3, 21), image('c', 40, 1, 15)]
      for (const sens of ['haut', 'bas', 'centre-vertical', 'gauche', 'droite'] as const) {
        expect(aligner(imgs.map((d, k) => bruit(d, (k - 1) * 3e-9)), sens)).toEqual(aligner(imgs, sens))
      }
    })
  })
})

describe('répartir', () => {
  test('horizontal : écart égal, le premier ne bouge pas', () => {
    // étendue 0..60, tailles 30, vide 30, écart 15
    const r = repartir([el('c', 50, 0, 10, 10), el('a', 0, 0, 10, 10), el('b', 12, 0, 10, 10)], 'horizontal')
    expect(versDe(r)).toEqual({ b: [25, 0] })
    expect(r.find((d) => d.id === 'a')).toBeUndefined()
  })
  test('horizontal : l’écart fractionnaire s’arrondit à l’UG la plus proche, le même partout', () => {
    // étendue 0..31, tailles 20, vide 11, écart 5,5 → 6 et 6
    const r = repartir([el('a', 0, 0, 10, 10), el('b', 5, 0, 5, 10), el('c', 26, 0, 5, 10)], 'horizontal')
    expect(versDe(r)).toEqual({ b: [16, 0], c: [27, 0] })
  })
  test('vertical : trié sur le haut', () => {
    const r = repartir([el('a', 0, 0, 10, 10), el('b', 0, 12, 10, 10), el('c', 0, 40, 10, 20)], 'vertical')
    // étendue 60, tailles 40, vide 20, écart 10
    expect(versDe(r)).toEqual({ b: [0, 20] })
  })
  test('moins de trois éléments : rien', () => {
    expect(repartir([el('a', 0, 0, 1, 1), el('b', 9, 0, 1, 1)], 'horizontal')).toEqual([])
  })

  describe('une rangée ne se désaligne jamais', () => {
    // Le signalement : 4, 5 et 6, trois images légendées côte à côte, hauts alignés. Répartir en hauteur les faisait
    // descendre en escalier (5 d'une UG, 6 de deux).
    const rangee = [image('4', 0, 40), image('5', 19, 40), image('6', 38, 40)]

    test('répartie en hauteur, une rangée d’images légendées ne bouge pas (l’escalier du signalement)', () => {
      expect(repartir(rangee, 'vertical')).toEqual([])
    })
    test('ni une rangée d’éléments de hauteurs différentes, alignés en haut ou en bas', () => {
      expect(repartir([el('a', 0, 0, 10, 10), el('b', 12, 0, 10, 5), el('c', 24, 0, 10, 8)], 'vertical')).toEqual([])
      expect(repartir([el('a', 0, 0, 10, 10), el('b', 12, 5, 10, 5), el('c', 24, 2, 10, 8)], 'vertical')).toEqual([])
    })
    test('répartie en largeur, elle garde ses hauts et prend des écarts exactement égaux', () => {
      // 0..17,8 · 19..36,8 · 41..58,8 : vide 5,4, écart 2,7 ; les écarts tombent tous à 3,2.
      const r = repartir([image('4', 0, 40), image('5', 19, 40), image('6', 41, 40)], 'horizontal')
      expect(versDe(r)).toEqual({ '5': [21, 40], '6': [42, 40] })
      expect([21 - 17.8, 42 - (21 + 17.8)].map((e) => +e.toFixed(4))).toEqual([3.2, 3.2])
    })
    test('une colonne d’images légendées : des écarts égaux, sans dérive d’arrondi', () => {
      const ys = [0, 34, 70, 103, 140, 172]
      const r = repartir(ys.map((y, k) => image(`i${k}`, 0, y)), 'vertical')
      const apres = ys.map((y, k) => r.find((d) => d.id === `i${k}`)?.vers[1] ?? y)
      const ecarts = apres.slice(1).map((y, k) => +(y - (apres[k]! + 32.8)).toFixed(4))
      expect(new Set(ecarts).size).toBe(1)
      // Le dernier reste à moins d'une demi-UG par écart de sa place.
      expect(Math.abs(apres.at(-1)! - 172)).toBeLessThanOrEqual(2.5)
    })
  })

  test('des éléments qui se chevauchent sur l’axe ne bougent pas', () => {
    // étendue 0..25, tailles 30 : pas la place de les poser l'un après l'autre.
    expect(repartir([el('a', 0, 0, 10, 10), el('b', 3, 0, 10, 10), el('c', 15, 0, 10, 10)], 'horizontal')).toEqual([])
  })
  test('une colonne de la sélection bouge d’un seul bloc', () => {
    // a et b l'un sous l'autre (une colonne), c et d à droite : la colonne compte pour un.
    const r = repartir([el('a', 0, 0, 10, 10), el('b', 0, 20, 10, 10), el('c', 30, 0, 10, 10), el('d', 60, 20, 10, 10)], 'horizontal')
    expect(r).toEqual([])
    const r2 = repartir([el('a', 0, 0, 10, 10), el('b', 0, 20, 10, 10), el('c', 14, 0, 10, 10), el('d', 50, 20, 10, 10)], 'horizontal')
    // blocs 0..10, 14..24, 50..60 : vide 30, écart 15 → c à 25.
    expect(versDe(r2)).toEqual({ c: [25, 0] })
  })
  test('une grille se répartit colonne par colonne, sans rien désaligner', () => {
    // Trois rangées de trois images, colonnes à 0, 20 et 45 : vide 9,4, écart 4,7 ; chaque colonne glisse d'un bloc.
    const grille = [0, 20, 45].flatMap((x, c) => [0, 35, 75].map((y, l) => image(`${l}${c}`, x, y)))
    const r = repartir(grille, 'horizontal')
    const dx = new Map(r.map((d) => [d.id, d.vers[0] - d.de[0]]))
    expect([0, 1, 2].map((c) => [0, 1, 2].map((l) => dx.get(`${l}${c}`) ?? 0))).toEqual([[0, 0, 0], [3, 3, 3], [1, 1, 1]])
    expect(r.every((d) => d.vers[1] === d.de[1])).toBe(true)
    // En hauteur, chaque rangée glisse de même d'un bloc (rangées à 0, 35 et 75 : écart 4,7).
    const v = repartir(grille, 'vertical')
    const dy = new Map(v.map((d) => [d.id, d.vers[1] - d.de[1]]))
    expect([0, 1, 2].map((l) => [0, 1, 2].map((c) => dy.get(`${l}${c}`) ?? 0))).toEqual([[0, 0, 0], [3, 3, 3], [1, 1, 1]])
    expect(v.every((d) => d.vers[0] === d.de[0])).toBe(true)
  })
})

describe('les axes où répartir agit', () => {
  test('une rangée : en largeur seulement ; une colonne : en hauteur seulement', () => {
    expect(axesRepartissables([image('4', 0, 40), image('5', 19, 40), image('6', 38, 40)])).toEqual(['horizontal'])
    expect(axesRepartissables([image('a', 0, 0), image('b', 0, 34), image('c', 0, 70)])).toEqual(['vertical'])
  })
  test('une diagonale : les deux ; une pile : aucun', () => {
    expect(axesRepartissables([el('a', 0, 0, 10, 10), el('b', 12, 15, 10, 10), el('c', 30, 28, 10, 10)])).toEqual(['horizontal', 'vertical'])
    expect(axesRepartissables([el('a', 0, 0, 10, 10), el('b', 2, 2, 10, 10), el('c', 4, 4, 10, 10)])).toEqual([])
  })
})
