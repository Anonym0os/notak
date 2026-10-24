import { describe, expect, it } from 'vitest'
import { type Mot, apparierDecors, apparierUnites, cadreDuZoom, chemin, fondSombre, deplacement, horsChamp, interpolerPoints, lireCouleur, lireTransfo, melanger, partVisible, reechantillonner, sortDImage, union } from './morphing'

/** Des mots posés, un par une boîte de 10 de large, `lignes` donnant la ligne de chacun. */
const mots = (texte: string, lignes?: number[], police = 'p'): Mot[] => texte.split(' ').map((t, i) => ({ texte: t, rect: { x: i * 10, y: (lignes?.[i] ?? 0) * 20, l: 10, h: 20 }, ligne: lignes?.[i] ?? 0, police, couleur: '#fff' }))

describe('les unités du morphing de texte', () => {
  it('même texte : des segments, coupés là où l’un ou l’autre rendu passe à la ligne', () => {
    const a = mots('un deux trois quatre', [0, 0, 1, 1])
    const b = mots('un deux trois quatre', [0, 0, 0, 1])
    expect(apparierUnites(a, b)).toEqual([
      { a: [0, 1], b: [0, 1] },
      { a: [2], b: [2] },
      { a: [3], b: [3] },
    ])
  })

  it('même texte sur une ligne des deux côtés : une seule unité', () => {
    expect(apparierUnites(mots('Chapitre A'), mots('Chapitre A'))).toEqual([{ a: [0, 1], b: [0, 1] }])
  })

  it('textes différents : mot à mot, par la plus longue sous-suite commune', () => {
    const u = apparierUnites(mots('le grand chat noir'), mots('le chat très noir'))
    expect(u.filter((x) => x.a && x.b).map((x) => [x.a![0], x.b![0]])).toEqual([
      [0, 0],
      [2, 1],
      [3, 3],
    ])
    expect(u.filter((x) => x.a && !x.b).map((x) => x.a![0])).toEqual([1])
    expect(u.filter((x) => x.b && !x.a).map((x) => x.b![0])).toEqual([2])
  })

  it('un côté vide : tout est seul', () => {
    expect(apparierUnites([], mots('a b'))).toEqual([{ b: [0] }, { b: [1] }])
  })
})

describe('boîtes, images et décors', () => {
  it('le déplacement pose une boîte sur une autre ; uniforme, il garde le rapport des largeurs', () => {
    expect(deplacement({ x: 10, y: 20, l: 100, h: 50 }, { x: 30, y: 0, l: 200, h: 200 })).toEqual({ x: 20, y: -20, sx: 2, sy: 4 })
    expect(deplacement({ x: 0, y: 0, l: 100, h: 50 }, { x: 0, y: 0, l: 50, h: 200 }, true)).toEqual({ x: 0, y: 0, sx: 0.5, sy: 0.5 })
    expect(deplacement({ x: 0, y: 0, l: 0, h: 0 }, { x: 5, y: 5, l: 10, h: 10 })).toEqual({ x: 5, y: 5, sx: 1, sy: 1 })
  })

  it('l’union et la part visible', () => {
    expect(union([{ x: 0, y: 0, l: 10, h: 10 }, { x: 20, y: 5, l: 10, h: 10 }])).toEqual({ x: 0, y: 0, l: 30, h: 15 })
    expect(partVisible({ x: -50, y: 0, l: 100, h: 100 }, [{ x: 0, y: 0, l: 1600, h: 900 }])).toBeCloseTo(0.5)
  })

  it('une image glisse ou se croise au-delà de 90 % de visible, sinon elle sort ou entre', () => {
    const v = (image: string, visible = 1, opacite = 1) => ({ image, visible, opacite })
    expect(sortDImage(v('a'), v('a'))).toBe('glisse')
    expect(sortDImage(v('a'), v('b'))).toBe('croise')
    expect(sortDImage(v('a', 0.85), v('a'))).toBe('entre')
    expect(sortDImage(v('a'), v('a', 1, 0))).toBe('sort')
    expect(sortDImage(v('a', 0.5), v('a', 0.5))).toBe('rien')
  })

  it('les décors : même forme au même rang, sinon la forme unique de son nom', () => {
    const a = [
      { nom: 'bulle', rang: 0 },
      { nom: 'tache', rang: 1 },
      { nom: 'bulle', rang: 2 },
    ]
    const b = [
      { nom: 'bulle', rang: 0 },
      { nom: 'tache', rang: 4 },
      { nom: 'bulle', rang: 5 },
    ]
    expect(apparierDecors(a, b)).toEqual([
      [0, 0],
      [1, 1],
    ])
  })

  it('un décor arrive du coin hors cadre le plus proche', () => {
    expect(horsChamp({ x: 100, y: 700, l: 200, h: 100 }, 1600, 900)).toEqual({ dx: -300, dy: 200 })
    expect(horsChamp({ x: 1400, y: 10, l: 100, h: 100 }, 1600, 900)).toEqual({ dx: 200, dy: -110 })
  })

  it('les transformations des décors se lisent, ce qui manque vaut l’identité', () => {
    expect(lireTransfo('translate(10 20)', 'rotate(30) scale(0.5 2)')).toEqual({ cx: 10, cy: 20, rotation: 30, sx: 0.5, sy: 2 })
    expect(lireTransfo(null, 'scale(3)')).toEqual({ cx: 0, cy: 0, rotation: 0, sx: 3, sy: 3 })
  })
})

