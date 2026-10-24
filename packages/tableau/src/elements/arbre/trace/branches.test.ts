import { describe, expect, it } from 'vitest'
import type { Boite } from '../disposition'
import { cheminBranche, cheminEffile, couper, extremites, horsDuCadre, largeursEffile, pointDe, segmentsDe, trajetBranche, versChemin } from './branches'

/** Un central de 200 × 60 centré en (0, 0), un principal souligné à sa droite, et des enfants à la suite. */
const central: Boite = { x: -100, y: -30, l: 200, h: 60 }
const principal: Boite = { x: 150, y: -140, l: 100, h: 45 }
const enfant: Boite = { x: 276, y: -160, l: 120, h: 30 }

describe('où touche une branche', () => {
  it('au milieu du bord d’un sujet ordinaire', () => {
    expect(extremites(central, principal, 'droite')).toEqual([[100, 0], [150, -117.5]])
  })

  it('sur l’axe du souligné d’un sujet souligné : son épaisseur est dans la boîte, la branche suit le trait', () => {
    expect(extremites(principal, enfant, 'droite', { parent: 5, enfant: 1 })).toEqual([[250, -97.5], [276, -130.5]])
    // Sans épaisseur connue : le bord bas du sujet.
    expect(extremites(principal, enfant, 'droite', { parent: true, enfant: true })).toEqual([[250, -95], [276, -130]])
  })

  it('un souligné de gauche à droite se prolonge d’un niveau à l’autre : le trait de l’enfant est dans l’axe de la branche', () => {
    const [, [xe, ye]] = extremites(principal, enfant, 'droite', { parent: 5, enfant: 1 })
    expect(xe).toBe(enfant.x)
    // L'axe de l'enfant est celui de son souligné : le trait commence où finit la branche.
    expect(ye).toBe(enfant.y + enfant.h - 1 / 2)
  })
})

describe('le coude', () => {
  it('un coude à angles droits : horizontale, verticale à mi-chemin, horizontale, sur l’axe des soulignés', () => {
    expect(cheminBranche(principal, enfant, 'droite', 'coudee', { parent: 5, enfant: 1 })).toBe('M250 -97.5H263V-130.5H276')
  })

  it('un coude arrondi : des angles de 10 px au plus', () => {
    const d = cheminBranche(principal, enfant, 'droite', 'coudee-arrondie', { parent: 5, enfant: 1 })
    expect(d).toBe('M250 -97.5H253Q263 -97.5 263 -107.5V-120.5Q263 -130.5 273 -130.5H276')
    // Moins de place : le rayon se réduit à ce qui reste entre les deux sujets.
    const serre: Boite = { x: 262, y: -160, l: 120, h: 30 }
    expect(cheminBranche(principal, serre, 'droite', 'coudee-arrondie', { parent: 5, enfant: 1 })).toBe('M250 -97.5H250Q256 -97.5 256 -103.5V-124.5Q256 -130.5 262 -130.5H262')
  })

  it('à la même hauteur : une droite', () => {
    const a: Boite = { x: 0, y: 0, l: 50, h: 20 }
    expect(cheminBranche(a, { x: 80, y: 0, l: 40, h: 20 }, 'droite', 'coudee-arrondie')).toBe('M50 10H80')
  })

  it('depuis le central : le coude sort du dessous du corps, à un tiers de sa largeur du centre, vers le haut ou vers le bas', () => {
    const s = { parent: 0, enfant: 5, centre: true }
    expect(cheminBranche(central, principal, 'droite', 'coudee', s)).toBe('M66.7 -30V-97.5H150')
    const bas: Boite = { x: 150, y: 90, l: 100, h: 45 }
    expect(cheminBranche(central, bas, 'droite', 'coudee', s)).toBe('M66.7 30V132.5H150')
  })

  it('depuis le central, côté gauche : le départ est du côté de l’enfant', () => {
    const gauche: Boite = { x: -250, y: -140, l: 100, h: 45 }
    expect(cheminBranche(central, gauche, 'gauche', 'coudee', { enfant: 5, centre: true })).toBe('M-66.7 -30V-97.5H-150')
  })

  it('depuis le central, arrondi : un coin de 10 px où la verticale rejoint l’horizontale', () => {
    expect(cheminBranche(central, principal, 'droite', 'coudee-arrondie', { enfant: 5, centre: true })).toBe('M66.7 -30V-87.5Q66.7 -97.5 76.7 -97.5H150')
  })

  it('depuis le central, un enfant à sa hauteur : une horizontale depuis son bord', () => {
    const a: Boite = { x: 150, y: -20, l: 100, h: 40 }
    expect(cheminBranche(central, a, 'droite', 'coudee-arrondie', { centre: true })).toBe('M100 0H150')
  })

  it('un central souligné ne sort pas de dessous : sa branche part de son souligné', () => {
    expect(cheminBranche(central, principal, 'droite', 'coudee', { parent: 2, enfant: 5, centre: true })).toBe('M100 29H125V-97.5H150')
  })
})

