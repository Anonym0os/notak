import { describe, expect, it } from 'vitest'
import { extensionDe, genreDe, tailleLisible } from './genre'

describe('genre d’un fichier', () => {
  it('lit l’extension', () => {
    expect(extensionDe('Devis Final.PDF')).toBe('pdf')
    expect(extensionDe('.bashrc')).toBe('')
    expect(extensionDe('archive.tar.gz')).toBe('gz')
  })
  it('range par type puis par extension', () => {
    expect(genreDe('x.bin', 'application/pdf')).toBe('pdf')
    expect(genreDe('note.docx', 'application/octet-stream')).toBe('texte')
    expect(genreDe('piste', 'audio/mpeg')).toBe('son')
    expect(genreDe('inconnu.xyz', '')).toBe('autre')
  })
  it('écrit la taille à la française', () => {
    expect(tailleLisible(812)).toBe('812 o')
    expect(tailleLisible(14_200)).toBe('14 ko')
    expect(tailleLisible(2_400_000)).toBe('2,4 Mo')
  })
})
