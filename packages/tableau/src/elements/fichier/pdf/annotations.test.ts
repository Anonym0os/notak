import { describe, expect, it } from 'vitest'
import type { Fichier, TraitPage } from '../../../coeur/tableau'
import { avecAnnotations, avecTraitsDePage, fusionnerAnnotations, gommerPage, nombreDeTraits, pointSurPage, traitViseSurPage, traitsDeLaPage } from './annotations'

const trait = (id: string, points: [number, number][] = [[0.1, 0.1], [0.5, 0.1]], plus: Partial<TraitPage> = {}): TraitPage => ({ id, couleur: '#323b4a', epaisseur: 0.01, points, ...plus })
const pdf: Fichier = { type: 'fichier', fichier: 'f1', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 10 }
const A4 = { largeur: 595, hauteur: 842 }

describe('un point sur la page', () => {
  it('se dit en fractions de la page montrée, quel que soit le zoom', () => {
    const boite = { left: 100, top: 50, width: 400, height: 566 }
    expect(pointSurPage(300, 333, boite)).toEqual([0.5, 0.5])
    expect(pointSurPage(300, 333, { left: 200, top: 100, width: 200, height: 466 })).toEqual([0.5, 0.5])
  })
  it('reste sur la page, et arrondi', () => {
    expect(pointSurPage(-20, 1000, { left: 0, top: 0, width: 300, height: 300 })).toEqual([0, 1])
    expect(pointSurPage(100, 100, { left: 0, top: 0, width: 300, height: 300 })).toEqual([0.3333, 0.3333])
  })
})

describe('les traits d’une page', () => {
  it('se lisent par numéro de page', () => {
    const annotations = { '2': [trait('a')] }
    expect(traitsDeLaPage(annotations, 2)).toEqual([trait('a')])
    expect(traitsDeLaPage(annotations, 1)).toEqual([])
    expect(traitsDeLaPage(undefined, 1)).toEqual([])
  })

  it('un trait venu d’ailleurs qui ne se dessine pas est écarté, pas le reste', () => {
    const annotations = { '1': [trait('a'), { id: 'b', couleur: '#000000', epaisseur: 'x', points: [] }, null, { ...trait('c'), points: [[0.1, 'y'], [0.2, 0.2]] }] } as unknown as Fichier['annotations']
    expect(traitsDeLaPage(annotations, 1).map((t) => [t.id, t.points])).toEqual([
      ['a', trait('a').points],
      ['c', [[0.2, 0.2]]],
    ])
  })

  it('le surligneur se retient', () => {
    expect(traitsDeLaPage({ '1': [trait('s', undefined, { surligneur: true })] }, 1)[0]!.surligneur).toBe(true)
  })

  it('se comptent sur tout le document', () => {
    expect(nombreDeTraits({ '1': [trait('a'), trait('b')], '7': [trait('c')] })).toBe(3)
    expect(nombreDeTraits(undefined)).toBe(0)
  })
})

describe('les annotations du fichier', () => {
  it('une page sans trait n’est pas gardée, ni la clé quand il n’en reste aucune', () => {
    expect(avecTraitsDePage({ '1': [trait('a')] }, 1, [])).toEqual({})
    expect(avecAnnotations({ ...pdf, annotations: { '1': [trait('a')] } }, { '1': [] })).toEqual(pdf)
    expect(avecAnnotations(pdf, { '3': [trait('a')] }).annotations).toEqual({ '3': [trait('a')] })
  })
})

describe('enregistrer un brouillon sur ce que d’autres ont dessiné entre-temps', () => {
  it('ce que le brouillon ajoute arrive au-dessus, ce qu’un autre a posé reste', () => {
    const depart = { '1': [trait('a')] }
    const brouillon = { '1': [trait('a'), trait('moi')] }
    const actuel = { '1': [trait('a'), trait('autre')] }
    expect(fusionnerAnnotations(actuel, depart, brouillon)['1']!.map((t) => t.id)).toEqual(['a', 'autre', 'moi'])
  })

  it('ce que le brouillon a gommé s’en va, même si un autre a dessiné à côté', () => {
    const depart = { '1': [trait('a'), trait('b')] }
    const brouillon = { '1': [trait('b')] }
    const actuel = { '1': [trait('a'), trait('b'), trait('autre')] }
    expect(fusionnerAnnotations(actuel, depart, brouillon)['1']!.map((t) => t.id)).toEqual(['b', 'autre'])
  })

  it('une page que le brouillon n’a pas touchée garde ce qu’elle porte maintenant', () => {
    const depart = { '1': [trait('a')], '2': [trait('b')] }
    const brouillon = { '1': [], '2': [trait('b')] }
    const actuel = { '2': [trait('b'), trait('autre')], '5': [trait('c')] }
    expect(fusionnerAnnotations(actuel, depart, brouillon)).toEqual({ '2': [trait('b'), trait('autre')], '5': [trait('c')] })
  })

  it('un trait déjà là n’arrive pas en double', () => {
    expect(fusionnerAnnotations({ '1': [trait('moi')] }, {}, { '1': [trait('moi')] })).toEqual({ '1': [trait('moi')] })
  })
})

describe('la gomme sur une page', () => {
  it('retire le trait qu’elle touche, entier, et vise le plus récent', () => {
    const traits = [trait('a', [[0.1, 0.5], [0.9, 0.5]]), trait('b', [[0.5, 0.1], [0.5, 0.9]])]
    expect(traitViseSurPage(traits, [0.5, 0.5], 0.01, A4)).toBe(1)
    expect(gommerPage(traits, [0.2, 0.5], 0.01, A4).map((t) => t.id)).toEqual(['b'])
    expect(gommerPage(traits, [0.2, 0.2], 0.01, A4)).toHaveLength(2)
  })
})
