import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ErreurNotak, decoderNotak, encoderNotak } from './fichierEspace'

const contenu = {
  racine: 'r1',
  tableaux: [
    { id: 'r1', titre: 'Accueil', etat: new Uint8Array([1, 2]) },
    { id: 't2', titre: 'Voyage', parent: 'r1', couleur: 'vert', etat: new Uint8Array([3]) },
  ],
  fichiers: [{ id: 'abc123', type: 'image/png', octets: new Uint8Array([9, 9, 9]) }],
}

describe('fichier .notak', () => {
  it('se relit tel qu’il a été écrit', () => {
    expect(decoderNotak(encoderNotak(contenu))).toEqual(contenu)
  })

  it('refuse ce qui n’est pas un fichier Notak', () => {
    expect(() => decoderNotak(new Uint8Array([1, 2, 3]))).toThrow(ErreurNotak)
    expect(() => decoderNotak(zipSync({ 'autre.json': strToU8('{}') }))).toThrow(ErreurNotak)
    expect(() => decoderNotak(zipSync({ 'notak.json': strToU8('{"application":"notak","racine":"r","format":99}') }))).toThrow(/récente/)
  })

  it('ignore les chemins dangereux et ce qui manque', () => {
    const zip = zipSync({
      'notak.json': strToU8(JSON.stringify({ format: 1, application: 'notak', racine: 'r', tableaux: [{ id: '../evil' }, { id: 'absent' }], fichiers: [{ id: 'x/../../y' }] })),
    })
    expect(decoderNotak(zip)).toEqual({ racine: 'r', tableaux: [], fichiers: [] })
  })
})
