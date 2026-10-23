import { describe, expect, it } from 'vitest'
import type { Image, TraitImage } from '../../coeur/tableau'
import { COULEURS_TRAIT, COULEUR_TRAIT_DEFAUT, EPAISSEURS_PX, ajouterPoint, avecTraits, cheminTrait, couleurSure, epaisseurPour, gommer, traitVise, versImage } from './annotation'
import { pivoter, remplacerContenu } from './geometrie'

const image = (reste: Partial<Image> = {}): Image => ({ type: 'image', fichier: 'f', largeurOrigine: 1000, hauteurOrigine: 500, ...reste })
const trait = (points: [number, number][], reste: Partial<TraitImage> = {}): TraitImage => ({ couleur: '#e5383b', epaisseur: 0.005, points, ...reste })

describe('versImage', () => {
  it('est l’identité sur une image entière et droite', () => {
    expect(versImage(0.25, 0.75, image())).toEqual([0.25, 0.75])
  })
  it('replace le point dans la partie gardée par le recadrage', () => {
    const c = image({ recadrage: { x: 0.2, y: 0.4, largeur: 0.5, hauteur: 0.4 } })
    expect(versImage(0, 0, c)).toEqual([0.2, 0.4])
    expect(versImage(1, 1, c)).toEqual([0.7, 0.8])
    expect(versImage(0.5, 0.5, c)).toEqual([0.45, 0.6])
  })
  it('défait le quart de tour : les quatre coins de l’image tournée', () => {
    // À 90°, le coin haut gauche montré est le coin bas gauche de l'image d'origine.
    expect(versImage(0, 0, image({ rotation: 90 }))).toEqual([0, 1])
    expect(versImage(1, 0, image({ rotation: 90 }))).toEqual([0, 0])
    expect(versImage(0, 0, image({ rotation: 180 }))).toEqual([1, 1])
    // À 270°, le coin haut gauche montré est le coin haut droit de l'origine.
    expect(versImage(0, 0, image({ rotation: 270 }))).toEqual([1, 0])
    expect(versImage(0, 1, image({ rotation: 270 }))).toEqual([0, 0])
  })
  it('combine rotation et recadrage comme le fait le recadrage lui-même', () => {
    const c = image({ rotation: 90, recadrage: { x: 0, y: 0, largeur: 0.5, hauteur: 0.5 } })
    const [u, v] = versImage(0.5, 0.5, c)
    expect(u).toBeGreaterThanOrEqual(0)
    expect(u).toBeLessThanOrEqual(0.5)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(0.5)
  })
  it('défait les miroirs de l’écran avant le quart de tour', () => {
    expect(versImage(0, 0, image({ miroirH: true }))).toEqual([1, 0])
    expect(versImage(0, 0, image({ miroirV: true }))).toEqual([0, 1])
    // Miroir horizontal à l'écran, puis quart de tour : le coin haut gauche montré vient du coin haut droit montré avant le miroir.
    expect(versImage(0, 0, image({ rotation: 90, miroirH: true }))).toEqual(versImage(1, 0, image({ rotation: 90 })))
  })
  it('reste dans l’image quand le pointeur en sort', () => {
    expect(versImage(-0.3, 1.4, image())).toEqual([0, 1])
  })
})

describe('epaisseurPour', () => {
  it('garde la même épaisseur à l’écran quelle que soit la taille de l’image', () => {
    expect(epaisseurPour(3, 600)).toBeCloseTo(0.005)
    expect(epaisseurPour(3, 1200)).toBeCloseTo(0.0025)
  })
  it('reste entre deux bornes', () => {
    expect(epaisseurPour(3, 1_000_000)).toBe(0.0005)
    expect(epaisseurPour(3, 0)).toBe(0.2)
  })
  it('suit les épaisseurs du croquis : 2, 4, 8 et 32 pixels d’écran', () => {
    expect(EPAISSEURS_PX).toEqual([2, 4, 8, 32])
    expect(epaisseurPour(32, 800)).toBeCloseTo(0.04)
    expect(epaisseurPour(2, 800)).toBeCloseTo(0.0025)
  })
  it('la palette est celle du croquis, treize couleurs, l’encre d’abord', () => {
    expect(COULEURS_TRAIT).toHaveLength(13)
    expect(COULEUR_TRAIT_DEFAUT).toBe('#323b4a')
  })
})

describe('ajouterPoint', () => {
  const c = image()
  it('ajoute un point assez loin du précédent', () => {
    expect(ajouterPoint([[0.1, 0.1]], [0.2, 0.1], c)).toEqual([[0.1, 0.1], [0.2, 0.1]])
  })
  it('ignore un doublon exact du précédent, et rend le même tableau', () => {
    const points: [number, number][] = [[0.1, 0.1]]
    expect(ajouterPoint(points, [0.1, 0.1], c)).toBe(points)
  })
  it('garde tous les autres points, même très proches', () => {
    expect(ajouterPoint([[0.1, 0.1]], [0.1005, 0.1], c)).toHaveLength(2)
  })
})

