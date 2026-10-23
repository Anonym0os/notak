import { describe, expect, it } from 'vitest'
import type { Element, RenvoiTableau } from '../../coeur/tableau'
import { fondsDeTableaux, pairesDuTableau } from './paires'

const carte = (id: string, contenu: Partial<RenvoiTableau>, plus: Partial<Element> = {}): Element => ({
  id,
  x: 0,
  y: 0,
  largeur: 10,
  contenu: { type: 'tableau', cible: id, ...contenu },
  ...plus,
})

describe('les paires de couleurs d’un tableau', () => {
  const elements = [
    carte('a', { fond: '#112233', glyphe: '#ffeeaa' }),
    carte('b', { fond: '#112233', glyphe: '#ffeeaa' }),
    carte('c', { fond: '#ffffff' }),
    carte('d', {}),
    carte('e', { fond: '#000000' }, { corbeille: 1 }),
  ]
  it('les plus employées d’abord ; sans glyphe choisi, celui que le fond impose', () => {
    expect(pairesDuTableau(elements)).toEqual([
      { fond: '#112233', glyphe: '#ffeeaa' },
      { fond: '#ffffff', glyphe: '#323b4a' },
    ])
  })
  it('ni les cartes sans fond libre ni la corbeille', () => {
    expect(fondsDeTableaux(elements)).toEqual(['#112233', '#ffffff'])
  })
})
