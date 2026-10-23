import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { creerZip, extensionDe, nommerLesMedias } from './zip.ts'

describe('nommerLesMedias', () => {
  it('garde le nom donné, complète l’extension, numérote les doublons et les noms vides', () => {
    const noms = nommerLesMedias(
      [
        { id: 'a', nom: 'Plage', type: 'image/png' },
        { id: 'b', nom: 'Plage', type: 'image/png' },
        { id: 'c', nom: '', type: 'image/jpeg' },
        { id: 'd', nom: 'contrat.pdf', type: 'application/pdf' },
        { id: 'e', nom: '../../etc/passwd', type: 'text/plain' },
        { id: 'a', nom: 'Plage encore', type: 'image/png' },
        { id: 'f', nom: '', type: '' },
      ],
      (id) => (id === 'c' ? 'image/webp' : undefined),
    )
    expect(noms).toEqual([
      { id: 'a', nom: 'Plage.png' },
      { id: 'b', nom: 'Plage (2).png' },
      { id: 'c', nom: 'image-3.webp' },
      { id: 'd', nom: 'contrat.pdf' },
      { id: 'e', nom: '-..-etc-passwd.txt' },
      { id: 'f', nom: 'image-6' },
    ])
  })

  it('connaît les extensions courantes', () => {
    expect(extensionDe('image/jpeg')).toBe('jpg')
    expect(extensionDe('Application/PDF; charset=x')).toBe('pdf')
    expect(extensionDe('application/x-inconnu')).toBe('')
  })
})

describe('creerZip', () => {
  it('une archive qui se relit, octet pour octet', () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    const texte = new TextEncoder().encode('bonjour '.repeat(100))
    const lu = unzipSync(
      creerZip([
        { nom: 'a.png', octets: png, type: 'image/png' },
        { nom: 'note.txt', octets: texte, type: 'text/plain' },
      ]),
    )
    expect(Object.keys(lu).sort()).toEqual(['a.png', 'note.txt'])
    expect(lu['a.png']).toEqual(png)
    expect(lu['note.txt']).toEqual(texte)
  })
})
