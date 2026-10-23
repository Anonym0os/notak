import { describe, expect, it } from 'vitest'
import { COULEURS_NOTE } from '../../coeur/tableau'
import { readFileSync } from 'node:fs'
import type { Element } from '../../coeur/tableau'
import { FOND_NOTE, SEUIL_SOMBRE, TEXTE_CLAIR, TEXTE_SOMBRE, contraste, couleurTexteSur, couleursSuggerees, fondDeNote, lireHex, luminance, texteDeNote, texteDuContenu } from './couleurs'

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
      // Le seuil de Milanote : le blanc l'emporte tant qu'il contraste au moins autant que le gris-bleu #3d4554.
      const autre = texte === TEXTE_CLAIR ? SEUIL_SOMBRE : TEXTE_CLAIR
      expect(contraste(FOND_NOTE[c], texte === TEXTE_CLAIR ? TEXTE_CLAIR : SEUIL_SOMBRE)).toBeGreaterThanOrEqual(contraste(FOND_NOTE[c], autre))
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

describe('lireHex', () => {
  it('ramène une saisie à #rrggbb', () => {
    expect(lireHex('#ABC')).toBe('#aabbcc')
    expect(lireHex(' 12ab9f ')).toBe('#12ab9f')
    expect(lireHex('#1234')).toBeNull()
    expect(lireHex('rouge')).toBeNull()
    expect(lireHex('')).toBeNull()
  })
})

describe('fond et texte d\'une note', () => {
  it('le fond libre prime sur la couleur nommée', () => {
    expect(fondDeNote({ couleur: 'bleu', fond: '#112233' })).toBe('#112233')
    expect(fondDeNote({ couleur: 'bleu' })).toBe(FOND_NOTE.bleu)
    expect(fondDeNote({ couleur: 'transparent' })).toBeUndefined()
  })
  it('la couleur de texte propre à la note prime sur celle du fond', () => {
    expect(texteDuContenu({ fond: '#000000' })).toBe(TEXTE_CLAIR)
    expect(texteDuContenu({ fond: '#000000', couleurTexte: '#ff0000' })).toBe('#ff0000')
    expect(texteDuContenu({ couleurTexte: '#ff0000' })).toBe('#ff0000')
    expect(texteDuContenu({})).toBeUndefined()
  })
})

describe('couleursSuggerees', () => {
  const note = (contenu: object): Element => ({ id: 'n', x: 0, y: 0, largeur: 34, contenu: { type: 'note', texte: { type: 'doc' }, ...contenu } }) as never
  it('compte fonds, barres et textes, les plus employées d\'abord', () => {
    const els = [note({ fond: '#111111' }), note({ barre: '#222222' }), note({ fond: '#222222' }), note({ couleur: 'vert' }), note({})]
    expect(couleursSuggerees(els)).toEqual(['#222222', '#111111', FOND_NOTE.vert])
  })
  it('complète avec la palette des images, sans doublon ni image à la corbeille', () => {
    const image = (couleurs: string[], reste: object = {}): Element => ({ id: 'i', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: 'f', largeurOrigine: 10, hauteurOrigine: 10, couleurs }, ...reste }) as never
    const els = [note({ fond: '#111111' }), image(['#111111', '#aa0000']), image(['#00bb00'], { corbeille: 1 }), image(['#0000cc'])]
    expect(couleursSuggerees(els)).toEqual(['#111111', '#aa0000', '#0000cc'])
  })
  it('s\'arrête à huit', () => {
    const els = Array.from({ length: 12 }, (_, i) => note({ fond: `#0000${(i + 10).toString(16)}` }))
    expect(couleursSuggerees(els)).toHaveLength(8)
  })
})
