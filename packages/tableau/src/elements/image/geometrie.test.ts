import { describe, expect, test } from 'vitest'
import type { Element, Image } from '../../coeur/tableau'
import { aUneCarte, aUneOmbre, hauteurCartePx, versPlan, avecLegende, hauteurCalee, hauteurPour, imageSous, miseEnPage, pivoter, proportionsAffichees, rotationDe, largeurInitiale, largeurNaturelleImage, nombreColonnes, placerImages, remplacerContenu, basculerMiroir, cadrageLibre, rapportDuCadre } from './geometrie'

const image = (largeurOrigine: number, hauteurOrigine = 100): Image => ({ type: 'image', fichier: 'f', largeurOrigine, hauteurOrigine })

describe('taille d’une image', () => {
  test('sa largeur en pixels sur dix, 34 UG au plus et sans plancher', () => {
    expect(largeurInitiale(200)).toBe(20)
    expect(largeurInitiale(4000)).toBe(34)
    expect(largeurInitiale(12)).toBe(1)
    expect(largeurInitiale(30)).toBe(3)
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

describe('quart de tour', () => {
  test('quatre quarts de tour reviennent au départ, sans clé en trop', () => {
    let c = image(100, 50)
    const vus: number[] = []
    for (let i = 0; i < 4; i++) {
      c = pivoter(c)
      vus.push(rotationDe(c))
    }
    expect(vus).toEqual([270, 180, 90, 0])
    expect('rotation' in c).toBe(false)
  })

  test('les proportions s’échangent à 90° et 270°, pas à 180°', () => {
    const c = image(200, 100)
    expect(proportionsAffichees(c)).toBe(2)
    expect(proportionsAffichees({ ...c, rotation: 90 })).toBe(0.5)
    expect(proportionsAffichees({ ...c, rotation: 180 })).toBe(2)
    expect(proportionsAffichees({ ...c, rotation: 270 })).toBe(0.5)
  })

  test('le recadrage change les proportions, sauf à les montrer en plein', () => {
    const c: Image = { ...image(200, 100), recadrage: { x: 0.25, y: 0, largeur: 0.5, hauteur: 1 } }
    expect(proportionsAffichees(c)).toBe(1)
    expect(proportionsAffichees(c, true)).toBe(2)
    expect(proportionsAffichees({ ...c, rotation: 90 })).toBe(1)
  })
})

describe('mise en page', () => {
  test('sans recadrage ni rotation, l’image remplit la boîte', () => {
    const m = miseEnPage(image(100))
    expect(m.image).toEqual({ width: '100%', height: '100%', left: '0%', top: '0%' })
    // Le plan recouvre la boîte : il la déborde d'un côté plutôt que de s'étirer.
    expect(m.plan.width).toBe('max(100cqw, calc(100cqh * 1))')
    expect(m.plan.height).toBe('max(100cqh, calc(100cqw / 1))')
  })

  test('un quart de tour échange les deux côtés du plan', () => {
    const m = miseEnPage({ ...image(100), rotation: 90 })
    expect(m.plan).toMatchObject({ width: 'max(100cqh, calc(100cqw / 1))', height: 'max(100cqw, calc(100cqh * 1))' })
    expect(m.plan.transform).toContain('rotate(90deg)')
  })

  test('le recadrage agrandit l’image et la décale', () => {
    const m = miseEnPage({ ...image(100), recadrage: { x: 0.25, y: 0.5, largeur: 0.5, hauteur: 0.25 } })
    expect(m.image).toEqual({ width: '200%', height: '400%', left: '-50%', top: '-200%' })
    expect(miseEnPage({ ...image(100), recadrage: { x: 0.25, y: 0.5, largeur: 0.5, hauteur: 0.25 } }, true).image.width).toBe('100%')
  })
})

describe('carte et rognage', () => {
  test('la carte blanche : sauf une image transparente, à moins qu’on lui rende son fond', () => {
    expect(aUneCarte({ typeMime: 'image/jpeg' })).toBe(true)
    expect(aUneCarte({ typeMime: 'image/png', transparente: true })).toBe(false)
    expect(aUneCarte({ typeMime: 'image/png', transparente: true, fondBlanc: true })).toBe(true)
  })

  test('la hauteur tombe sur la grille moins 2 px, ou suit les proportions exactes', () => {
    expect(hauteurCartePx(20, 1.5, undefined)).toBe(128)
    expect(hauteurCartePx(20, 1.5, true)).toBeCloseTo(132)
  })

  test('un point de la boîte vers le plan qui la recouvre', () => {
    // Boîte plus étroite que l'image : le plan déborde à gauche et à droite.
    expect(versPlan(0, 0.5, 1, 2)).toEqual([0.25, 0.5])
    expect(versPlan(1, 0.5, 1, 2)).toEqual([0.75, 0.5])
    // Boîte plus large : il déborde en haut et en bas.
    expect(versPlan(0.5, 0, 2, 1)).toEqual([0.5, 0.25])
    expect(versPlan(0.3, 0.3, 1, 1)).toEqual([0.3, 0.3])
  })
})

describe('miroirs', () => {
  test('un miroir se pose puis se défait, la clé disparaît', () => {
    const a = basculerMiroir(image(100), 'h')
    expect(a.miroirH).toBe(true)
    const b = basculerMiroir(a, 'v')
    expect(b).toMatchObject({ miroirH: true, miroirV: true })
    const c = basculerMiroir(basculerMiroir(b, 'h'), 'v')
    expect('miroirH' in c || 'miroirV' in c).toBe(false)
  })

  test('le plan se retourne à l’écran, après le quart de tour', () => {
    expect(miseEnPage({ ...image(100), miroirH: true }).plan.transform).toBe('translate(-50%, -50%) scale(-1, 1)')
    expect(miseEnPage({ ...image(100), miroirV: true, rotation: 90 }).plan.transform).toBe('translate(-50%, -50%) scale(1, -1) rotate(90deg)')
    expect(miseEnPage(image(100)).plan.transform).toBe('translate(-50%, -50%)')
  })
})

describe('cadrage libre', () => {
  test('sans cadrage, le cadre suit l’image ; avec, il garde le rapport fixé', () => {
    expect(rapportDuCadre(image(200, 100))).toBe(2)
    const c = cadrageLibre.avec(image(200, 100), 20, 10)
    expect(c.rapportCadre).toBe(2)
    expect(rapportDuCadre({ ...image(200, 100), rapportCadre: 1 })).toBe(1)
  })

  test('la hauteur en UG suit le rapport, au moins 4 × 4 UG', () => {
    const c = cadrageLibre.avec(image(200, 100), 20, 8)
    expect(cadrageLibre.hauteur(c, 20)).toBe(8)
    expect(cadrageLibre.hauteur(c, 10)).toBe(4)
    expect(cadrageLibre.avec(image(200, 100), 20, 1).rapportCadre).toBe(5)
    expect(cadrageLibre.avec(image(200, 100), 2, 10).rapportCadre).toBe(0.4)
  })

  test('le double-clic sur la poignée le retire ; sans cadrage, rien', () => {
    const c = cadrageLibre.avec(image(200, 100), 20, 8)
    expect(cadrageLibre.retire(c)).toEqual(image(200, 100))
    expect(cadrageLibre.retire(image(200, 100))).toBeNull()
  })
})
