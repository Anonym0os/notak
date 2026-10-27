import { describe, expect, it } from 'vitest'
import { IMAGE_MS, VOL_REPOS, inclinaisonMax, pasDePose, pasEnVol, transformation } from './vol'

const droit = { incliner: false, max: 0 }
const penche = { incliner: true, max: 20 }

describe('vol', () => {
  it('rattrape 60 % de l’écart par image, 50 % quand il s’incline', () => {
    expect(pasEnVol(VOL_REPOS, { x: 100, y: 0 }, 0, IMAGE_MS, droit).x).toBeCloseTo(60)
    expect(pasEnVol(VOL_REPOS, { x: 100, y: 0 }, 0, IMAGE_MS, penche).x).toBeCloseTo(50)
  })

  it('rattrape le retard d’une image lente sans dépasser la cible', () => {
    expect(pasEnVol(VOL_REPOS, { x: 100, y: 0 }, 0, IMAGE_MS * 3, droit).x).toBe(100)
  })

  it('s’incline dans le sens du mouvement, sans dépasser le maximum', () => {
    let v = VOL_REPOS
    for (let i = 0; i < 60; i++) v = pasEnVol(v, { x: v.x + 500, y: 0 }, 500, IMAGE_MS, penche)
    expect(v.ry).toBeGreaterThan(19)
    expect(v.ry).toBeLessThanOrEqual(20)
    expect(v.rx).toBeCloseTo(0)
  })

  it('monte l’ombre de 5 % par image, jusqu’à la distance parcourue sur 50 px', () => {
    expect(pasEnVol(VOL_REPOS, { x: 0, y: 0 }, 100, IMAGE_MS, droit).ombre).toBeCloseTo(0.05)
    expect(pasEnVol({ ...VOL_REPOS, ombre: 0.3 }, { x: 0, y: 0 }, 10, IMAGE_MS, droit).ombre).toBeCloseTo(0.3)
  })

  it('se repose : redressé, ombre éteinte, exactement à sa place', () => {
    let r = { vol: { x: 37, y: -12, rx: 8, ry: -15, ombre: 1 }, fini: false }
    let images = 0
    while (!r.fini && images++ < 100) r = pasDePose(r.vol, { x: 30, y: -10 }, IMAGE_MS, penche)
    expect(r.fini).toBe(true)
    expect(r.vol).toEqual({ x: 30, y: -10, rx: 0, ry: 0, ombre: 0 })
    expect(images).toBeLessThan(20)
  })

  it('incline moins un grand élément', () => {
    expect(inclinaisonMax(340)).toBeCloseTo(18.9, 1)
    expect(inclinaisonMax(100)).toBe(25)
    expect(inclinaisonMax(2000)).toBeLessThan(4)
  })

  it('écrit la transformation, décalée de la place déjà posée', () => {
    expect(transformation({ x: 12, y: 5, rx: 0, ry: 0, ombre: 0 }, { x: 10, y: 0 })).toBe('translate(2px, 5px)')
    expect(transformation({ x: 0, y: 0, rx: 1, ry: 2, ombre: 0 })).toContain('rotateY(2deg)')
  })
})

describe('au doigt', () => {
  it('l’élément colle au doigt : une image suffit à le rejoindre, il s’incline encore', () => {
    const v = pasEnVol(VOL_REPOS, { x: 120, y: 40 }, 130, 16, { incliner: true, max: 10, colle: true })
    expect([v.x, v.y]).toEqual([120, 40])
    expect(v.ry).not.toBe(0)
  })

  it('à la souris, il le suit avec son retard', () => {
    const v = pasEnVol(VOL_REPOS, { x: 120, y: 40 }, 130, 16, { incliner: true, max: 10 })
    expect(v.x).toBeLessThan(120)
  })
})

