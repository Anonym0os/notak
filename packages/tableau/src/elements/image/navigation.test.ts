import { describe, expect, test } from 'vitest'
import type { Element, Image } from '../../coeur/tableau'
import { borneDecalage, borneZoom, ordreImages, voisine } from './navigation'

const image = (id: string, x: number, y: number, plus: Partial<Element<Image>> = {}): Element<Image> => ({
  id,
  x,
  y,
  largeur: 10,
  contenu: { type: 'image', fichier: `f-${id}`, largeurOrigine: 100, hauteurOrigine: 100 },
  ...plus,
})

describe('l’ordre de la visionneuse', () => {
  test('la toile en lisant, puis les non triées, puis les colonnes', () => {
    const colonne: Element = { id: 'c', x: 50, y: 0, largeur: 36, contenu: { type: 'colonne', titre: '' } }
    const ordre = ordreImages([
      image('d', 0, 20),
      image('b', 20, 0),
      image('a', 0, 0),
      image('nt', 0, 0, { nonTrie: 5 }),
      image('k2', 0, 0, { parent: 'c', ordre: 'b' }),
      image('k1', 0, 0, { parent: 'c', ordre: 'a' }),
      image('x', 0, 0, { corbeille: 1 }),
      image('en-route', 0, 0, { contenu: { type: 'image', fichier: 'envoi-1', largeurOrigine: 1, hauteurOrigine: 1 } }),
      colonne,
    ])
    expect(ordre.map((e) => e.id)).toEqual(['a', 'b', 'd', 'nt', 'k1', 'k2'])
  })

  test('l’image d’à côté boucle', () => {
    const l = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(voisine(l, 'c', 1)?.id).toBe('a')
    expect(voisine(l, 'a', -1)?.id).toBe('c')
    expect(voisine([], 'a', 1)).toBeUndefined()
  })
})

describe('le zoom', () => {
  test('entre 1 et 4', () => {
    expect(borneZoom(0.3)).toBe(1)
    expect(borneZoom(9)).toBe(4)
    expect(borneZoom(2.5)).toBe(2.5)
  })

  test('le décalage ne sort pas l’image de la fenêtre', () => {
    expect(borneDecalage(500, 400, 2)).toBe(200)
    expect(borneDecalage(-500, 400, 2)).toBe(-200)
    expect(borneDecalage(50, 400, 1)).toBe(0)
  })
})
