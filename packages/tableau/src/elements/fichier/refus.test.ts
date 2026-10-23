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
  it('refuse les 43 extensions de la liste noire, et seulement elles', () => {
    for (const e of ['ade', 'apk', 'cab', 'chm', 'isp', 'lib', 'mst', 'msix', 'sct', 'sys', 'vb', 'vxd', 'wsc']) expect(refusDe(`x.${e}`, 10)).toEqual({ motif: 'extension', extension: e })
    expect(refusDe('x.jar', 10)).toBeNull()
    expect(refusDe('x.app', 10)).toBeNull()
    expect(refusDe('robots.txt', 10)).toEqual({ motif: 'nom' })
    expect(refusDe('clientaccesspolicy.xml', 10)).toEqual({ motif: 'nom' })
  })
  it('refuse un fichier vide ou trop lourd', () => {
    expect(refusDe('a.pdf', 0)).toEqual({ motif: 'vide' })
    expect(refusDe('a.zip', 26 * 1024 * 1024)).toEqual({ motif: 'taille', extension: 'zip' })
  })
})