describe('cheminTrait', () => {
  const c = image()
  it('passe dans l’espace des pixels d’origine', () => {
    expect(cheminTrait(trait([[0, 0], [1, 1]]), c)).toBe('M0 0L1000 500')
  })
  it('lisse par les milieux : chaque point contrôle une quadratique, le dernier segment est droit', () => {
    expect(cheminTrait(trait([[0, 0], [0.5, 1], [1, 0.5]]), c)).toBe('M0 0Q500 500 750 375L1000 250')
    expect(cheminTrait(trait([[0, 0], [0.2, 0], [0.4, 0], [0.6, 0]]), c)).toBe('M0 0Q200 0 300 0Q400 0 500 0L600 0')
  })
  it('un point seul fait un rond', () => {
    expect(cheminTrait(trait([[0.1, 0.2]]), c)).toBe('M100 100l0 0')
  })
  it('un trait vide ne dessine rien', () => {
    expect(cheminTrait(trait([]), c)).toBe('')
  })
})

describe('traitVise', () => {
  const c = image()
  const bas = trait([[0.1, 0.5], [0.9, 0.5]])
  const haut = trait([[0.1, 0.5], [0.9, 0.5]], { couleur: '#7cd651' })
  it('vise le trait le plus haut sous la gomme', () => {
    expect(traitVise([bas, haut], [0.5, 0.5], 0.01, c)).toBe(1)
  })
  it('-1 quand rien n’est touché', () => {
    expect(traitVise([bas, haut], [0.5, 0.9], 0.01, c)).toBe(-1)
  })
})

describe('couleurSure', () => {
  it('ne laisse passer que #rrggbb', () => {
    expect(couleurSure('#1d6fe5')).toBe('#1d6fe5')
    expect(couleurSure('red')).toBe(COULEUR_TRAIT_DEFAUT)
    expect(couleurSure('url(#x)')).toBe(COULEUR_TRAIT_DEFAUT)
  })
})

describe('avecTraits', () => {
  it('pose les traits', () => {
    expect(avecTraits(image(), [trait([[0, 0]])]).traits).toHaveLength(1)
  })
  it('retire la clé quand il n’y en a plus', () => {
    expect('traits' in avecTraits(image({ traits: [trait([[0, 0]])] }), [])).toBe(false)
  })
})

describe('gommer', () => {
  const c = image()
  const gauche = trait([[0.1, 0.5], [0.2, 0.5]])
  const droite = trait([[0.8, 0.5], [0.9, 0.5]])
  it('retire le trait que la gomme touche, pas les autres', () => {
    const reste = gommer([gauche, droite], [0.15, 0.5], 0.01, c)
    expect(reste).toEqual([droite])
    expect(reste[0]).toBe(droite)
  })
  it('touche un trait par le milieu d’un segment', () => {
    expect(gommer([trait([[0, 0.5], [1, 0.5]])], [0.5, 0.52], 0.01, c)).toEqual([])
  })
  it('laisse un trait hors de portée', () => {
    expect(gommer([gauche], [0.15, 0.7], 0.01, c)).toEqual([gauche])
  })
  it('compte la demi-épaisseur du trait dans la portée', () => {
    // 0,02 de la largeur = 20 px, donc 10 px de demi-épaisseur ; la gomme ajoute 1 px.
    const gras = trait([[0.1, 0.5], [0.2, 0.5]], { epaisseur: 0.02 })
    expect(gommer([gras], [0.15, 0.53], 0.001, c)).toEqual([gras]) // 15 px plus bas
    expect(gommer([gras], [0.15, 0.518], 0.001, c)).toEqual([]) // 9 px plus bas
  })
  it('efface un point seul', () => {
    const point = trait([[0.5, 0.5]])
    expect(gommer([point], [0.5, 0.5], 0.01, c)).toEqual([])
    expect(gommer([point], [0.9, 0.9], 0.01, c)).toEqual([point])
  })
})

describe('les traits suivent l’image', () => {
  it('pivoter les garde : ils sont relatifs à l’image d’origine', () => {
    expect(pivoter(image({ traits: [trait([[0.1, 0.1]])] })).traits).toHaveLength(1)
  })
  it('remplacer l’image les retire', () => {
    const { fichier: _, ...autre } = image({ traits: [trait([[0.2, 0.2]])] })
    expect(remplacerContenu(image(), autre, 'g').traits).toBeUndefined()
  })
})
