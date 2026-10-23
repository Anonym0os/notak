import { describe, expect, it } from 'vitest'
import { dessinDepuis } from './trace'

describe('dessin libre', () => {
  it('se pose au coin haut gauche de ses traits, marge comprise, et ramène les traits à son repère', () => {
    const d = dessinDepuis([{ points: [10, 20, 30, 25], couleur: '#000', epaisseur: 0.5 }])!
    expect([d.x, d.y]).toEqual([8, 18])
    expect(d.largeur).toBe(d.contenu.largeurOrigine)
    expect(d.contenu.largeurOrigine).toBe(24)
    expect(d.contenu.traits[0]!.points.slice(0, 2)).toEqual([2, 2])
  })

  it('garde tous les points des traits, arrondis au centième', () => {
    const d = dessinDepuis([{ points: [10, 20, 10.004, 20.5, 30, 25], couleur: '#000', epaisseur: 0.5 }])!
    expect(d.contenu.traits[0]!.points).toEqual([2, 2, 2, 2.5, 22, 7])
  })

  it('ne pose rien sans trait', () => {
    expect(dessinDepuis([])).toBeNull()
    expect(dessinDepuis([{ points: [], couleur: '#000', epaisseur: 1 }])).toBeNull()
  })
})
