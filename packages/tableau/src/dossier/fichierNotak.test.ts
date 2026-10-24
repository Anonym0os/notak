import { describe, expect, it } from 'vitest'
import { decoderFichier, encoderFichier, estFichierNotak } from './fichierNotak'

const exemple = {
  genre: 'maj' as const,
  enregistrements: [
    { tableau: '01hzabc', maj: new Uint8Array([1, 2, 3]) },
    { tableau: 'tableau-é', maj: new Uint8Array(5000).fill(7) },
  ],
}

describe('fichier Notak', () => {
  it('se relit tel qu’il a été écrit', async () => {
    const octets = await encoderFichier(exemple)
    expect(estFichierNotak(octets)).toBe(true)
    expect(await decoderFichier(octets)).toEqual(exemple)
  })

  it('un fichier tronqué, à n’importe quelle longueur, se lit comme « pas encore arrivé »', async () => {
    const octets = await encoderFichier(exemple)
    for (let n = 0; n < octets.length; n += 7) expect(await decoderFichier(octets.slice(0, n))).toBeNull()
  })

  it('un octet changé n’importe où rend le fichier illisible', async () => {
    const octets = await encoderFichier(exemple)
    for (let i = 0; i < octets.length; i += 3) {
      const abime = octets.slice()
      abime[i]! ^= 0xff
      expect(await decoderFichier(abime)).toBeNull()
    }
  })

  it('un fichier d’un autre format n’est pas un fichier Notak', async () => {
    expect(await decoderFichier(new TextEncoder().encode('{"format":1}'))).toBeNull()
    expect(estFichierNotak(new Uint8Array([1, 2]))).toBe(false)
  })

  it('un fichier sans enregistrement est valable', async () => {
    const vide = { genre: 'base' as const, enregistrements: [] }
    expect(await decoderFichier(await encoderFichier(vide))).toEqual(vide)
  })
})
