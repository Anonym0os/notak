import { describe, expect, it, vi } from 'vitest'
import { estHeic, nomEnJpeg, preparerImage, prisEnImage } from './conversion'
import { TAILLE_MAX } from './geometrie'
import { fichier, heic, jpeg, octets, png } from './fauxOctets'

const MO = 1024 * 1024

/** Un faux `redessiner` : il rend un JPEG (ou un PNG) de ces dimensions, comme le ferait le navigateur qui sait le lire. */
const redessine = (largeur: number, hauteur: number, poids = 0) =>
  vi.fn(async (_f: Blob, type: 'image/jpeg' | 'image/png') => new Blob([(type === 'image/png' ? png(largeur, hauteur) : jpeg(largeur, hauteur)) as Uint8Array<ArrayBuffer>, new Uint8Array(poids)], { type }))
const neLitPas = () => vi.fn(async () => null)

describe('estHeic et prisEnImage', () => {
  it('reconnaît une photo HEIC à son type, ou à son nom quand le navigateur ne dit pas le type', () => {
    expect(estHeic({ type: 'image/heic', name: 'IMG_0001.HEIC' })).toBe(true)
    expect(estHeic({ type: 'image/heif', name: 'a' })).toBe(true)
    expect(estHeic({ type: '', name: 'IMG_0001.HEIC' })).toBe(true)
    expect(estHeic({ type: 'application/octet-stream', name: 'photo.heif' })).toBe(true)
    expect(estHeic({ type: 'image/jpeg', name: 'IMG_0001.jpg' })).toBe(false)
    expect(estHeic({ type: 'application/pdf', name: 'notes.heic' })).toBe(false)
  })
  it('une photo HEIC devient une image sur la toile, pas un fichier joint', () => {
    expect(prisEnImage({ type: 'image/heic' })).toBe(true)
    expect(prisEnImage({ type: 'image/jpeg' })).toBe(true)
    expect(prisEnImage({ type: 'application/pdf' })).toBe(false)
  })
  it('donne son nom au JPEG d’une photo convertie', () => {
    expect(nomEnJpeg('IMG_0001.HEIC')).toBe('IMG_0001.jpg')
    expect(nomEnJpeg('vacances.2026.heif')).toBe('vacances.2026.jpg')
    expect(nomEnJpeg('photo')).toBe('photo.jpg')
    expect(nomEnJpeg('')).toBe('photo.jpg')
  })
})

describe('preparerImage', () => {
  it('laisse partir une photo JPEG telle quelle, avec les dimensions de l’écran lues dans son en-tête', async () => {
    const f = fichier(jpeg(4032, 3024, { orientation: 6 }), 'IMG_0001.jpg', 'image/jpeg', 3 * MO)
    const refaire = redessine(1, 1)
    const prete = await preparerImage(f, { redessiner: refaire })
    expect(prete).toEqual({ fichier: f, entete: { largeur: 3024, hauteur: 4032, orientation: 6 } })
    expect(refaire).not.toHaveBeenCalled()
  })

  it('convertit une photo HEIC en JPEG, sous un nom en .jpg', async () => {
    const refaire = redessine(3024, 4032)
    const prete = await preparerImage(fichier(heic(), 'IMG_0002.HEIC', 'image/heic', 2 * MO), { redessiner: refaire })
    expect(refaire).toHaveBeenCalledWith(expect.any(File), 'image/jpeg')
    if (!('fichier' in prete)) throw new Error('refusée')
    expect([prete.fichier.name, prete.fichier.type]).toEqual(['IMG_0002.jpg', 'image/jpeg'])
    expect(prete.entete).toMatchObject({ largeur: 3024, hauteur: 4032 })
  })

  it('reconnaît un HEIC à ses octets, même nommé .jpg, et un HEIC sans type à son nom', async () => {
    const refaire = redessine(400, 300)
    expect(await preparerImage(fichier(heic(), 'IMG_0003.jpg', 'image/jpeg'), { redessiner: refaire })).toMatchObject({ fichier: { name: 'IMG_0003.jpg', type: 'image/jpeg' } })
    expect(await preparerImage(fichier(octets('????????'), 'IMG_0004.HEIC', ''), { redessiner: refaire })).toMatchObject({ fichier: { name: 'IMG_0004.jpg' } })
    expect(refaire).toHaveBeenCalledTimes(2)
  })

  it('refuse une photo HEIC que ce navigateur ne sait pas lire (Chrome), en le disant', async () => {
    expect(await preparerImage(fichier(heic(), 'IMG_0005.HEIC', 'image/heic'), { redessiner: neLitPas() })).toEqual({ refus: 'heic' })
  })

  it('prend le type dans les octets plutôt que dans le nom', async () => {
    const prete = await preparerImage(fichier(png(10, 20), 'capture.jpg', 'image/jpeg'), { redessiner: redessine(1, 1) })
    expect(prete).toMatchObject({ fichier: { type: 'image/png', name: 'capture.jpg' }, entete: { largeur: 10, hauteur: 20 } })
  })

  it('réduit une photo de plus de 25 Mo au lieu de la refuser, dans son format', async () => {
    const lourde = fichier(jpeg(8064, 6048, { orientation: 6 }), 'IMG_0006.jpg', 'image/jpeg', 26 * MO)
    const refaire = redessine(3464, 4619)
    const prete = await preparerImage(lourde, { redessiner: refaire })
    expect(refaire).toHaveBeenCalledWith(expect.any(File), 'image/jpeg')
    expect(prete).toMatchObject({ fichier: { name: 'IMG_0006.jpg', type: 'image/jpeg' }, entete: { largeur: 3464, hauteur: 4619 } })
    if ('fichier' in prete) expect(prete.fichier.size).toBeLessThanOrEqual(TAILLE_MAX)
    // Un PNG transparent reste un PNG : sa transparence ne devient pas du blanc.
    const detourage = await preparerImage(fichier(png(8000, 8000), 'plan.png', 'image/png', 30 * MO), { redessiner: redessine(4000, 4000), lireTransparence: async () => true })
    expect(detourage).toMatchObject({ fichier: { type: 'image/png', name: 'plan.png' } })
  })

  it('une photo collée en PNG (opaque) et trop lourde devient un JPEG', async () => {
    const refaire = redessine(4000, 3000)
    const collee = await preparerImage(fichier(png(5712, 4284), 'image.png', 'image/png', 40 * MO), { redessiner: refaire, lireTransparence: async () => false })
    expect(refaire).toHaveBeenCalledWith(expect.any(File), 'image/jpeg')
    expect(collee).toMatchObject({ fichier: { type: 'image/jpeg', name: 'image.jpg' }, entete: { largeur: 4000, hauteur: 3000 } })
  })

  it('refuse ce qui reste trop lourd, un GIF trop lourd (il perdrait son animation), et une image trop grande pour être décodée ici', async () => {
    expect(await preparerImage(fichier(jpeg(8064, 6048), 'a.jpg', 'image/jpeg', 26 * MO), { redessiner: redessine(4000, 3000, 26 * MO) })).toEqual({ refus: 'taille' })
    const refaire = redessine(1, 1)
    expect(await preparerImage(fichier(octets('GIF89a', [1, 0, 1, 0]), 'a.gif', 'image/gif', 26 * MO), { redessiner: refaire })).toEqual({ refus: 'taille' })
    expect(await preparerImage(fichier(jpeg(20_000, 10_000), 'panorama.jpg', 'image/jpeg', 26 * MO), { redessiner: refaire })).toEqual({ refus: 'taille' })
    expect(refaire).not.toHaveBeenCalled()
  })
})
