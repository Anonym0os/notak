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

import { boiteTrait, deplacerTraits, dessinsDepuis, grouper, operationsApresEdition, presDuBas, sansTraits, traitsDansMarquise, traitsDe } from './trace'
import { defaire, historiqueVide, noter, PAS_MAX, refaire } from './historique'
import { gommer } from '../croquis/trace'

const trait = (points: number[], epaisseur = 0.5) => ({ points, couleur: '#000', epaisseur })

describe('regroupement par proximité', () => {
  it('réunit les traits dont les rectangles élargis de 2 UG se touchent, de proche en proche', () => {
    const a = trait([0, 0, 10, 0])
    const b = trait([13, 0, 20, 0]) // à 3 UG de a : les marges de 2 se touchent
    const c = trait([23, 0, 30, 0]) // touche b seulement
    const loin = trait([100, 100, 110, 100])
    const g = grouper([a, loin, b, c])
    expect(g).toHaveLength(2)
    expect(g.find((x) => x.includes(a))).toEqual([a, b, c])
    expect(g.find((x) => x.includes(loin))).toEqual([loin])
  })

  it('sépare deux traits à plus de 4 UG l’un de l’autre', () => {
    expect(grouper([trait([0, 0, 10, 0]), trait([16, 0, 20, 0])])).toHaveLength(2)
  })

  it('jette un trait de largeur nulle (NaN) et rend un élément par groupe', () => {
    const els = dessinsDepuis([trait([0, 0, 10, 0]), trait([NaN, NaN]), trait([200, 0, 210, 0])])
    expect(els).toHaveLength(2)
    expect(els.every((e) => e.contenu.traits.length === 1)).toBe(true)
    expect(dessinsDepuis([trait([NaN, 1])])).toEqual([])
  })

  it('un dessin rouvert redonne ses traits au repère du tableau, à l’échelle de l’élément', () => {
    const [el] = dessinsDepuis([trait([10, 20, 30, 25])])
    const [rouvert] = traitsDe({ ...el!, largeur: el!.largeur * 2 })
    expect(rouvert!.points[0]).toBeCloseTo(el!.x + (10 - el!.x) * 2)
    expect(rouvert!.epaisseur).toBeCloseTo(1)
  })

  it('un dessin rouvert sans trait est supprimé ; sinon mis à jour sur place', () => {
    const [el] = dessinsDepuis([trait([10, 20, 30, 25])])
    expect(operationsApresEdition(el!, [])).toEqual([{ type: 'supprimer', element: el }])
    const ops = operationsApresEdition(el!, [trait([50, 50, 60, 60])])
    expect(ops.map((o) => o.type)).toEqual(['deplacer', 'redimensionner', 'contenu'])
  })
})

describe('gomme et sélection', () => {
  it('la gomme retire le trait entier qu’elle touche, pas une partie', () => {
    const a = trait([0, 0, 100, 0])
    const b = trait([0, 50, 100, 50])
    expect(gommer([a, b], 50, 0, 1)).toEqual([b])
    expect(sansTraits([a, b], new Set([b]))).toEqual([a])
  })

  it('la marquise prend les traits qu’elle rencontre', () => {
    const a = trait([0, 0, 10, 0])
    const b = trait([100, 100, 110, 100])
    expect(traitsDansMarquise([a, b], { x0: 20, y0: 20, x1: -5, y1: -5 })).toEqual([a])
    expect(boiteTrait(a, 2)).toEqual({ x0: -2.25, y0: -2.25, x1: 12.25, y1: 2.25 })
  })

  it('déplacer ne touche que les traits choisis et la sélection suit les nouveaux', () => {
    const a = trait([0, 0, 10, 0])
    const b = trait([5, 5, 6, 6])
    const r = deplacerTraits([a, b], new Set([a]), 3, 4)
    expect(r.traits[0]!.points).toEqual([3, 4, 13, 4])
    expect(r.traits[1]).toBe(b)
    expect(r.choix.has(r.traits[0]!)).toBe(true)
  })

  it('la barre s’efface à moins de 120 px du bas', () => {
    expect(presDuBas(700, 800)).toBe(true)
    expect(presDuBas(600, 800)).toBe(false)
  })
})

describe('défaire et refaire', () => {
  it('défait, refait, et un nouveau pas vide le refaire', () => {
    let h = noter(historiqueVide<number>(), 1)
    h = noter(h, 2)
    const d = defaire(h, 3)!
    expect(d.etat).toBe(2)
    const r = refaire(d.historique, 2)!
    expect(r.etat).toBe(3)
    expect(noter(d.historique, 9).futur).toEqual([])
    expect(defaire(historiqueVide<number>(), 0)).toBeNull()
    expect(refaire(historiqueVide<number>(), 0)).toBeNull()
  })

  it('garde 100 pas au plus', () => {
    let h = historiqueVide<number>()
    for (let i = 0; i < 150; i++) h = noter(h, i)
    expect(h.passe).toHaveLength(PAS_MAX)
    expect(h.passe[0]).toBe(50)
  })
})
