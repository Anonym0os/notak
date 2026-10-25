import { describe, expect, it } from 'vitest'
import { aretes, contenir, couvrir, defilement, departTrio, ecartAccolade, estPetite, galerie, jalons, pastilles, rangees } from './geometrie'

describe('la géométrie des gabarits (mode Pitch)', () => {
  it('le défilement centre l’élément courant, borné entre 0 et contenu − zone', () => {
    expect(defilement(500, 600, 400)).toBe(0)
    expect(defilement(1000, 400, 100)).toBe(0)
    expect(defilement(1000, 400, 500)).toBe(300)
    expect(defilement(1000, 400, 990)).toBe(600)
  })

  it('contain prend le plus petit rapport, cover le plus grand', () => {
    expect(contenir({ l: 400, h: 200 }, { l: 800, h: 800 })).toEqual({ l: 800, h: 400 })
    expect(couvrir({ l: 400, h: 200 }, { l: 1600, h: 900 })).toEqual({ l: 1800, h: 900 })
    expect(contenir({ l: 0, h: 0 }, { l: 100, h: 100 })).toEqual({ l: 0, h: 0 })
    expect(estPetite({ l: 399, h: 10 })).toBe(true)
    expect(estPetite({ l: 400, h: 10 })).toBe(false)
  })

  it('le trio de l’accolade est centré, mais l’accolade ne passe pas le milieu', () => {
    // 16:9 : contenu 1354, parent 406, accolade 95,4.
    const o = { marge: 123, contenu: 1354, largeurDiapo: 1600, parent: 406, accolade: 95.4 }
    // Une liste étroite : centré, l'accolade finit avant 800.
    expect(departTrio({ ...o, liste: 600 })).toBeCloseTo(123 + (1354 - 1101.4) / 2)
    // Une liste courte : le centrage pousserait l'accolade au-delà du milieu ; elle s'y arrête.
    expect(departTrio({ ...o, liste: 100 })).toBeCloseTo(800 - 406 - 95.4)
  })

  it('les éléments de l’accolade s’écartent pour remplir la zone, jamais sous le minimum', () => {
    expect(ecartAccolade([100, 100, 100], 675, 58.5)).toBeCloseTo(187.5)
    expect(ecartAccolade([100, 100], 675, 58.5)).toBeCloseTo(475 / 3)
    expect(ecartAccolade([200, 200, 200, 200], 675, 58.5)).toBe(58.5)
  })

  it('les arêtes alternent haut et bas, pas de 66 vmin, décalage de 16 vmin, 21 vmin à 35°', () => {
    const g = aretes(4, { debut: 123, intervalle: 594, decalageBas: 144, longueur: 189, angle: 35 })
    expect(g.map((a) => [a.x, a.haut, a.colonne])).toEqual([
      [123, true, 0],
      [267, false, 0],
      [717, true, 1],
      [861, false, 1],
    ])
    expect(g[0]!.dx).toBeCloseTo(189 * Math.sin((35 * Math.PI) / 180))
    expect(g[0]!.dy).toBeCloseTo(189 * Math.cos((35 * Math.PI) / 180))
  })

  it('les jalons du bas tombent entre ceux du haut', () => {
    const j = jalons(3, { debut: 0, c: 438, o: 104, s: 51 })
    expect(j.map((x) => x.x)).toEqual([219, 489, 761])
    expect(j.map((x) => x.haut)).toEqual([true, false, true])
  })

  it('la galerie : des rangées justifiées à la largeur, la plus haute qui tient', () => {
    // Quatre carrés sur 1000 de large, écart 0 : deux rangées de deux (500 + 500 = 1000 de haut) tiennent en 1000.
    const g = galerie([1, 1, 1, 1], 1000, 1000, 0)
    expect(g.h).toBeCloseTo(1000)
    for (const c of g.cases) expect(c.l).toBeCloseTo(500)
    // L'ordre est gardé, chaque rangée remplit exactement la largeur.
    expect(g.cases.map((c) => c.i)).toEqual([0, 1, 2, 3])
    const parRangee = new Map<number, number>()
    for (const c of g.cases) parRangee.set(c.y, (parRangee.get(c.y) ?? 0) + c.l)
    for (const l of parRangee.values()) expect(l).toBeCloseTo(1000)
    // Trop bas : la disposition la plus basse est réduite pour tenir.
    const b = galerie([1, 1], 1000, 100, 10)
    expect(b.h).toBeLessThanOrEqual(100 + 1e-6)
    expect(rangees([1, 1, 1], 1000, 0, 500)).toEqual([[0, 1], [2]])
  })

  it('les étiquettes : bornées à 9 vmin, en ligne avec retour', () => {
    const p = pastilles([50, 300, 300], { largeur: 600, largeurMin: 81, ecart: 18, interligne: 18, hauteur: 40, centre: false })
    expect(p.pastilles.map((x) => [x.x, x.y, x.l])).toEqual([
      [0, 0, 81],
      [99, 0, 300],
      [0, 58, 300],
    ])
    expect(p.h).toBe(98)
  })
})
