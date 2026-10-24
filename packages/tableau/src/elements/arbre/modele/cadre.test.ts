import { describe, expect, it } from 'vitest'
import type { Id } from '../../../coeur/tableau'
import type { Boite } from '../disposition'
import { basculer, franchiLeSeuil, memeEnsemble, rectDeDeuxPoints, selectionDuCadre, selectionParPlage, sujetsDansCadre, tetesDe } from './cadre'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './sujets'

const boites: [Id, Boite][] = [
  ['a', { x: 0, y: 0, l: 100, h: 40 }],
  ['b', { x: 200, y: 0, l: 100, h: 40 }],
  ['c', { x: 0, y: 100, l: 100, h: 40 }],
]

describe('le seuil du glisser', () => {
  it('démarre au-delà de 2 px sur l’un des deux axes, pas avant', () => {
    expect(franchiLeSeuil({ x: 10, y: 10 }, { x: 12, y: 10 })).toBe(false)
    expect(franchiLeSeuil({ x: 10, y: 10 }, { x: 12.1, y: 10 })).toBe(true)
    expect(franchiLeSeuil({ x: 10, y: 10 }, { x: 10, y: 7.5 })).toBe(true)
    expect(franchiLeSeuil({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(false)
  })
})

describe('le rectangle du cadre', () => {
  it('se normalise, quel que soit le sens où l’on tire', () => {
    expect(rectDeDeuxPoints({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, l: 40, h: 60 })
    expect(rectDeDeuxPoints({ x: 10, y: 20 }, { x: 50, y: 80 })).toEqual({ x: 10, y: 20, l: 40, h: 60 })
  })
})

describe('les sujets que le cadre attrape (intersection stricte)', () => {
  it('prend ceux que le cadre touche d’une aire non nulle, sans les contenir', () => {
    expect(sujetsDansCadre(boites, { x: 90, y: 30, l: 20, h: 10 })).toEqual(['a'])
    expect(sujetsDansCadre(boites, { x: 90, y: 30, l: 200, h: 200 })).toEqual(['a', 'b', 'c'])
    expect(sujetsDansCadre(boites, { x: -10, y: -10, l: 400, h: 300 })).toEqual(['a', 'b', 'c'])
  })

  it('un simple contact de bord ne compte pas', () => {
    expect(sujetsDansCadre(boites, { x: 100, y: 0, l: 50, h: 40 })).toEqual([])
    expect(sujetsDansCadre(boites, { x: 0, y: 40, l: 100, h: 60 })).toEqual([])
  })

  it('un cadre sans largeur ou sans hauteur ne prend rien', () => {
    expect(sujetsDansCadre(boites, { x: 50, y: 10, l: 0, h: 100 })).toEqual([])
    expect(sujetsDansCadre(boites, { x: 50, y: 10, l: 100, h: 0 })).toEqual([])
  })

  it('un cadre loin de tout ne prend rien', () => {
    expect(sujetsDansCadre(boites, { x: 500, y: 500, l: 50, h: 50 })).toEqual([])
  })
})

describe('la sélection pendant le cadre', () => {
  it('sans Maj ni Cmd, elle suit le cadre : le rétrécir lâche des sujets', () => {
    const s1 = selectionDuCadre(new Set(), ['a', 'b'], false)
    expect([...s1]).toEqual(['a', 'b'])
    expect([...selectionDuCadre(s1, ['a'], false)]).toEqual(['a'])
  })

  it('avec Maj ou Cmd, elle ne fait que grandir', () => {
    const s1 = selectionDuCadre(new Set(['c']), ['a', 'b'], true)
    expect([...s1].sort()).toEqual(['a', 'b', 'c'])
    expect([...selectionDuCadre(s1, ['a'], true)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('reconnaît un ensemble qui n’a pas changé', () => {
    expect(memeEnsemble(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(memeEnsemble(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    expect(memeEnsemble(new Set(['a', 'c']), new Set(['a', 'b']))).toBe(false)
  })
})

describe('les clics sur les sujets', () => {
  let a = nouvelArbre('C')
  const c = lire(a).central
  const [p, q, r, s] = ['P', 'Q', 'R', 'S'].map((titre) => {
    let id: Id
    ;[a, id] = ajouterEnfant(a, c, titre)
    return id
  }) as [Id, Id, Id, Id]
  let sous: Id
  ;[a, sous] = ajouterEnfant(a, p, 'sous')
  let flottant: Id
  ;[a, flottant] = ajouterFlottant(a, { x: 9, y: 9 }, 'F')
  const l = lire(a)

  it('Cmd bascule : il entre, et il sort', () => {
    const dedans = basculer(new Set([p]), q)
    expect([...dedans]).toEqual([p, q])
    expect([...basculer(dedans, q)]).toEqual([p])
    expect([...basculer(new Set([p]), p)]).toEqual([])
  })

  it('Maj prend les frères d’entre deux, le plus proche étant la borne', () => {
    expect([...selectionParPlage(l, new Set([p]), s)].sort()).toEqual([p, q, r, s].sort())
    expect([...selectionParPlage(l, new Set([s]), q)].sort()).toEqual([q, r, s].sort())
    // Deux frères déjà choisis : le plus proche sert de borne, l'autre reste choisi sans rien ajouter entre eux.
    expect([...selectionParPlage(l, new Set([p, s]), r)].sort()).toEqual([p, r, s].sort())
    expect([...selectionParPlage(l, new Set([p, s]), q)].sort()).toEqual([p, q, s].sort())
  })

  it('Maj sans frère choisi, ou sur un flottant ou le central, ajoute seulement le sujet', () => {
    expect([...selectionParPlage(l, new Set(), r)]).toEqual([r])
    expect([...selectionParPlage(l, new Set([sous]), r)].sort()).toEqual([r, sous].sort())
    expect([...selectionParPlage(l, new Set([p]), flottant)].sort()).toEqual([flottant, p].sort())
    expect([...selectionParPlage(l, new Set([p]), c)].sort()).toEqual([c, p].sort())
  })

  it('les sujets de tête : les descendants suivent, le central ne se glisse pas', () => {
    expect(tetesDe(l, [p, sous, q])).toEqual([p, q])
    expect(tetesDe(l, [c, q])).toEqual([q])
    expect(tetesDe(l, [sous])).toEqual([sous])
    expect(tetesDe(l, ['inconnu'])).toEqual([])
  })
})
