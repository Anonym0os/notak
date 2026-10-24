import { describe, expect, it } from 'vitest'
import { type Camera, ZOOM_MAX, ZOOM_MIN, borner, borneZoom, defilementAuto, facteurMolette, interpoler, margeEcran, reveler, zoomAutour } from './camera'

const fenetre = { l: 1000, h: 800 }

describe('le zoom à la molette', () => {
  it('le facteur d’un cran : 1 + deltaY × −0,01, borné à ± 0,5', () => {
    expect(facteurMolette(-10)).toBeCloseTo(1.1)
    expect(facteurMolette(20)).toBeCloseTo(0.8)
    expect(facteurMolette(-50)).toBeCloseTo(1.5)
    expect(facteurMolette(-500)).toBeCloseTo(1.5)
    expect(facteurMolette(500)).toBeCloseTo(0.5)
    expect(facteurMolette(0)).toBe(1)
  })

  it('zoome autour du pointeur : le point de la carte dessous ne bouge pas', () => {
    const c: Camera = { x: 100, y: 50, z: 1 }
    const p = { x: 300, y: 200 }
    const avant = { x: (p.x - c.x) / c.z, y: (p.y - c.y) / c.z }
    const z = zoomAutour(c, 1.5, p)
    expect(z.z).toBeCloseTo(1.5)
    expect((p.x - z.x) / z.z).toBeCloseTo(avant.x)
    expect((p.y - z.y) / z.z).toBeCloseTo(avant.y)
  })

  it('le zoom reste entre 0,1 et 5', () => {
    expect(ZOOM_MIN).toBe(0.1)
    expect(ZOOM_MAX).toBe(5)
    expect(zoomAutour({ x: 0, y: 0, z: 4 }, 3, { x: 0, y: 0 }).z).toBe(5)
    expect(zoomAutour({ x: 0, y: 0, z: 0.2 }, 0.1, { x: 0, y: 0 }).z).toBe(0.1)
    expect(borneZoom(7)).toBe(5)
    expect(borneZoom(0.01)).toBe(0.1)
  })
})

describe('la marge', () => {
  it('le plus grand de 20 px de carte et de 5 % de la dimension visible', () => {
    expect(margeEcran(1000, 1)).toBe(50)
    expect(margeEcran(800, 1)).toBe(40)
    expect(margeEcran(200, 1)).toBe(20)
    expect(margeEcran(1000, 2)).toBe(50)
    expect(margeEcran(1000, 4)).toBe(80)
  })
})

describe('l’étendue défilable', () => {
  const contenu = { x: -200, y: -100, l: 600, h: 300 }

  it('laisse la caméra où elle est tant qu’elle y tient', () => {
    const c: Camera = { x: 500, y: 400, z: 1 }
    expect(borner(c, contenu, fenetre)).toBe(c)
  })

  it('on pousse la carte jusqu’à ce qu’elle ne touche plus la fenêtre que par un bord, pas plus loin', () => {
    // À droite : le bord gauche du contenu (−200) à la droite de la fenêtre (1000) donne x = 1200.
    expect(borner({ x: 5000, y: 400, z: 1 }, contenu, fenetre).x).toBe(1200)
    // À gauche : le bord droit du contenu (400) à gauche de la fenêtre donne x = −400.
    expect(borner({ x: -5000, y: 400, z: 1 }, contenu, fenetre).x).toBe(-400)
    expect(borner({ x: 500, y: 5000, z: 1 }, contenu, fenetre).y).toBe(900)
    expect(borner({ x: 500, y: -5000, z: 1 }, contenu, fenetre).y).toBe(-200)
  })

  it('suit le zoom, et ne bride rien tant que la surface n’est pas mesurée', () => {
    expect(borner({ x: 5000, y: 0, z: 2 }, contenu, fenetre).x).toBe(1400)
    const c: Camera = { x: 99999, y: 0, z: 1 }
    expect(borner(c, contenu, { l: 0, h: 0 })).toBe(c)
  })
})

