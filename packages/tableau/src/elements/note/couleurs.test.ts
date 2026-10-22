import { describe, expect, it } from 'vitest'
import { COULEURS_NOTE } from '../../coeur/tableau'
import { readFileSync } from 'node:fs'
import { FOND_NOTE, TEXTE_CLAIR, TEXTE_SOMBRE, contraste, couleurTexteSur, luminance, texteDeNote } from './couleurs'

describe('contraste', () => {
  it('mesure le noir et le blanc aux deux bouts', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1)
  })

  it('met du blanc sur un fond sombre et du presque-noir sur un fond clair', () => {
    expect(couleurTexteSur('#27344f')).toBe(TEXTE_CLAIR)
    expect(couleurTexteSur('#f3c534')).toBe(TEXTE_SOMBRE)
    expect(couleurTexteSur('#ffffff')).toBe(TEXTE_SOMBRE)
    expect(couleurTexteSur('#000000')).toBe(TEXTE_CLAIR)
  })

  it('choisit pour chaque couleur de la palette le texte qui se lit le mieux', () => {
    for (const c of COULEURS_NOTE) {
      const texte = couleurTexteSur(FOND_NOTE[c])
      const autre = texte === TEXTE_CLAIR ? TEXTE_SOMBRE : TEXTE_CLAIR
      expect(contraste(FOND_NOTE[c], texte)).toBeGreaterThanOrEqual(contraste(FOND_NOTE[c], autre))
      expect(contraste(FOND_NOTE[c], texte)).toBeGreaterThan(3)
    }
  })

  it('laisse le style par défaut sans couleur ou transparente', () => {
    expect(texteDeNote(undefined)).toBeUndefined()
    expect(texteDeNote('transparent')).toBeUndefined()
    expect(texteDeNote('bleu_nuit')).toBe(TEXTE_CLAIR)
  })
})

describe('palette', () => {
  it('a les mêmes valeurs en TypeScript et dans note.css', () => {
    const css = readFileSync(new URL('./note.css', import.meta.url), 'utf8')
    for (const c of COULEURS_NOTE) expect(css).toContain(`--notak-note-${c}: ${FOND_NOTE[c]};`)
  })
})
