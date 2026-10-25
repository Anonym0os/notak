import { describe, expect, it } from 'vitest'
import { A4, octetsDeDataUrl, pdfDePages, pdfDepuisJpeg } from './pdf'

const lire = (o: Uint8Array) => new TextDecoder('latin1').decode(o)

describe('pdfDepuisJpeg', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
  const pdf = pdfDepuisJpeg(jpeg, 800, 400)
  const texte = lire(pdf)

  it('a l’en-tête et la fin d’un PDF, et une page à la taille de l’image (96 ppp → points)', () => {
    expect(texte.startsWith('%PDF-1.4\n')).toBe(true)
    expect(texte.endsWith('%%EOF\n')).toBe(true)
    expect(texte).toContain('/MediaBox [0 0 600 300]')
    expect(texte).toContain('/Width 800 /Height 400')
  })

  it('range le JPEG tel quel, avec sa longueur', () => {
    expect(texte).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`)
    const debut = texte.indexOf('stream\n\xff\xd8') + 'stream\n'.length
    expect([...pdf.slice(debut, debut + jpeg.length)]).toEqual([...jpeg])
  })

  it('la table des références pointe sur chaque objet', () => {
    const debutXref = Number(/startxref\n(\d+)\n/.exec(texte)![1])
    expect(texte.slice(debutXref, debutXref + 4)).toBe('xref')
    const decalages = [...texte.slice(debutXref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]))
    expect(decalages).toHaveLength(5)
    decalages.forEach((d, i) => expect(texte.slice(d, d + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  })

  it('lit les octets d’une adresse data:', () => {
    expect([...octetsDeDataUrl('data:image/jpeg;base64,/9j/2Q==')]).toEqual([0xff, 0xd8, 0xff, 0xd9])
  })
})

describe('pdfDePages', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])

  it('met une page par image, à la taille demandée, et chaque objet à sa place', () => {
    const pdf = pdfDePages([
      { jpeg, largeur: 1588, hauteur: 2246, page: A4 },
      { jpeg, largeur: 1588, hauteur: 2246, page: A4 },
      { jpeg, largeur: 1588, hauteur: 2246, page: A4 },
    ])
    const texte = lire(pdf)
    expect(texte).toContain('/Kids [3 0 R 6 0 R 9 0 R] /Count 3')
    expect(texte.match(/\/MediaBox \[0 0 595\.28 841\.89\]/g)).toHaveLength(3)
    expect(texte).toContain('/XObject << /Im0 11 0 R >> >> /Contents 10 0 R')
    const debutXref = Number(/startxref\n(\d+)\n/.exec(texte)![1])
    const decalages = [...texte.slice(debutXref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]))
    expect(decalages).toHaveLength(11)
    decalages.forEach((d, i) => expect(texte.slice(d, d + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  })
})
