import { describe, expect, it } from 'vitest'
import { lireRaccourci } from './raccourciUrl'

describe('lireRaccourci', () => {
  it('lit un fichier .url de Windows', () => {
    expect(lireRaccourci('[InternetShortcut]\r\nURL=https://exemple.fr/page?a=1\r\nIconIndex=0\r\n')).toBe('https://exemple.fr/page?a=1')
  })
  it('lit un .webloc de macOS', () => {
    const plist = '<?xml version="1.0"?><plist version="1.0"><dict><key>URL</key><string>https://exemple.fr/a?x=1&amp;y=2</string></dict></plist>'
    expect(lireRaccourci(plist)).toBe('https://exemple.fr/a?x=1&y=2')
  })
  it('refuse ce qui n’est pas une adresse web', () => {
    expect(lireRaccourci('[InternetShortcut]\nURL=file:///etc/passwd')).toBeNull()
    expect(lireRaccourci('rien')).toBeNull()
  })
})
