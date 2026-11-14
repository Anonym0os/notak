import { describe, expect, it } from 'vitest'
import { optionsDocument } from './ressources'

describe('les ressources de pdf.js', () => {
  it('se prennent à la racine du site, quelle que soit la page d’où l’on ouvre le PDF', () => {
    expect(optionsDocument('https://notak.exemple.fr/t/abc/e/def')).toEqual({
      cMapUrl: 'https://notak.exemple.fr/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://notak.exemple.fr/pdfjs/standard_fonts/',
      isEvalSupported: false,
    })
  })

  it('dans l’app de bureau, sur place, par le protocole de la coque', () => {
    expect(optionsDocument('tauri://localhost/t/abc').cMapUrl).toBe('tauri://localhost/pdfjs/cmaps/')
    expect(optionsDocument('http://localhost:3010/').standardFontDataUrl).toBe('http://localhost:3010/pdfjs/standard_fonts/')
  })
})