describe('ramener un sujet dans la vue', () => {
  const c: Camera = { x: 500, y: 400, z: 1 }
  const boite = (x: number, y: number) => ({ x, y, l: 100, h: 40 })

  it('un sujet bien dans la vue ne fait pas bouger la caméra', () => {
    expect(reveler(c, fenetre, boite(0, 0))).toBeNull()
    expect(reveler(c, fenetre, boite(-400, -300))).toBeNull()
  })

  it('un sujet qui sort : du minimum, avec la marge de 5 %, en largeur comme en hauteur', () => {
    // Bord droit à 500 + 480 + 100 = 1080 : marge de 50 sur 1000, donc la limite est 950, il faut reculer de 130.
    expect(reveler(c, fenetre, boite(480, 0))).toEqual({ x: 370, y: 400, z: 1 })
    // Bord gauche à 500 − 480 = 20, sous la marge de 50 : avancer de 30.
    expect(reveler(c, fenetre, boite(-480, 0))).toEqual({ x: 530, y: 400, z: 1 })
    // En bas : marge de 40 sur 800, limite 760 ; bord bas à 400 + 400 + 40 = 840, reculer de 80.
    expect(reveler(c, fenetre, boite(0, 400))).toEqual({ x: 500, y: 320, z: 1 })
    // En haut : bord haut à 400 − 380 = 20, la limite est 40 : avancer de 20.
    expect(reveler(c, fenetre, boite(0, -380))).toEqual({ x: 500, y: 420, z: 1 })
  })

  it('un sujet plus grand que la fenêtre rétrécie est centré', () => {
    const grand = { x: -50, y: 0, l: 2000, h: 40 }
    const r = reveler(c, fenetre, grand)!
    expect(r.x + (grand.x + grand.l / 2) * c.z).toBeCloseTo(fenetre.l / 2)
  })

  it('si le décalage sortirait de l’étendue défilable, la demande est ignorée', () => {
    expect(reveler(c, fenetre, boite(480, 0), { x: -2000, y: -100, l: 100, h: 300 })).toBeNull()
    expect(reveler(c, fenetre, boite(480, 0), { x: -200, y: -100, l: 2000, h: 300 })).not.toBeNull()
  })

  it('sans surface mesurée, rien ne bouge', () => {
    expect(reveler(c, { l: 0, h: 0 }, boite(480, 0))).toBeNull()
  })
})

describe('l’auto-défilement près du bord', () => {
  it('rien tant que le pointeur reste dans la zone morte', () => {
    expect(defilementAuto({ x: 500, y: 400 }, fenetre, 1)).toEqual({ dx: 0, dy: 0 })
    expect(defilementAuto({ x: 50, y: 40 }, fenetre, 1)).toEqual({ dx: 0, dy: 0 })
    expect(defilementAuto({ x: 950, y: 760 }, fenetre, 1)).toEqual({ dx: 0, dy: 0 })
  })

  it('12 % de ce que le pointeur dépasse, vers l’intérieur', () => {
    // Au ras du bord gauche, dans une marge de 50 : 12 % de 50.
    expect(defilementAuto({ x: 0, y: 400 }, fenetre, 1).dx).toBeCloseTo(6)
    expect(defilementAuto({ x: 1000, y: 400 }, fenetre, 1).dx).toBeCloseTo(-6)
    expect(defilementAuto({ x: 500, y: 0 }, fenetre, 1).dy).toBeCloseTo(4.8)
    expect(defilementAuto({ x: 500, y: 800 }, fenetre, 1).dy).toBeCloseTo(-4.8)
  })

  it('sans plafond : plus le pointeur sort, plus ça va vite', () => {
    expect(defilementAuto({ x: -500, y: 400 }, fenetre, 1).dx).toBeCloseTo(66)
  })

  it('une marge de 20 px de carte : 2,4 px par image au ras de la fenêtre, quand elle est étroite', () => {
    expect(defilementAuto({ x: 0, y: 100 }, { l: 200, h: 200 }, 1).dx).toBeCloseTo(2.4)
  })
})

describe('le mouvement de la caméra', () => {
  it('interpole linéairement', () => {
    const de: Camera = { x: 0, y: 0, z: 1 }
    const vers: Camera = { x: 100, y: -40, z: 2 }
    expect(interpoler(de, vers, 0)).toEqual(de)
    expect(interpoler(de, vers, 1)).toEqual(vers)
    expect(interpoler(de, vers, 0.5)).toEqual({ x: 50, y: -20, z: 1.5 })
  })
})
