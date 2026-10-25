import { describe, expect, it } from 'vitest'
import { type Contexte, contexteEnMarkdown, estLeRaccourci } from './contexte'
import { erreursRecentes, noterErreur } from './journal'

const touche = (o: Partial<KeyboardEvent>) => ({ code: 'KeyS', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o })

describe('le raccourci de signalement', () => {
  it('⇧⌘S sur Mac, comme dans Silak ; Ctrl+Maj+S ailleurs', () => {
    expect(estLeRaccourci(touche({ metaKey: true, shiftKey: true }), true)).toBe(true)
    expect(estLeRaccourci(touche({ ctrlKey: true, shiftKey: true }), false)).toBe(true)
    expect(estLeRaccourci(touche({ metaKey: true, altKey: true }), true)).toBe(false)
    expect(estLeRaccourci(touche({ metaKey: true, shiftKey: true, altKey: true }), true)).toBe(false)
    expect(estLeRaccourci(touche({ ctrlKey: true, shiftKey: true }), true)).toBe(false)
    expect(estLeRaccourci(touche({ metaKey: true, shiftKey: true, code: 'KeyX' }), true)).toBe(false)
  })
})

describe('le contexte en Markdown', () => {
  const base: Contexte = {
    adresse: 'http://localhost:3010/t/abc',
    titrePage: 'Voyage · Notak',
    tableau: 'abc « Voyage »',
    choisis: [{ id: 'e1', type: 'note', extrait: 'Une note' }],
    enEdition: null,
    focus: 'div.ProseMirror (texte en édition)',
    version: '4835550',
    navigateur: 'Mozilla/5.0',
    bureau: true,
    fenetre: { largeur: 1440, hauteur: 900, densite: 2 },
    ecran: { largeur: 1512, hauteur: 982 },
    theme: 'clair',
    erreurs: [],
  }

  it('dit le tableau, la sélection, la version, la machine et les erreurs', () => {
    const md = contexteEnMarkdown({ ...base, erreurs: [{ quand: new Date(2026, 9, 25, 22, 41, 7).getTime(), texte: 'TypeError: x is undefined' }] })
    expect(md).toContain('- Tableau ouvert : abc « Voyage »')
    expect(md).toContain('- Sélection : `note` e1 « Une note »')
    expect(md).toContain('- Version : 4835550')
    expect(md).toContain('- Navigateur : Notak de bureau (Tauri), Mozilla/5.0')
    expect(md).toContain('- Fenêtre : 1440×900 (densité 2), écran 1512×982')
    expect(md).toContain('[22:41:07] TypeError: x is undefined')
  })

  it('dit « rien » plutôt que de laisser une ligne vide', () => {
    const md = contexteEnMarkdown({ ...base, tableau: null, choisis: [] })
    expect(md).toContain('- Tableau ouvert : (aucun)')
    expect(md).toContain('- Sélection : (rien)')
    expect(md).toContain('(aucune)')
  })
})

describe('le journal des erreurs', () => {
  it('garde les erreurs récentes, en texte', () => {
    noterErreur(new Error('boum'))
    const [derniere] = erreursRecentes().slice(-1)
    expect(derniere!.texte).toContain('Error: boum')
    expect(erreursRecentes(15 * 60_000, Date.now() + 16 * 60_000)).toEqual([])
  })
})
