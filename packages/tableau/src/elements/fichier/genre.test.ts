import { describe, expect, it } from 'vitest'
import { ICONE_DU_GENRE, adresseApercuPdf, apercuDe, extensionDe, genreDe, naitEnIcone, seLitEnLigne, tailleLisible } from './genre'

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
  it('chaque famille de Milanote a son pictogramme : 3D, polices, courriels, pages web, vecteur, photo brute, montage, maquette', () => {
    expect(genreDe('piece.STL', '')).toBe('modele3d')
    expect(genreDe('Inter.woff2', 'font/woff2')).toBe('police')
    expect(genreDe('lettre.eml', 'message/rfc822')).toBe('courriel')
    expect(genreDe('page.dwt', '')).toBe('web')
    expect(genreDe('logo.ai', 'application/postscript')).toBe('vecteur')
    expect(genreDe('IMG_0042.CR2', '')).toBe('photo')
    expect(genreDe('film.prproj', '')).toBe('montage')
    expect(genreDe('ecran.sketch', '')).toBe('maquette')
    expect(genreDe('modele.numbers', '')).toBe('tableur')
  })
  it('chaque genre a une icône', () => {
    for (const g of Object.keys(ICONE_DU_GENRE)) expect(ICONE_DU_GENRE[g as keyof typeof ICONE_DU_GENRE]).toBeTruthy()
    expect(Object.keys(ICONE_DU_GENRE)).toHaveLength(18)
  })
  it('écrit la taille comme Milanote : décimale, base 1000, B KB MB GB', () => {
    expect(tailleLisible(812)).toBe('812 B')
    expect(tailleLisible(14_200)).toBe('14 KB')
    expect(tailleLisible(2_400_000)).toBe('2,4 MB')
    expect(tailleLisible(12_340_000)).toBe('12,3 MB')
    expect(tailleLisible(120_000_000)).toBe('120 MB')
    expect(tailleLisible(3_000_000_000)).toBe('3 GB')
  })
  it('un fichier naît en icône, sauf le son, la vidéo et les formats à aperçu forcé', () => {
    expect(naitEnIcone('a.pdf', 'application/pdf')).toBe(true)
    expect(naitEnIcone('a.docx', '')).toBe(true)
    expect(naitEnIcone('a.mp3', 'audio/mpeg')).toBe(false)
    expect(naitEnIcone('a.mp4', 'video/mp4')).toBe(false)
    expect(naitEnIcone('maquette.sketch', '')).toBe(false)
  })
  it('seuls le PDF et le texte se lisent dans la fenêtre', () => {
    expect(seLitEnLigne('a.pdf', 'application/pdf')).toBe(true)
    expect(seLitEnLigne('a.txt', 'text/plain')).toBe(true)
    expect(seLitEnLigne('a.docx', '')).toBe(false)
  })
})

describe('aperçu d’un fichier', () => {
  it('demande la première page d’un PDF, sans barre d’outils', () => {
    expect(adresseApercuPdf('/api/fichiers/ab')).toBe('/api/fichiers/ab#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH')
    expect(adresseApercuPdf('blob:x#page=9')).toBe('blob:x#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH')
  })
  it('montre un PDF, une image, une vidéo, et rien d’autre ; le mode icône ne montre rien', () => {
    expect(apercuDe('a.pdf', 'application/pdf', undefined)).toBe('pdf')
    expect(apercuDe('a.tiff', 'image/tiff', undefined)).toBe('image')
    expect(apercuDe('a.mp4', 'video/mp4', false)).toBe('video')
    expect(apercuDe('a.docx', '', undefined)).toBeNull()
    expect(apercuDe('a.pdf', 'application/pdf', true)).toBeNull()
  })
})
