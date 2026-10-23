import { describe, expect, test } from 'vitest'
import type { Element, Image } from '../../coeur/tableau'
import { aUneOmbre, avecLegende, hauteurCalee, hauteurPour, imageSous, largeurInitiale, largeurNaturelleImage, nombreColonnes, placerImages, remplacerContenu } from './geometrie'

const image = (largeurOrigine: number, hauteurOrigine = 100): Image => ({ type: 'image', fichier: 'f', largeurOrigine, hauteurOrigine })

describe('taille d’une image', () => {
  test('sa largeur en pixels sur dix, entre 4 et 34 UG', () => {
    expect(largeurInitiale(200)).toBe(20)
    expect(largeurInitiale(4000)).toBe(34)
    expect(largeurInitiale(12)).toBe(4)
    expect(largeurInitiale(335)).toBe(34)
  })

  test('la hauteur suit les proportions', () => {
    expect(hauteurPour(20, image(400, 200))).toBe(10)
  })

  test('la largeur naturelle ne dépasse pas 1600 px', () => {
    expect(largeurNaturelleImage(image(800))).toBe(80)
    expect(largeurNaturelleImage(image(5000))).toBe(160)
  })

  test('PNG, GIF et SVG sont supposés transparents, sans ombre', () => {
    expect(aUneOmbre('image/jpeg')).toBe(true)
    expect(aUneOmbre('image/webp')).toBe(true)
    expect(aUneOmbre(undefined)).toBe(true)
    for (const t of ['image/png', 'image/gif', 'image/svg+xml']) expect(aUneOmbre(t)).toBe(false)
  })

  test('ce qu’on a lu dans les pixels l’emporte sur le type du fichier', () => {
    expect(aUneOmbre('image/png', false)).toBe(true)
    expect(aUneOmbre('image/webp', true)).toBe(false)
    expect(aUneOmbre('image/jpeg', true)).toBe(false)
  })
})

describe('hauteur calée sur la grille', () => {
  test('arrondie à l’unité de grille la plus proche', () => {
    expect(hauteurCalee(20, 2)).toBe(10)
    expect(hauteurCalee(20, 3)).toBe(7)
    expect(hauteurCalee(34, 1.5)).toBe(23)
  })
  test('jamais sous une unité', () => {
    expect(hauteurCalee(4, 100)).toBe(1)
  })
})

describe('placement', () => {
  test('une seule image : décalée d’une UG vers le haut et la gauche', () => {
    expect(placerImages([{ largeur: 20, hauteur: 10 }], { x: 50, y: 30 }, 3)).toEqual([[49, 29]])
  })

  test('plusieurs images : colonnes de 36 UG, dans la moins haute', () => {
    const t = (hauteur: number) => ({ largeur: 34, hauteur })
    const pos = placerImages([t(10), t(30), t(5), t(5), t(5)], { x: 0, y: 0 }, 3)
    expect(pos).toEqual([
      [0, 0],
      [36, 0],
      [72, 0],
      [72, 7], // la colonne 3 (5 + 2) est la moins haute après les trois premières
      [0, 12], // puis la colonne 1 (10 + 2 = 12), moins haute que la 3 (14)
    ])
  })

  test('les colonnes partent du point de dépôt', () => {
    const t = { largeur: 34, hauteur: 10 }
    expect(placerImages([t, t], { x: 100, y: -20 }, 3)).toEqual([
      [100, -20],
      [136, -20],
    ])
  })

  test('au moins trois colonnes, une par 360 px de vue', () => {
    expect(nombreColonnes(500)).toBe(3)
    expect(nombreColonnes(1439)).toBe(3)
    expect(nombreColonnes(1440)).toBe(4)
    expect(nombreColonnes(2000)).toBe(5)
  })
})

describe('légende', () => {
  test('une légende vide est retirée', () => {
    const c = { ...image(10), legende: 'ancienne' }
    expect(avecLegende(c, '  ')).toEqual(image(10))
    expect('legende' in avecLegende(c, '')).toBe(false)
  })

  test('une légende tient sur une ligne', () => {
    expect(avecLegende(image(10), ' un\ndeux ').legende).toBe('un deux')
  })
})

describe('remplacer une image', () => {
  const el = (id: string, extra: Partial<Element> = {}, contenu: Image = image(100)): Element => ({ id, x: 0, y: 0, largeur: 10, contenu, ...extra })
  const rects: Record<string, { min: { x: number; y: number }; max: { x: number; y: number } }> = {
    bas: { min: { x: 0, y: 0 }, max: { x: 20, y: 20 } },
    haut: { min: { x: 10, y: 10 }, max: { x: 30, y: 30 } },
  }
  const rect = (id: string) => rects[id] ?? null

  test('le dépôt vise l’image la plus haute sous le point', () => {
    const els = [el('bas'), el('haut')]
    expect(imageSous(els, rect, { x: 15, y: 15 })?.id).toBe('haut')
    expect(imageSous(els, rect, { x: 5, y: 5 })?.id).toBe('bas')
    expect(imageSous(els, rect, { x: 50, y: 50 })).toBeNull()
  })

  test('une image verrouillée, à la corbeille, ou une note, ne se remplace pas', () => {
    expect(imageSous([el('bas', { verrou: true })], rect, { x: 5, y: 5 })).toBeNull()
    expect(imageSous([el('bas', { corbeille: 1 })], rect, { x: 5, y: 5 })).toBeNull()
    expect(imageSous([el('bas', {}, { type: 'note' } as never)], rect, { x: 5, y: 5 })).toBeNull()
  })

  test('la légende reste, le recadrage et la rotation s’en vont', () => {
    const ancien: Image = { ...image(100), legende: 'Port', rotation: 90, recadrage: { x: 0, y: 0, largeur: 0.5, hauteur: 0.5 } }
    const nouveau = { type: 'image' as const, largeurOrigine: 800, hauteurOrigine: 600, typeMime: 'image/png', transparente: true, rotation: 180 as const }
    expect(remplacerContenu(ancien, nouveau, 'f2')).toEqual({
      type: 'image',
      fichier: 'f2',
      largeurOrigine: 800,
      hauteurOrigine: 600,
      typeMime: 'image/png',
      transparente: true,
      legende: 'Port',
    })
  })
})
