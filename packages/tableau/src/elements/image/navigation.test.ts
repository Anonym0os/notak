import { describe, expect, test } from 'vitest'
import type { Element, Image } from '../../coeur/tableau'
import { borneDecalage, borneZoom, carteEnGrand, ordreImages, tailleMontree, voisine } from './navigation'

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

describe('l’image en grand et sa légende', () => {
  const contenu = (plus: Partial<Image> = {}): Image => ({ type: 'image', fichier: 'f', largeurOrigine: 600, hauteurOrigine: 900, ...plus })

  test('la taille montrée suit le recadrage et le quart de tour, comme sur la toile', () => {
    expect(tailleMontree(contenu())).toEqual({ largeur: 600, hauteur: 900 })
    expect(tailleMontree(contenu({ recadrage: { x: 0, y: 0, largeur: 0.5, hauteur: 1 } }))).toEqual({ largeur: 300, hauteur: 900 })
    expect(tailleMontree(contenu({ rotation: 90 }))).toEqual({ largeur: 900, hauteur: 600 })
  })

  test('jamais agrandie : sans légende, l’image garde sa taille quand la zone la contient', () => {
    expect(carteEnGrand({ largeur: 600, hauteur: 900 }, { largeur: 1600, hauteur: 1000 }, () => 0)).toEqual({ largeur: 600, hauteur: 900, legende: 0 })
  })

  test('l’image rétrécit pour laisser sa place à la légende, qui prend sa largeur', () => {
    // 56 px de légende (une ligne) : l'image tient dans 952 − 56 px de haut.
    const posee = carteEnGrand({ largeur: 1200, hauteur: 1800 }, { largeur: 1600, hauteur: 952 }, () => 56)
    expect(posee.legende).toBe(56)
    expect(posee.hauteur + posee.legende).toBeLessThanOrEqual(952)
    expect(posee.largeur).toBeCloseTo((952 - 56) * (2 / 3))
  })

  test('une légende qui s’allonge quand l’image rétrécit : on recommence jusqu’à ce que tout tienne', () => {
    // Une ligne de 20 px par tranche de texte, plus 36 px de marges : plus étroite, la légende est plus haute.
    const mesurer = (largeur: number) => 36 + 20 * Math.ceil((300 * 6.5) / Math.max(1, largeur - 48))
    const posee = carteEnGrand({ largeur: 3000, hauteur: 4500 }, { largeur: 1600, hauteur: 952 }, mesurer)
    expect(posee.legende).toBe(mesurer(posee.largeur))
    expect(posee.hauteur + posee.legende).toBeLessThanOrEqual(952.5)
  })
})
