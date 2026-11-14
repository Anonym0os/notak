// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import { apprendre, oublierDisposition } from '../../touches'
import { poserStyle } from './commandes'
import { EXTENSIONS_NOTE } from './extensions'

// Un éditeur laissé vivant garde un minuteur de ProseMirror, qui part après le démontage de jsdom.
const ouverts: Editor[] = []
afterEach(() => {
  ouverts.splice(0).forEach((e) => e.destroy())
  oublierDisposition()
  localStorage.clear()
})

const editeur = () => {
  const e = new Editor({ extensions: EXTENSIONS_NOTE, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }] } })
  ouverts.push(e)
  return e
}

/** Une frappe telle que le navigateur la rend, sur l'éditeur. */
const touche = (e: Editor, init: KeyboardEventInit) => e.view.dom.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

const aligne = (e: Editor) => e.getJSON().content![0]!.attrs!.textAlign as string

// ⌘ sur Mac, Ctrl ailleurs : jsdom n'est pas un Mac, Ctrl y passe aussi par la table des touches de ProseMirror.
const MODIFICATEURS: KeyboardEventInit[] = [{ metaKey: true }, { ctrlKey: true }]

describe('⇧⌘ et un chiffre, lus sur la touche', () => {
  // Ce que WebKit rend sur un Mac en AZERTY sous ⇧⌘ : le caractère d'avant Maj, et `keyCode` tiré de lui quand il
  // ressemble à un signe américain (« & » est le 7, « ! » le 1, « ( » le 9).
  const AZERTY: [string, string, number, (e: Editor) => boolean][] = [
    ['&', 'Digit1', 55, (e) => e.isActive('heading', { level: 1 })],
    ['é', 'Digit2', 50, (e) => e.isActive('heading', { level: 2 })],
    ['§', 'Digit6', 54, (e) => e.isActive('encadre')],
    ['è', 'Digit7', 55, (e) => e.isActive('orderedList')],
    ['!', 'Digit8', 49, (e) => e.isActive('bulletList')],
    ['ç', 'Digit9', 57, (e) => e.isActive('paragraph', { petit: true })],
  ]

  it('en AZERTY, quand WebKit rend « & » sous ⇧⌘1 : un titre, pas une liste numérotée ; « ! » sous ⇧⌘8 : des puces, pas un titre', () => {
    for (const mod of MODIFICATEURS)
      for (const [key, code, keyCode, attendu] of AZERTY) {
        const e = editeur()
        touche(e, { key, code, keyCode, shiftKey: true, ...mod })
        expect(attendu(e), `${key} (${code})`).toBe(true)
      }
  })

  it('⇧⌘0 rend le texte normal, sur la touche du zéro que le Mac français tape « à »', () => {
    for (const mod of MODIFICATEURS) {
      const e = editeur()
      poserStyle(e, 'titre1')
      touche(e, { key: 'à', code: 'Digit0', keyCode: 48, shiftKey: true, ...mod })
      expect(e.getJSON().content![0]!.type).toBe('paragraph')
    }
  })

  it('en QWERTY et en QWERTZ, le chiffre de la touche, quoi que Maj y donne (« ! », « / »)', () => {
    for (const mod of MODIFICATEURS) {
      const e = editeur()
      touche(e, { key: '!', code: 'Digit1', keyCode: 49, shiftKey: true, ...mod })
      expect(e.isActive('heading', { level: 1 })).toBe(true)
      const f = editeur()
      touche(f, { key: '/', code: 'Digit7', keyCode: 191, shiftKey: true, ...mod })
      expect(f.isActive('orderedList')).toBe(true)
      const g = editeur()
      touche(g, { key: '&', code: 'Digit6', keyCode: 55, shiftKey: true, ...mod })
      expect(g.isActive('encadre')).toBe(true)
      expect(g.isActive('orderedList')).toBe(false)
    }
  })

  it('sans Maj, avec Alt, ou Fin au pavé numérique (Maj sous Windows) : rien', () => {
    const e = editeur()
    touche(e, { key: '&', code: 'Digit1', keyCode: 49, metaKey: true })
    touche(e, { key: '1', code: 'Digit1', keyCode: 49, metaKey: true, altKey: true, shiftKey: true })
    touche(e, { key: 'End', code: 'Numpad1', keyCode: 35, ctrlKey: true, shiftKey: true })
    expect(e.getJSON().content![0]!.type).toBe('paragraph')
  })
})

describe('⌘. et ⌘\\, au signe tel qu’on le tape', () => {
  it('⌘. : ⌘⇧; en AZERTY, même quand WebKit rend « ; » ; ⌘; n’en fait rien', () => {
    apprendre(new KeyboardEvent('keydown', { key: ';', code: 'Comma' }))
    apprendre(new KeyboardEvent('keydown', { key: '.', code: 'Comma', shiftKey: true }))
    const e = editeur()
    touche(e, { key: ';', code: 'Comma', keyCode: 186, metaKey: true })
    expect(e.isActive('codeBlock')).toBe(false)
    touche(e, { key: ';', code: 'Comma', keyCode: 186, metaKey: true, shiftKey: true })
    expect(e.isActive('codeBlock')).toBe(true)
    // Chrome rend le point lui-même.
    touche(e, { key: '.', code: 'Comma', keyCode: 190, metaKey: true, shiftKey: true })
    expect(e.isActive('codeBlock')).toBe(false)
  })

  it('⌘. et ⌘> en QWERTY, sur Mac comme ailleurs', () => {
    for (const mod of MODIFICATEURS) {
      const e = editeur()
      touche(e, { key: '.', code: 'Period', keyCode: 190, ...mod })
      expect(e.isActive('codeBlock')).toBe(true)
      touche(e, { key: '>', code: 'Period', keyCode: 190, shiftKey: true, ...mod })
      expect(e.isActive('codeBlock')).toBe(false)
    }
  })

  it('⌘\\ centre : ⌘⌥⇧: sur un Mac en AZERTY, ⌘⌥⇧7 en QWERTZ, ou à sa place QWERTY', () => {
    const e = editeur()
    touche(e, { key: '\\', code: 'Period', keyCode: 220, metaKey: true, altKey: true, shiftKey: true })
    expect(aligne(e)).toBe('center')
    touche(e, { key: '\\', code: 'Digit7', keyCode: 220, metaKey: true, altKey: true, shiftKey: true })
    expect(aligne(e)).toBe('left')
    touche(e, { key: '\\', code: 'Backslash', keyCode: 220, metaKey: true })
    expect(aligne(e)).toBe('center')
    // La place QWERTY sous Windows en AZERTY : la touche « * ».
    touche(e, { key: '*', code: 'Backslash', keyCode: 220, ctrlKey: true })
    expect(aligne(e)).toBe('left')
  })

  it('la barre que Windows tape avec AltGr (Ctrl+Alt+8 en AZERTY) reste une frappe', () => {
    const e = editeur()
    touche(e, { key: '\\', code: 'Digit8', keyCode: 56, ctrlKey: true, altKey: true })
    expect(aligne(e)).toBe('left')
    expect(e.getJSON().content![0]!.type).toBe('paragraph')
  })
})
