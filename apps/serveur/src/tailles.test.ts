import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { LARGEURS, largeurDemandee, nomReduit, reductible, reduire } from './tailles.ts'

const image = (largeur: number, hauteur: number, format: 'jpeg' | 'png' | 'webp' = 'jpeg') =>
  sharp({ create: { width: largeur, height: hauteur, channels: 3, background: '#cc3333' } })[format]().toBuffer()

describe('largeurDemandee', () => {
  it('prend le plus petit palier qui couvre la demande', () => {
    expect(largeurDemandee('1')).toBe(400)
    expect(largeurDemandee('400')).toBe(400)
    expect(largeurDemandee('401')).toBe(800)
    expect(largeurDemandee('800')).toBe(800)
    expect(largeurDemandee('1200')).toBe(1600)
  })
  it('plafonne à la plus grande largeur', () => {
    expect(largeurDemandee('5000')).toBe(LARGEURS[LARGEURS.length - 1])
  })
  it('refuse ce qui n’est pas un entier positif', () => {
    for (const v of [undefined, '', '0', '-5', '12.5', 'abc', '800px', '123456']) expect(largeurDemandee(v)).toBeNull()
  })
})

describe('reductible et nomReduit', () => {
  it('ne réduit ni SVG ni GIF', () => {
    expect(reductible('image/jpeg')).toBe(true)
    expect(reductible('image/png; charset=binary')).toBe(true)
    expect(reductible('image/svg+xml')).toBe(false)
    expect(reductible('image/gif')).toBe(false)
    expect(reductible('application/pdf')).toBe(false)
  })
  it('range la copie à côté de l’original', () => {
    expect(nomReduit('abc', 800)).toBe('abc.800')
  })
})

describe('reduire', () => {
  it('rend une copie à la largeur demandée, dans le même format, proportions gardées', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const copie = await reduire(await image(2000, 1000, format), `image/${format}`, 800)
      expect(copie).not.toBeNull()
      const meta = await sharp(copie!).metadata()
      expect([meta.format, meta.width, meta.height]).toEqual([format, 800, 400])
    }
  })
  it('laisse l’original quand l’image est déjà assez étroite', async () => {
    expect(await reduire(await image(600, 300), 'image/jpeg', 800)).toBeNull()
    expect(await reduire(await image(800, 300), 'image/jpeg', 800)).toBeNull()
  })
  it('laisse l’original pour un format qu’on ne réduit pas, ou des octets illisibles', async () => {
    expect(await reduire(Buffer.from('<svg/>'), 'image/svg+xml', 400)).toBeNull()
    expect(await reduire(Buffer.from([1, 2, 3, 4, 5]), 'image/png', 400)).toBeNull()
  })
  it('tourne l’image comme son EXIF le demande', async () => {
    const couchee = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#33cc33' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const copie = await reduire(couchee, 'image/jpeg', 400)
    // 2000×1000 tourné d'un quart de tour : 1000×2000, donc 400×800 une fois réduit.
    expect(copie).not.toBeNull()
    const meta = await sharp(copie!).metadata()
    expect([meta.width, meta.height]).toEqual([400, 800])
  })
})