/** Un parent à gauche, un enfant en haut à droite : l'écart de croissance (x) est de 100, l'écart en travers (y) de −60. */
const parent: Boite = { x: 0, y: 0, l: 50, h: 20 }
const haut: Boite = { x: 150, y: -60, l: 40, h: 20 }

describe('les formes de Xmind', () => {
  it('la courbe organique : un arc dont le point de contrôle est à 20 % de la croissance et au niveau de l’enfant', () => {
    expect(cheminBranche(parent, haut, 'droite', 'organique')).toBe('M50 10Q70 -50 150 -50')
  })

  it('la courbe organique dans l’autre sens de croissance : vers le bas', () => {
    const bas: Boite = { x: 100, y: 80, l: 40, h: 20 }
    expect(cheminBranche(parent, bas, 'bas', 'organique')).toBe('M25 20Q120 32 120 80')
  })

  it('l’anse : une cubique à plat, dont les contrôles sont à 75 % puis 50 % de la croissance', () => {
    expect(cheminBranche(parent, haut, 'droite', 'anse')).toBe('M50 10C125 10 100 -50 150 -50')
  })

  it('le pli : un biais jusqu’aux deux tiers de la croissance, puis l’axe', () => {
    expect(cheminBranche(parent, haut, 'droite', 'pli')).toBe('M50 10L116.7 -50L150 -50')
  })

  it('le pli arrondi : un coin à la moitié, arrondi d’un rayon moitié moindre côté arrivée', () => {
    const [a, coin, b] = segmentsDe(cheminBranche(parent, haut, 'droite', 'pli-arrondi'))
    expect(a![0]).toBe('L')
    expect(coin![0]).toBe('Q')
    expect(b![0]).toBe('L')
    // Le point de contrôle est le coin, à la moitié de la croissance et au niveau de l’enfant.
    expect((coin as readonly ['Q', readonly [number, number], readonly [number, number], readonly [number, number]])[2]).toEqual([100, -50])
    // Côté arrivée, le rayon est de 15 (la moitié des 30 du côté départ) : l’arrondi finit à 15 du coin.
    expect(b![1]).toEqual([115, -50])
    expect(b![2]).toEqual([150, -50])
  })

  it('la droite part de l’axe de son souligné comme les autres formes', () => {
    expect(cheminBranche(parent, haut, 'droite', 'droite', { parent: 2, enfant: 1 })).toBe('M50 19L150 -40.5')
  })

  it('depuis le central, la courbe organique naît sous lui et ne se montre qu’à sa sortie', () => {
    const [premier] = segmentsDe(cheminBranche(central, principal, 'droite', 'organique', { centre: true }))
    const [x, y] = premier![1]
    // Elle sort par le haut du corps du central, un peu à droite du tiers de sa largeur.
    expect(Math.abs(y + 30)).toBeLessThan(1)
    expect(x).toBeGreaterThan(66)
    expect(x).toBeLessThan(80)
    // Elle arrive sur le bord de l’enfant, à mi-hauteur.
    const dernierSegment = segmentsDe(cheminBranche(central, principal, 'droite', 'organique', { centre: true })).at(-1)!
    expect(dernierSegment.at(-1)).toEqual([150, -117.5])
  })

  it('un enfant à la hauteur du central : une horizontale depuis son bord', () => {
    const a: Boite = { x: 150, y: -20, l: 100, h: 40 }
    const [premier] = segmentsDe(cheminBranche(central, a, 'droite', 'organique', { centre: true }))
    expect(premier![1][1]).toBeCloseTo(0, 5)
    expect(Math.abs(premier![1][0] - 100)).toBeLessThan(1)
  })

  it('côté gauche : le départ est du côté de l’enfant', () => {
    const gauche: Boite = { x: -250, y: -140, l: 100, h: 45 }
    const [premier] = segmentsDe(cheminBranche(central, gauche, 'gauche', 'organique', { centre: true }))
    expect(premier![1][0]).toBeLessThan(-60)
    expect(Math.abs(premier![1][1] + 30)).toBeLessThan(1)
  })

  it('un central souligné ne cache rien : la branche part de son souligné', () => {
    const [premier] = segmentsDe(cheminBranche(central, principal, 'droite', 'organique', { parent: 2, centre: true }))
    expect(premier![1]).toEqual([100, 29])
  })

  it('la droite, le pli et le pli arrondi ne naissent sous le central qu’avec le départ rayonnant d’un squelette', () => {
    for (const f of ['droite', 'pli', 'pli-arrondi'] as const) {
      const sans = segmentsDe(cheminBranche(central, principal, 'droite', f, { centre: true }))[0]![1]
      const avec = segmentsDe(cheminBranche(central, principal, 'droite', f, { centre: true, radial: true }))[0]![1]
      expect(sans, f).toEqual([100, 0])
      expect(Math.abs(avec[1] + 30), f).toBeLessThan(1)
    }
  })

  it('l’anse part du bord du central, jamais de dessous', () => {
    expect(segmentsDe(cheminBranche(central, principal, 'droite', 'anse', { centre: true, radial: true }))[0]![1]).toEqual([100, 0])
  })
})

