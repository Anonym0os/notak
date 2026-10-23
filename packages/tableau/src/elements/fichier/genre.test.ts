import { describe, expect, it } from 'vitest'
import { adresseApercuPdf, apercuDe, extensionDe, genreDe, tailleLisible } from './genre'

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

describe('aperçu d’un fichier', () => {
  it('demande la première page d’un PDF, sans barre d’outils', () => {
    expect(adresseApercuPdf('/api/fichiers/ab')).toBe('/api/fichiers/ab#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH')
    expect(adresseApercuPdf('blob:x#page=9')).toBe('blob:x#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH')
  })
  it('montre un PDF, une vidéo, et rien d’autre ; le mode icône ne montre rien', () => {
    expect(apercuDe('a.pdf', 'application/pdf', undefined)).toBe('pdf')
    expect(apercuDe('a.mp4', 'video/mp4', false)).toBe('video')
    expect(apercuDe('a.docx', '', undefined)).toBeNull()
    expect(apercuDe('a.pdf', 'application/pdf', true)).toBeNull()
  })
})
