import { describe, expect, it } from 'vitest'
import type { Boite } from '../disposition'
import { cheminBranche, extremites } from './branches'

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