describe('les trajets', () => {
  it('lire un chemin et le réécrire donne le même chemin', () => {
    for (const d of ['M0 0L10 5Q20 5 30 0L40 0', 'M50 10C125 10 100 -50 150 -50']) expect(versChemin(segmentsDe(d))).toBe(d)
    // H et V se lisent comme des droites.
    expect(versChemin(segmentsDe('M250 -97.5H263V-130.5H276'))).toBe('M250 -97.5L263 -97.5L263 -130.5L276 -130.5')
    expect(segmentsDe('M0 0H10V5')).toEqual([['L', [0, 0], [10, 0]], ['L', [10, 0], [10, 5]]])
  })

  it('couper un segment : les deux moitiés se rejoignent, et se recollent en la même courbe', () => {
    const g = segmentsDe('M50 10C125 10 100 -50 150 -50')[0]!
    const [a, b] = couper(g, 0.3)
    expect(a.at(-1)).toEqual(b[1])
    expect(a[1]).toEqual(g[1])
    expect(b.at(-1)).toEqual(g.at(-1))
    const [x, y] = pointDe(g, 0.3)
    expect(a.at(-1)![0]).toBeCloseTo(x, 8)
    expect(a.at(-1)![1]).toBeCloseTo(y, 8)
  })

  it('ce qui sort d’un cadre : le trajet est coupé à la sortie, une part de sa longueur est cachée', () => {
    const segments = segmentsDe('M0 0H100')
    const { segments: reste, debut } = horsDuCadre(segments, { x: -10, y: -10, l: 20, h: 20 })
    expect(reste[0]![1][0]).toBeCloseTo(10, 0)
    expect(debut).toBeCloseTo(0.1, 1)
    // Un trajet qui ne commence pas dans le cadre reste entier.
    expect(horsDuCadre(segments, { x: 50, y: -10, l: 20, h: 20 })).toEqual({ segments, debut: 0 })
  })

  it('« aucune » et les troncs d’arbre n’ont pas de trajet', () => {
    expect(trajetBranche(parent, haut, 'droite', 'aucune')).toBeNull()
    expect(trajetBranche(parent, haut, 'droite', 'arbre')).toBeNull()
    expect(trajetBranche(parent, haut, 'droite', 'coudee')!.segments).toHaveLength(3)
  })
})

