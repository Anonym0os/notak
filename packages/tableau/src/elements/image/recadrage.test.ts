import { describe, expect, test } from 'vitest'
import type { Image } from '../../coeur/tableau'
import { CADRE_PLEIN, COTE_MIN, avecRecadrage, deplacerCadre, tirerCadre, versSource } from './recadrage'

const image: Image = { type: 'image', fichier: 'f', largeurOrigine: 200, hauteurOrigine: 100 }

describe('cadre de recadrage', () => {
  test('glissé, il reste dans l’image', () => {
    const c = { x: 0.2, y: 0.2, l: 0.5, h: 0.5 }
    const bouge = deplacerCadre(c, 0.1, -0.1)
    expect(bouge.x).toBeCloseTo(0.3)
    expect(bouge.y).toBeCloseTo(0.1)
    expect(deplacerCadre(c, 5, 5)).toEqual({ x: 0.5, y: 0.5, l: 0.5, h: 0.5 })
    expect(deplacerCadre(c, -5, -5)).toMatchObject({ x: 0, y: 0 })
  })

  test('un coin tiré laisse le coin opposé en place', () => {
    const c = { x: 0.2, y: 0.2, l: 0.4, h: 0.4 }
    const r = tirerCadre(c, 'se', 0.2, 0.1)
    expect(r.x).toBe(0.2)
    expect(r.y).toBe(0.2)
    expect(r.l).toBeCloseTo(0.6)
    expect(r.h).toBeCloseTo(0.5)
    const n = tirerCadre(c, 'nw', -0.1, -0.1)
    expect(n.x + n.l).toBeCloseTo(0.6)
    expect(n.y + n.h).toBeCloseTo(0.6)
  })

  test('on ne le tire ni hors de l’image ni sous la taille minimale', () => {
    expect(tirerCadre(CADRE_PLEIN, 'se', 3, 3)).toEqual(CADRE_PLEIN)
    const petit = tirerCadre({ x: 0.2, y: 0.2, l: 0.4, h: 0.4 }, 'se', -5, -5)
    expect(petit.l).toBeCloseTo(COTE_MIN)
    expect(petit.h).toBeCloseTo(COTE_MIN)
  })
})

describe('du cadre à l’image d’origine', () => {
  const haut = { x: 0.5, y: 0, l: 0.5, h: 0.25 } // en haut à droite de l’image montrée

  test('sans rotation, le cadre est la partie gardée', () => {
    expect(versSource(haut, 0)).toEqual({ x: 0.5, y: 0, largeur: 0.5, hauteur: 0.25 })
  })

  test('après un quart de tour à droite, le haut droit montré est le haut gauche… d’origine', () => {
    // Tourné à 90° : le coin haut gauche d’origine est en haut à droite de l’image montrée.
    expect(versSource({ x: 0.75, y: 0, l: 0.25, h: 0.5 }, 90)).toEqual({ x: 0, y: 0, largeur: 0.5, hauteur: 0.25 })
  })

  test('à 180°, le coin haut gauche montré est le bas droit d’origine', () => {
    expect(versSource({ x: 0, y: 0, l: 0.25, h: 0.5 }, 180)).toEqual({ x: 0.75, y: 0.5, largeur: 0.25, hauteur: 0.5 })
  })

  test('à 270°, le coin bas gauche montré est le coin haut gauche d’origine', () => {
    expect(versSource({ x: 0, y: 0.75, l: 0.25, h: 0.25 }, 270)).toEqual({ x: 0, y: 0, largeur: 0.25, hauteur: 0.25 })
  })

  test('l’image entière n’est pas un recadrage', () => {
    for (const r of [0, 90, 180, 270] as const) expect(versSource(CADRE_PLEIN, r)).toBeUndefined()
  })

  test('avecRecadrage pose puis retire la clé', () => {
    const rogne = avecRecadrage(image, haut)
    expect(rogne.recadrage).toEqual({ x: 0.5, y: 0, largeur: 0.5, hauteur: 0.25 })
    expect('recadrage' in avecRecadrage(rogne, CADRE_PLEIN)).toBe(false)
  })

  test('tient compte de la rotation de l’image', () => {
    expect(avecRecadrage({ ...image, rotation: 90 }, { x: 0.75, y: 0, l: 0.25, h: 0.5 }).recadrage).toEqual({
      x: 0,
      y: 0,
      largeur: 0.5,
      hauteur: 0.25,
    })
  })
})

describe('recadrage d’une image retournée', () => {
  test('le cadre montré est retourné avant d’être rendu à l’image d’origine', () => {
    const cadre = { x: 0, y: 0, l: 0.25, h: 0.5 }
    expect(versSource(cadre, 0, { h: true })).toEqual({ x: 0.75, y: 0, largeur: 0.25, hauteur: 0.5 })
    expect(versSource(cadre, 0, { v: true })).toEqual({ x: 0, y: 0.5, largeur: 0.25, hauteur: 0.5 })
    expect(avecRecadrage({ ...image, miroirH: true }, cadre).recadrage).toEqual({ x: 0.75, y: 0, largeur: 0.25, hauteur: 0.5 })
  })

  test('un recadrage à la main remplace le cadrage libre ; un cadre entier le laisse', () => {
    const libre: Image = { ...image, rapportCadre: 1 }
    expect(avecRecadrage(libre, { x: 0, y: 0, l: 0.5, h: 0.5 }).rapportCadre).toBeUndefined()
    expect(avecRecadrage(libre, CADRE_PLEIN).rapportCadre).toBe(1)
  })
})