describe('tracés et couleurs', () => {
  it('rééchantillonne une ligne brisée à pas réguliers', () => {
    expect(
      reechantillonner(
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        5,
      ),
    ).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
    ])
  })

  it('interpole deux tracés remis au même nombre de points', () => {
    const p = interpolerPoints(
      [
        [0, 0],
        [10, 0],
      ],
      [
        [0, 10],
        [5, 10],
        [10, 10],
      ],
      0.5,
    )
    expect(p).toEqual([
      [0, 5],
      [5, 5],
      [10, 5],
    ])
    expect(chemin(p, true)).toBe('M0 5L5 5L10 5Z')
  })

  it('lit les couleurs calculées et les mélange', () => {
    expect(lireCouleur('rgb(255, 0, 0)')).toEqual([255, 0, 0, 1])
    expect(lireCouleur('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0, 0.5])
    expect(lireCouleur('#0A84FF')).toEqual([10, 132, 255, 1])
    expect(lireCouleur('none')).toBeNull()
    expect(melanger('rgb(0, 0, 0)', 'rgb(255, 255, 255)', 0.5)).toBe('rgba(128, 128, 128, 1)')
    expect(melanger('none', 'rgb(1, 2, 3)', 0.2)).toBe('none')
  })
})

describe('l’agrandissement d’une image', () => {
  it('tient dans la scène à 72 px de l’axe qui la limite, centrée', () => {
    // 400 × 200 dans 1344 × 1000 : la largeur limite, échelle 1200 / 400 + 0,001.
    expect(cadreDuZoom({ l: 400, h: 200 }, { l: 1344, h: 1000 })).toMatchObject({ l: expect.closeTo(1200.4), h: expect.closeTo(600.2), x: expect.closeTo(71.8), y: expect.closeTo(199.9) })
    // 100 × 400 dans 1600 × 900 : la hauteur limite, échelle 756 / 400 + 0,001.
    expect(cadreDuZoom({ l: 100, h: 400 }, { l: 1600, h: 900 })).toMatchObject({ h: expect.closeTo(756.4), l: expect.closeTo(189.1) })
  })

  it('le voile suit la luminance du fond', () => {
    expect(fondSombre('rgb(16, 16, 16)')).toBe(true)
    expect(fondSombre('rgb(244, 244, 244)')).toBe(false)
  })
})