describe('l’effilé', () => {
  it('la largeur au départ, en épaisseurs : 3,6 pour la courbe, 3 pour la droite et l’anse, 2,4 pour les coudes', () => {
    expect(largeursEffile('organique', 1)).toEqual([3.6, 1])
    expect(largeursEffile('courbe', 1)).toEqual([3.6, 1])
    expect(largeursEffile('droite', 1)).toEqual([3, 1])
    expect(largeursEffile('anse', 1)).toEqual([3, 1])
    expect(largeursEffile('pli', 2)).toEqual([2.4, 2.4, 1])
  })

  it('un coude garde sa largeur jusqu’au dernier segment, qui seul s’effile', () => {
    expect(largeursEffile('coudee', 3)).toEqual([2.4, 2.4, 2.4, 1])
    expect(largeursEffile('coudee-arrondie', 5)).toEqual([2.4, 2.4, 2.4, 2.4, 2.4, 1])
  })

  it('le pli arrondi passe par 2 à son coin', () => {
    expect(largeursEffile('pli-arrondi', 3)).toEqual([3, 2, 2, 1])
  })

  /** Les points d'un polygone `M…L…Z`, à plat. */
  const points = (d: string) => d.slice(1, -1).split('L').map((p) => p.split(' ').map(Number) as [number, number])

  it('une surface fermée, plus large au départ qu’à l’arrivée, de 3,6 épaisseurs à 1', () => {
    const d = cheminEffile(parent, haut, 'droite', 'organique', {}, 2)!
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).not.toMatch(/[QCHV]/)
    const p = points(d)
    const [n2] = [p.length / 2]
    // Le bord gauche s'écrit du départ à l'arrivée, le droit de l'arrivée au départ.
    const largeur = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])
    expect(largeur(p[0]!, p[p.length - 1]!)).toBeCloseTo(7.2, 0)
    expect(largeur(p[n2 - 1]!, p[n2]!)).toBeCloseTo(2, 0)
  })

  it('depuis le central, la part cachée sous lui a déjà aminci la branche à sa sortie', () => {
    const d = cheminEffile(central, principal, 'droite', 'organique', { centre: true }, 2)!
    const p = points(d)
    const largeur = Math.hypot(p[0]![0] - p.at(-1)![0], p[0]![1] - p.at(-1)![1])
    expect(largeur).toBeLessThan(7.2)
    expect(largeur).toBeGreaterThan(5)
  })

  it('toute forme s’effile ; « aucune » et les troncs d’arbre gardent leur trait', () => {
    for (const f of ['courbe', 'organique', 'droite', 'coudee', 'coudee-arrondie', 'anse', 'pli', 'pli-arrondi'] as const) expect(cheminEffile(principal, enfant, 'droite', f, { parent: 5, enfant: 1 }, 2), f).toMatch(/^M.*Z$/)
    expect(cheminEffile(parent, haut, 'droite', 'aucune', {}, 2)).toBeNull()
    expect(cheminEffile(parent, haut, 'droite', 'arbre', {}, 2)).toBeNull()
  })
})
