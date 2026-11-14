import { describe, expect, it } from 'vitest'
import { formatDe, lireEntete, lireEnteteDe } from './entete'
import { chunk, heic, jpeg, le16, le32, octets, png, segment, tiff } from './fauxOctets'

describe('lireEntete : une photo JPEG', () => {
  it('une photo portrait d’iPhone, enregistrée couchée avec l’orientation 6, a les dimensions de l’écran', () => {
    expect(lireEntete(jpeg(4032, 3024, { orientation: 6 }))).toEqual({ largeur: 3024, hauteur: 4032, orientation: 6 })
  })
  it('lit l’orientation dans un EXIF écrit dans un sens ou dans l’autre', () => {
    for (const ordre of ['II', 'MM'] as const) {
      for (const orientation of [5, 6, 7, 8]) expect(lireEntete(jpeg(400, 200, { orientation, ordre }))).toMatchObject({ largeur: 200, hauteur: 400 })
      for (const orientation of [1, 2, 3, 4]) expect(lireEntete(jpeg(400, 200, { orientation, ordre }))).toMatchObject({ largeur: 400, hauteur: 200 })
    }
  })
  it('sans EXIF, ou avec une orientation qui ne veut rien dire, garde les dimensions enregistrées', () => {
    expect(lireEntete(jpeg(1200, 800))).toEqual({ largeur: 1200, hauteur: 800, orientation: 1 })
    expect(lireEntete(jpeg(1200, 800, { orientation: 42 }))).toEqual({ largeur: 1200, hauteur: 800, orientation: 1 })
  })
  it('passe les autres segments (JFIF, profil couleur, XMP) et lit un JPEG progressif', () => {
    const jfif = segment(0xe0, [...octets('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
    const icc = segment(0xe2, [...octets('ICC_PROFILE\0'), ...new Array(3000).fill(7)])
    const xmp = segment(0xe1, [...octets('http://ns.adobe.com/xap/1.0/\0'), ...octets('<x:xmpmeta/>')])
    expect(lireEntete(jpeg(6048, 8064, { orientation: 6, sof: 0xc2, avant: [jfif, icc, xmp] }))).toEqual({ largeur: 8064, hauteur: 6048, orientation: 6 })
  })
  it('rend null pour un JPEG coupé avant ses dimensions, ou mal formé', () => {
    const entier = jpeg(400, 200, { orientation: 6 })
    expect(lireEntete(entier.subarray(0, 40))).toBeNull()
    expect(lireEntete(octets([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull()
    expect(lireEntete(octets([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBeNull()
  })
})

describe('lireEntete : PNG, GIF et WebP', () => {
  it('lit le PNG dans son IHDR', () => {
    expect(lireEntete(png(1179, 2556))).toEqual({ largeur: 1179, hauteur: 2556, orientation: 1 })
  })
  it('laisse au décodeur un PNG dont l’EXIF le tourne, pas celui dont l’EXIF ne change rien (les captures du Mac)', () => {
    expect(lireEntete(png(400, 200, [chunk('eXIf', tiff(6))]))).toBeNull()
    expect(lireEntete(png(400, 200, [chunk('iCCP', [1, 2, 3]), chunk('eXIf', tiff(1, 'II'))]))).toEqual({ largeur: 400, hauteur: 200, orientation: 1 })
  })
  it('lit le GIF', () => {
    expect(lireEntete(octets('GIF89a', le16(320), le16(200), [0, 0, 0]))).toEqual({ largeur: 320, hauteur: 200, orientation: 1 })
  })
  it('lit les trois sortes de WebP, et laisse au décodeur celui qui porte un EXIF', () => {
    const riff = (morceau: string, corps: number[]) => octets('RIFF', le32(corps.length + 12), 'WEBP', morceau, le32(corps.length), corps, new Array(8).fill(0))
    expect(lireEntete(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(640), ...le16(480)]))).toMatchObject({ largeur: 640, hauteur: 480 })
    const bits = (640 - 1) | ((480 - 1) << 14)
    expect(lireEntete(riff('VP8L', [0x2f, ...le32(bits)]))).toMatchObject({ largeur: 640, hauteur: 480 })
    const x = (flags: number) => riff('VP8X', [flags, 0, 0, 0, 0x7f, 0x02, 0, 0xdf, 0x01, 0])
    expect(lireEntete(x(0x10))).toMatchObject({ largeur: 640, hauteur: 480 })
    expect(lireEntete(x(0x18))).toBeNull()
  })
  it('rend null pour ce qui n’est pas une image connue', () => {
    expect(lireEntete(octets('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(lireEntete(octets([0, 0, 0, 0x18], 'ftypheic'))).toBeNull()
    expect(lireEntete(new Uint8Array(0))).toBeNull()
  })
})

describe('formatDe', () => {
  it('reconnaît le format à ses octets, quel que soit le nom', () => {
    expect(formatDe(jpeg(10, 10))).toBe('jpeg')
    expect(formatDe(png(10, 10))).toBe('png')
    expect(formatDe(octets('GIF87a', [1, 0, 1, 0]))).toBe('gif')
    expect(formatDe(octets('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('webp')
  })
  it('reconnaît un HEIC d’iPhone, même annoncé en HEIF générique, mais pas un AVIF', () => {
    expect(formatDe(heic())).toBe('heic')
    expect(formatDe(heic('mif1', ['mif1', 'heic']))).toBe('heic')
    expect(formatDe(heic('avif', ['mif1', 'avif', 'miaf']))).toBeNull()
    expect(formatDe(octets('<svg/>'))).toBeNull()
  })
})

describe('lireEnteteDe', () => {
  it('lit le début du fichier', async () => {
    const corps = new Uint8Array(3_000_000)
    const f = new Blob([jpeg(4032, 3024, { orientation: 6 }) as Uint8Array<ArrayBuffer>, corps], { type: 'image/jpeg' })
    expect(await lireEnteteDe(f)).toEqual({ largeur: 3024, hauteur: 4032, orientation: 6 })
  })
})
