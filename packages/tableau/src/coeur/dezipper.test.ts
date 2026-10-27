import { deflateSync, inflateSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ErreurTropGros, dezipper, gonfler } from './dezipper'

const MIO = 1024 * 1024

describe('ouvrir une archive reçue', () => {
  it('une archive honnête s’ouvre', () => {
    const z = zipSync({ 'a.txt': new TextEncoder().encode('bonjour'), 'b/c.bin': new Uint8Array([1, 2, 3]) })
    const f = dezipper(z)
    expect(new TextDecoder().decode(f['a.txt'])).toBe('bonjour')
    expect([...f['b/c.bin']!]).toEqual([1, 2, 3])
  })

  it('une bombe est refusée sur ce qu’elle annonce, avant d’avoir rien déplié', () => {
    // 8 Mo de zéros tiennent en quelques Ko : au-delà de la borne d'un fichier, on refuse.
    const z = zipSync({ 'zeros.bin': [new Uint8Array(8 * MIO), { level: 9 }] })
    expect(z.length).toBeLessThan(64 * 1024)
    expect(() => dezipper(z, { parFichier: 4 * MIO, total: 100 * MIO, fichiers: 10 })).toThrow(ErreurTropGros)
    expect(() => dezipper(z, { parFichier: 100 * MIO, total: 4 * MIO, fichiers: 10 })).toThrow(ErreurTropGros)
  })

  it('un fichier nommé comme une propriété d’objet ne se confond avec rien', () => {
    const f = dezipper(zipSync({ 'content.json': new Uint8Array([1]) }))
    expect(f['constructor']).toBeUndefined()
    expect(f['toString']).toBeUndefined()
    expect(Object.keys(f)).toEqual(['content.json'])
  })

  it('trop de fichiers, aussi', () => {
    const entrees = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, new Uint8Array(1)]))
    expect(() => dezipper(zipSync(entrees), { parFichier: MIO, total: MIO, fichiers: 10 })).toThrow(ErreurTropGros)
  })

  it('une archive qui ment sur sa taille ne déplie pas plus qu’elle n’annonce', () => {
    const z = zipSync({ 'a.bin': [new Uint8Array(8 * MIO), { level: 9 }] })
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength)
    for (let i = z.length - 22; i >= 0; i--) {
      if (v.getUint32(i, true) === 0x02014b50) {
        v.setUint32(i + 24, 1000, true)
        break
      }
    }
    expect(dezipper(z)['a.bin']!.length).toBe(1000)
  })
})

describe('déplier un flux deflate', () => {
  it('rend ce qu’on a comprimé', () => {
    const donnees = new TextEncoder().encode('Notak '.repeat(10_000))
    expect(gonfler(deflateSync(donnees), MIO)).toEqual(inflateSync(deflateSync(donnees)))
    expect(gonfler(deflateSync(new Uint8Array()), MIO).length).toBe(0)
  })

  it('s’arrête dès que la borne est passée', () => {
    expect(() => gonfler(deflateSync(new Uint8Array(16 * MIO), { level: 9 }), 2 * MIO)).toThrow(ErreurTropGros)
  })

  it('un flux abîmé reste une erreur', () => {
    expect(() => gonfler(new Uint8Array([1, 2, 3, 4, 5]), MIO)).toThrow()
  })
})
