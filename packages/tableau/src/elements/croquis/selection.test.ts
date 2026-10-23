import { describe, expect, it } from 'vitest'
import type { Trait } from '../../coeur/tableau'
import { appliquerAuChoix, appuiSurTrait, boiteTrait, couleurSous, decalageFleche, deplacerTraits, ordonnerTraits, sansTraits, traitsDansMarquise } from './selection'

const a: Trait = { points: [0, 0, 10, 0], couleur: '#ff5757', epaisseur: 2 }
const b: Trait = { points: [50, 50, 60, 60], couleur: '#4ebafd', epaisseur: 4 }
const c: Trait = { points: [100, 0, 110, 0], couleur: '#ffffff', epaisseur: 2 }

describe('sélection partagée', () => {
  it('le rectangle d’un trait compte son épaisseur', () => {
    expect(boiteTrait(a)).toEqual({ x0: -1, y0: -1, x1: 11, y1: 1 })
  })

  it('la marquise prend les traits qu’elle touche, dans les deux sens', () => {
    expect(traitsDansMarquise([a, b, c], { x0: 5, y0: -5, x1: 55, y1: 55 })).toEqual([a, b])
    expect(traitsDansMarquise([a, b, c], { x0: 55, y0: 55, x1: 5, y1: -5 })).toEqual([a, b])
    expect(traitsDansMarquise([a, b, c], { x0: 200, y0: 200, x1: 300, y1: 300 })).toEqual([])
  })

  it('déplace le choix seul et suit les nouveaux traits', () => {
    const r = deplacerTraits([a, b, c], new Set([b]), 5, -5)
    expect(r.traits[0]).toBe(a)
    expect(r.traits[2]).toBe(c)
    expect(r.traits[1]!.points).toEqual([55, 45, 65, 55])
    expect(r.choix.has(r.traits[1]!)).toBe(true)
    expect(r.choix.size).toBe(1)
  })

  it('applique un réglage au choix en un pas', () => {
    const r = appliquerAuChoix([a, b, c], new Set([a, c]), (t) => ({ ...t, couleur: '#000000', epaisseur: 8 }))
    expect(r.traits.map((t) => t.couleur)).toEqual(['#000000', '#4ebafd', '#000000'])
    expect(r.traits[1]).toBe(b)
    expect(r.choix.size).toBe(2)
  })

  it('retire les traits choisis', () => {
    expect(sansTraits([a, b, c], new Set([a, c]))).toEqual([b])
  })

  it('un appui simple remplace le choix, sauf sur un trait déjà choisi', () => {
    const deux = new Set([a, b])
    expect([...appuiSurTrait(deux, c, false).choix]).toEqual([c])
    expect(appuiSurTrait(deux, a, false).choix).toBe(deux)
  })

  it('Maj bascule : ajoute, ou retire sans ouvrir de glisser', () => {
    const ajout = appuiSurTrait(new Set([a]), b, true)
    expect([...ajout.choix]).toEqual([a, b])
    expect(ajout.glisse).toBe(true)
    const retrait = appuiSurTrait(new Set([a, b]), b, true)
    expect([...retrait.choix]).toEqual([a])
    expect(retrait.glisse).toBe(false)
  })

  it('les flèches décalent d’un pixel, dix avec Maj', () => {
    expect(decalageFleche('ArrowLeft', false, 0.5)).toEqual([-0.5, 0])
    expect(decalageFleche('ArrowDown', true, 0.5)).toEqual([0, 5])
    expect(decalageFleche('a', false, 1)).toBeNull()
  })

  it('la pipette prend la couleur du trait le plus haut sous le point', () => {
    const dessus: Trait = { points: [0, 0, 10, 0], couleur: '#7cd651', epaisseur: 2 }
    expect(couleurSous([a, dessus], 5, 0, 2)).toBe('#7cd651')
    expect(couleurSous([a, dessus], 5, 40, 2)).toBeNull()
  })
})

describe('l’ordre d’empilement', () => {
  it('amener devant ou derrière garde l’ordre relatif', () => {
    expect(ordonnerTraits([a, b, c], new Set([a]), true)).toEqual([b, c, a])
    expect(ordonnerTraits([a, b, c], new Set([c, b]), false)).toEqual([b, c, a])
  })

  it('rend le même tableau quand rien ne bouge', () => {
    const tous = [a, b, c]
    expect(ordonnerTraits(tous, new Set([c]), true)).toBe(tous)
    expect(ordonnerTraits(tous, new Set([a]), false)).toBe(tous)
  })
})
