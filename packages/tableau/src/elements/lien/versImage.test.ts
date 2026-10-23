import { describe, expect, it } from 'vitest'
import type { Element, Lien } from '../../coeur/tableau'
import { estAdresseImage, operationsEnImage } from './versImage'

const lien = (extra: Partial<Element<Lien>> = {}, contenu: Partial<Lien> = {}): Element<Lien> => ({
  id: 'a',
  x: 0,
  y: 0,
  largeur: 34,
  contenu: { type: 'lien', url: 'https://x.test/a.png', statut: 'attente', ...contenu },
  ...extra,
})

describe('operationsEnImage', () => {
  it('change le contenu en image et garde la légende écrite', () => {
    const pas = operationsEnImage(lien({}, { legende: ' Vue du port ' }), 'f1', 'image/png', { largeur: 340, hauteur: 200 })
    expect(pas).toHaveLength(1)
    expect(pas[0]).toMatchObject({
      type: 'contenu',
      apres: { type: 'image', fichier: 'f1', largeurOrigine: 340, hauteurOrigine: 200, typeMime: 'image/png', legende: 'Vue du port' },
    })
  })

  it('prend la largeur d’une image neuve et rend la hauteur au contenu', () => {
    const pas = operationsEnImage(lien({ hauteur: { max: 12 } }), 'f1', 'image/jpeg', { largeur: 200, hauteur: 100 })
    expect(pas).toContainEqual({ type: 'redimensionner', id: 'a', de: 34, vers: 20 })
    expect(pas).toContainEqual({ type: 'borner', id: 'a', de: { max: 12 }, vers: null })
  })

  it('ne redimensionne pas quand la largeur est déjà la bonne', () => {
    const pas = operationsEnImage(lien(), 'f1', 'image/jpeg', { largeur: 340, hauteur: 100 })
    expect(pas.map((p) => p.type)).toEqual(['contenu'])
  })
})

describe('estAdresseImage', () => {
  it('reconnaît une extension d’image dans l’adresse, avant la requête ou le fragment', () => {
    expect(estAdresseImage('https://x.test/a/b.PNG')).toBe(true)
    expect(estAdresseImage('https://x.test/a.jpeg?w=300')).toBe(true)
    expect(estAdresseImage('https://x.test/a.webp#haut')).toBe(true)
    expect(estAdresseImage('https://x.test/a.gif')).toBe(true)
  })
  it('laisse les pages en paix', () => {
    expect(estAdresseImage('https://x.test/article')).toBe(false)
    expect(estAdresseImage('https://x.test/a.pngs')).toBe(false)
    expect(estAdresseImage('https://image.png.example.com')).toBe(false)
  })
})
