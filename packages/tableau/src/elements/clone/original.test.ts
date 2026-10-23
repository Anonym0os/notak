import { describe, expect, test } from 'vitest'
import { type Element, nouvelleNote } from '../../coeur/tableau'
import { cibleDe, clonesDe, nouveauClone, originalDe, peutCloner, placeAcote } from './original'

const note = (id: string): Element => ({ ...nouvelleNote(0, 0), id })
const clone = (id: string, cible: string): Element => ({ ...nouveauClone(10, 10, cible, 30), id })

describe('le clone', () => {
  test('on clone une carte de contenu, pas une colonne ni un clone', () => {
    expect(peutCloner(note('a').contenu)).toBe(true)
    expect(peutCloner({ type: 'colonne', titre: '' })).toBe(false)
    expect(peutCloner({ type: 'clone', cible: 'a' })).toBe(false)
    expect(peutCloner({ type: 'commentaire', messages: [] })).toBe(false)
  })

  test('l’original se retrouve ; absent, à la corbeille ou clone, il n’y en a pas', () => {
    const a = note('a')
    expect(originalDe([a, clone('c', 'a')], 'a')).toBe(a)
    expect(originalDe([clone('c', 'a')], 'a')).toBeUndefined()
    expect(originalDe([{ ...a, corbeille: 5 }], 'a')).toBeUndefined()
    expect(originalDe([clone('c', 'a'), clone('d', 'c')], 'c')).toBeUndefined()
  })

  test('cloner un clone vise l’original', () => {
    expect(cibleDe(note('a'))).toBe('a')
    expect(cibleDe(clone('c', 'a'))).toBe('a')
  })

  test('les clones d’un élément, sans ceux de la corbeille ni ceux des autres', () => {
    const tous = [note('a'), clone('c1', 'a'), { ...clone('c2', 'a'), corbeille: 1 }, clone('c3', 'b')]
    expect(clonesDe(tous, 'a').map((e) => e.id)).toEqual(['c1'])
  })

  test('le clone naît à droite de l’original', () => {
    expect(placeAcote(10, 4, 34)).toEqual({ x: 46, y: 4 })
    expect(placeAcote(10.4, 4.6, 34)).toEqual({ x: 46, y: 5 })
  })
})
