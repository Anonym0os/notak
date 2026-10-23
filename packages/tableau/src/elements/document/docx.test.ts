import { describe, expect, test } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import { crc32, documentEnDocx } from './docx'

const mot = (text: string, ...marks: string[]): NoeudTexte => ({ type: 'text', text, marks: marks.map((type) => ({ type })) })
const lu = (o: Uint8Array) => new TextDecoder().decode(o)

describe('l’export Word', () => {
  test('le CRC-32 de « 123456789 » est celui de la norme', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  test('une archive ZIP de trois fichiers, dont le texte du document', () => {
    const doc: NoeudTexte = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [mot('Plan')] },
        { type: 'paragraph', content: [mot('un '), mot('fort & beau', 'bold')] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [mot('a')] }] }] },
      ],
    }
    const octets = documentEnDocx('Mon doc', doc)
    expect([octets[0], octets[1]]).toEqual([0x50, 0x4b])
    const texte = lu(octets)
    for (const nom of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) expect(texte).toContain(nom)
    expect(texte).toContain('Mon doc')
    expect(texte).toContain('fort &amp; beau')
    expect(texte).toContain('<w:b/>')
    expect(texte).toContain('• ')
  })
})
