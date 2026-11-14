import { describe, expect, it } from 'vitest'
import type { Image } from '../../coeur/tableau'
import { adresseALargeur, finesse, largeurCadrePx, largeurEntiereAffichee, palierPour, palierVisionneuse } from './tailles'

const image = (reste: Partial<Image> = {}): Image => ({ type: 'image', fichier: 'f', largeurOrigine: 4000, hauteurOrigine: 3000, ...reste })

describe('palierPour', () => {
  it('prend le plus petit palier qui couvre les pixels de l’écran', () => {
    expect(palierPour(image(), 300, 1)).toBe(400)
    expect(palierPour(image(), 400, 1)).toBe(400)
    expect(palierPour(image(), 401, 1)).toBe(800)
    expect(palierPour(image(), 1200, 1)).toBe(1600)
  })
  it('compte la densité de l’écran', () => {
    expect(palierPour(image(), 300, 2)).toBe(800)
    expect(palierPour(image(), 300, 3)).toBe(1600)
  })
  it('sur un écran Retina, une grande image prend la copie de 2400 ou de 3200 px', () => {
    expect(palierPour(image(), 1200, 2)).toBe(2400)
    expect(palierPour(image(), 1500, 2)).toBe(3200)
  })
  it('une densité sous 1 ne réduit pas la demande', () => {
    expect(palierPour(image(), 300, 0.5)).toBe(400)
  })
  it('sert l’original quand aucun palier ne suffit', () => {
    expect(palierPour(image(), 3300, 1)).toBeNull()
  })
  it('sert l’original quand le palier ne gagnerait rien', () => {
    expect(palierPour(image({ largeurOrigine: 800 }), 700, 1)).toBeNull()
    expect(palierPour(image({ largeurOrigine: 500 }), 100, 1)).toBe(400)
    expect(palierPour(image({ largeurOrigine: 400 }), 100, 1)).toBeNull()
  })
  it('ne réduit pas un SVG ni un GIF', () => {
    expect(palierPour(image({ typeMime: 'image/svg+xml' }), 100, 1)).toBeNull()
    expect(palierPour(image({ typeMime: 'image/gif' }), 100, 1)).toBeNull()
    expect(palierPour(image({ typeMime: 'image/jpeg' }), 100, 1)).toBe(400)
  })
})

describe('palierVisionneuse', () => {
  const photo = image({ largeurOrigine: 8064, hauteurOrigine: 6048, typeMime: 'image/jpeg' })
  it('ouvre la photo sur la copie à la taille de l’écran', () => {
    expect(palierVisionneuse(photo, 390, 1, 3)).toBe(1600)
    expect(palierVisionneuse(photo, 700, 1, 1)).toBe(800)
  })
  it('sur un écran Retina, la copie de 2400 ou de 3200 px : nette sans l’original', () => {
    expect(palierVisionneuse(photo, 1200, 1, 2)).toBe(2400)
    expect(palierVisionneuse(photo, 1500, 1, 2)).toBe(3200)
  })
  it('sans zoom, la plus grande copie suffit même quand l’écran en voudrait plus : l’original attend qu’on zoome', () => {
    expect(palierVisionneuse(photo, 1800, 1, 2)).toBe(3200)
    expect(palierVisionneuse(photo, 1800, 1.25, 2)).toBeNull()
  })
  it('un zoom que la copie couvre encore ne charge pas l’original', () => {
    expect(palierVisionneuse(photo, 390, 1.25, 3)).toBe(1600)
    expect(palierVisionneuse(photo, 390, 2.5, 3)).toBe(3200)
    expect(palierVisionneuse(photo, 390, 3, 3)).toBeNull()
  })
  it('une petite image, un GIF ou un SVG s’ouvrent tels quels', () => {
    expect(palierVisionneuse(image({ largeurOrigine: 1200, typeMime: 'image/png' }), 1200, 1, 2)).toBeNull()
    expect(palierVisionneuse(image({ typeMime: 'image/gif' }), 1200, 1, 2)).toBeNull()
    expect(palierVisionneuse(image({ typeMime: 'image/svg+xml' }), 300, 1, 1)).toBeNull()
  })
})

describe('largeurEntiereAffichee', () => {
  it('est celle du cadre quand l’image est entière', () => {
    expect(largeurEntiereAffichee(image(), 500)).toBe(500)
  })
  it('un recadrage étire l’image au-delà du cadre', () => {
    expect(largeurEntiereAffichee(image({ recadrage: { x: 0, y: 0, largeur: 0.5, hauteur: 1 } }), 500)).toBe(1000)
  })
  it('un quart de tour échange les côtés du plan', () => {
    // 4000×3000 couché : le cadre fait 300 de large pour 400 de haut ; l'image entière fait 400 de large avant rotation.
    expect(largeurEntiereAffichee(image({ rotation: 90 }), 300)).toBeCloseTo(400)
  })
})

describe('adresseALargeur', () => {
  it('ajoute la largeur à l’adresse du serveur', () => {
    expect(adresseALargeur('/api/fichiers/abc', 800)).toBe('/api/fichiers/abc?l=800')
    expect(adresseALargeur('/api/fichiers/abc?x=1', 400)).toBe('/api/fichiers/abc?x=1&l=400')
  })
  it('laisse l’original et les copies locales', () => {
    expect(adresseALargeur('/api/fichiers/abc', null)).toBe('/api/fichiers/abc')
    expect(adresseALargeur('blob:http://x/1', 800)).toBe('blob:http://x/1')
    expect(adresseALargeur('data:image/png;base64,AA', 800)).toBe('data:image/png;base64,AA')
  })
})

describe('finesse et largeurCadrePx', () => {
  it('l’original est plus fin que tout palier', () => {
    expect(finesse(null)).toBeGreaterThan(finesse(1600))
    expect(finesse(400)).toBeLessThan(finesse(800))
  })
  it('compte le zoom, et la largeur d’une colonne', () => {
    expect(largeurCadrePx(20, false, 10, 2)).toBe(400)
    expect(largeurCadrePx(20, true, 10, 1)).toBe(360)
  })
})
