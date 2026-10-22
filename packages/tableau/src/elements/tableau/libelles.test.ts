import { describe, expect, it } from 'vitest'
import { type Tableau, nouvelleNote } from '../../coeur/tableau'
import { initiale, libelleContenu } from './libelles'

describe('initiale', () => {
  it('prend la première lettre, en majuscule', () => {
    expect(initiale('voyage')).toBe('V')
    expect(initiale('  école')).toBe('É')
  })
  it('rend « ? » pour un titre vide', () => {
    expect(initiale('  ')).toBe('?')
  })
})

describe('libelleContenu', () => {
  const avec = (n: number): Tableau => ({ titre: 'T', elements: Array.from({ length: n }, () => nouvelleNote(0, 0)) })
  it('dit vide, un élément, ou le nombre', () => {
    expect(libelleContenu(avec(0))).toBe('vide')
    expect(libelleContenu(avec(1))).toBe('1 élément')
    expect(libelleContenu(avec(3))).toBe('3 éléments')
  })
  it('ne compte pas les lignes', () => {
    const t = avec(1)
    t.elements.push({
      id: 'l',
      x: 0,
      y: 0,
      largeur: 1,
      contenu: {
        type: 'ligne',
        depart: { x: 0, y: 0 },
        arrivee: { x: 1, y: 1 },
        pointeDepart: 'rien',
        pointeArrivee: 'fleche',
        trait: 'plein',
        epaisseur: 2,
      },
    })
    expect(libelleContenu(t)).toBe('1 élément')
  })
})
