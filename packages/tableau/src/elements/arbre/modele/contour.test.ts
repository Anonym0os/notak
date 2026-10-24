import { describe, expect, it } from 'vitest'
import { CONTOUR, PASTILLE, contourDe, echelleContour, pastillesDe } from './contour'

describe('le contour de sélection', () => {
  it('2 px de trait, à 1 px du sujet, aux coins de 4 px', () => {
    expect(CONTOUR).toEqual({ ecart: 1, trait: 2, rayon: 4 })
    const c = contourDe(100, 40, 1)
    // La ligne centrale est à 1 px (l'écart) plus la moitié du trait du bord du sujet.
    expect(c).toEqual({ x: -2, y: -2, l: 104, h: 44, rayon: 4, trait: 2 })
  })

  it('sous 100 % de zoom, tout est multiplié par 1 / zoom : il garde sa taille à l’écran', () => {
    expect(echelleContour(0.5)).toBe(2)
    const c = contourDe(100, 40, 0.5)
    expect(c.trait).toBe(4)
    expect(c.rayon).toBe(8)
    expect(c.x).toBe(-4)
  })

  it('au-dessus de 100 % il suit la carte', () => {
    expect(echelleContour(2)).toBe(1)
    expect(contourDe(100, 40, 3).trait).toBe(2)
  })
})

describe('les pastilles « + »', () => {
  const b = { x: 100, y: 50, l: 120, h: 30 }

  it('un enfant à droite, un frère dessous, au milieu', () => {
    const p = pastillesDe(b, { gauche: false, souligne: false, replie: false, frere: true })
    expect(p.enfant.x).toBeGreaterThan(b.x + b.l)
    expect(p.enfant.y).toBe(b.y + b.h / 2)
    expect(p.frere!.x).toBe(b.x + b.l / 2)
    expect(p.frere!.y).toBeGreaterThan(b.y + b.h)
  })

  it('18 px de large, sans toucher le sujet ni le frère l’une l’autre', () => {
    const p = pastillesDe(b, { gauche: false, souligne: false, replie: false, frere: true })
    expect(PASTILLE.diametre).toBe(18)
    expect(p.enfant.x - PASTILLE.diametre / 2).toBeGreaterThan(b.x + b.l)
    expect(p.frere!.y - PASTILLE.diametre / 2).toBeGreaterThan(b.y + b.h)
  })

  it('une branche à gauche : l’enfant se met à gauche', () => {
    const p = pastillesDe(b, { gauche: true, souligne: false, replie: false, frere: true })
    expect(p.enfant.x).toBeLessThan(b.x)
  })

  it('un sujet souligné : l’enfant se met au niveau du trait', () => {
    expect(pastillesDe(b, { gauche: false, souligne: true, replie: false, frere: true }).enfant.y).toBeGreaterThan(b.y + b.h / 2)
  })

  it('un sujet replié : l’enfant va au-delà de la pastille de repli', () => {
    const normal = pastillesDe(b, { gauche: false, souligne: false, replie: false, frere: true })
    expect(pastillesDe(b, { gauche: false, souligne: false, replie: true, frere: true }).enfant.x).toBeGreaterThan(normal.enfant.x + 18)
  })

  it('le central, un flottant, un résumé n’ont pas de frère', () => {
    expect(pastillesDe(b, { gauche: false, souligne: false, replie: false, frere: false }).frere).toBeNull()
  })
})
