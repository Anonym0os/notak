import { describe, expect, it } from 'vitest'
import { refusDe } from './refus'

describe('fichiers refusés', () => {
  it('accepte un fichier ordinaire', () => {
    expect(refusDe('devis.pdf', 1000)).toBeNull()
  })
  it('refuse les programmes, les pages web et les fichiers de configuration', () => {
    expect(refusDe('setup.EXE', 10)).toEqual({ motif: 'extension', extension: 'exe' })
    expect(refusDe('index.html', 10)).toEqual({ motif: 'extension', extension: 'html' })
    expect(refusDe('web.config', 10)).toEqual({ motif: 'nom' })
    expect(refusDe('.env', 10)).toEqual({ motif: 'point' })
  })
  it('refuse un fichier vide ou trop lourd', () => {
    expect(refusDe('a.pdf', 0)).toEqual({ motif: 'vide' })
    expect(refusDe('a.zip', 26 * 1024 * 1024)).toEqual({ motif: 'taille', extension: 'zip' })
  })
})
