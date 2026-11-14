// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apprendre, chiffreDe, lettreDe, oublierDisposition, parAltGr, signeAppris, signeParmi } from './touches'

afterEach(() => {
  oublierDisposition()
  localStorage.clear()
})

/** Une frappe ordinaire, sans modificateur (ou avec Maj seule), comme le navigateur la rend. */
const frappe = (key: string, code: string, shiftKey = false) => apprendre(new KeyboardEvent('keydown', { key, code, shiftKey }))

describe('la lettre d’une touche, telle qu’elle est marquée', () => {
  // Ce que WebKit et Chromium rendent sur Mac : sous ⌥, `key` est le caractère d'Option, `keyCode` la lettre de la disposition.
  it('AZERTY, sous Alt : ⌥A est A (la touche envoie KeyQ et « æ »), ⌥Q est Q, ⌥Z est Z, ⌥M est M', () => {
    expect(lettreDe({ key: 'æ', code: 'KeyQ', keyCode: 65 })).toBe('a')
    expect(lettreDe({ key: '‡', code: 'KeyA', keyCode: 81 })).toBe('q')
    expect(lettreDe({ key: 'Â', code: 'KeyW', keyCode: 90 })).toBe('z')
    expect(lettreDe({ key: 'µ', code: 'Semicolon', keyCode: 77 })).toBe('m')
  })

  it('QWERTZ, sous Alt : Z et Y à leur place marquée ; QWERTY : la lettre de toujours', () => {
    expect(lettreDe({ key: 'Ω', code: 'KeyY', keyCode: 90 })).toBe('z')
    expect(lettreDe({ key: '¥', code: 'KeyZ', keyCode: 89 })).toBe('y')
    expect(lettreDe({ key: 'å', code: 'KeyA', keyCode: 65 })).toBe('a')
  })

  it('sans Alt, ou sous Windows où Alt ne change rien, `key` suffit, capitale comprise', () => {
    expect(lettreDe({ key: 'a', code: 'KeyQ', keyCode: 65 })).toBe('a')
    expect(lettreDe({ key: 'V', code: 'KeyV', keyCode: 86 })).toBe('v')
  })

  it('une touche morte sous Alt, une disposition cyrillique : la lettre de `keyCode`, sinon la place de la touche', () => {
    expect(lettreDe({ key: 'Dead', code: 'KeyE', keyCode: 69 })).toBe('e')
    expect(lettreDe({ key: 'а', code: 'KeyF', keyCode: 70 })).toBe('f')
    // ⌥L donne « @ » sur un Mac allemand : `keyCode` dit 2, la place de la touche reste.
    expect(lettreDe({ key: '@', code: 'KeyL', keyCode: 50 })).toBe('l')
    expect(lettreDe({ code: 'KeyH' })).toBe('h')
  })

  it('ni lettre ni place de lettre : rien', () => {
    expect(lettreDe({ key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 })).toBeNull()
    expect(lettreDe({ key: 'é', code: 'Digit2', keyCode: 50 })).toBeNull()
  })
})

describe('AltGr', () => {
  it('Ctrl+Alt sous Windows, ou AltGraph, tape un signe ; ⌘⌥ sur Mac est un raccourci', () => {
    expect(parAltGr({ ctrlKey: true, altKey: true })).toBe(true)
    expect(parAltGr(new KeyboardEvent('keydown', { key: '\\', modifierAltGraph: true } as KeyboardEventInit))).toBe(true)
    expect(parAltGr({ metaKey: true, altKey: true, shiftKey: true } as { metaKey: boolean; altKey: boolean })).toBe(false)
    expect(parAltGr({ ctrlKey: true })).toBe(false)
  })
})

describe('le chiffre d’une touche', () => {
  it('AZERTY : ⌘& est ⌘1, ⌘à est ⌘0, avec ou sans Maj', () => {
    expect(chiffreDe({ key: '&', code: 'Digit1' })).toBe(1)
    expect(chiffreDe({ key: '1', code: 'Digit1' })).toBe(1)
    expect(chiffreDe({ key: 'à', code: 'Digit0' })).toBe(0)
  })

  it('sous Alt (« ¡ » pour 1 en QWERTY) et au pavé', () => {
    expect(chiffreDe({ key: '¡', code: 'Digit1' })).toBe(1)
    expect(chiffreDe({ key: '7', code: 'Numpad7' })).toBe(7)
    expect(chiffreDe({ key: 'q', code: 'KeyA' })).toBeNull()
  })
})

describe('le signe d’une touche, appris des frappes', () => {
  it('retient ce que la touche donne seule et avec Maj, jamais sous Alt, Cmd ou Ctrl, ni une touche morte', () => {
    frappe(',', 'KeyM')
    frappe('?', 'KeyM', true)
    apprendre(new KeyboardEvent('keydown', { key: 'µ', code: 'KeyM', altKey: true }))
    apprendre(new KeyboardEvent('keydown', { key: 'Dead', code: 'Backslash' }))
    expect(signeAppris('KeyM')).toBe(',')
    expect(signeAppris('KeyM', true)).toBe('?')
    expect(signeAppris('Backslash')).toBeUndefined()
  })

  it('apprend aussi des frappes dans un champ : l’écoute est posée sur la page, avant tout le reste', () => {
    const champ = document.createElement('input')
    document.body.append(champ)
    champ.addEventListener('keydown', (e) => e.stopPropagation())
    champ.dispatchEvent(new KeyboardEvent('keydown', { key: ';', code: 'Comma', bubbles: true }))
    expect(signeAppris('Comma')).toBe(';')
    champ.remove()
  })

  it('AZERTY : ⇧⌘, est Maj et la touche de la virgule, ⇧⌘. Maj et celle où Maj donne le point', () => {
    frappe(',', 'KeyM')
    frappe(';', 'Comma')
    frappe('.', 'Comma', true)
    frappe(':', 'Period')
    frappe('/', 'Period', true)
    expect(signeParmi({ key: '?', code: 'KeyM' }, [',', '.'])).toBe(',')
    expect(signeParmi({ key: '.', code: 'Comma' }, [',', '.'])).toBe('.')
    // WebKit, sous ⇧⌘, rend parfois le caractère sans Maj : ce qu'on a appris tranche.
    expect(signeParmi({ key: ';', code: 'Comma' }, [',', '.'])).toBe('.')
    expect(signeParmi({ key: '/', code: 'Period' }, [',', '.'])).toBeNull()
  })

  it('sous Alt, le signe que la touche donne sans lui : ⌘⌥/ en QWERTY (« ÷ »), ⌘⌥⇧: en AZERTY (« \\ »)', () => {
    frappe('/', 'Slash')
    expect(signeParmi({ key: '÷', code: 'Slash' }, ['/'])).toBe('/')
    oublierDisposition()
    frappe('/', 'Period', true)
    expect(signeParmi({ key: '\\', code: 'Period' }, ['/'])).toBe('/')
  })

  it('le signe tapé l’emporte sur la place : en AZERTY, ⌘- est la touche que QWERTY place à « = », et ⌘) ne dézoome pas', () => {
    expect(signeParmi({ key: '-', code: 'Equal' }, ['=', '+', '-'])).toBe('-')
    expect(signeParmi({ key: ')', code: 'Minus' }, ['=', '+', '-'])).toBeNull()
    // ⌘= en AZERTY : la touche que QWERTY place à « / » ; la barre n'y est pas.
    expect(signeParmi({ key: '=', code: 'Slash' }, ['/'])).toBeNull()
  })

  it('une touche jamais vue se lit à sa place américaine, quand `key` ne la contredit pas, sous Alt ou morte', () => {
    expect(signeParmi({ key: '<', code: 'Comma' }, [',', '.'])).toBe(',')
    expect(signeParmi({ key: '÷', code: 'Slash', altKey: true }, ['/'])).toBe('/')
    expect(signeParmi({ key: 'Dead', code: 'Backslash' }, ['\\'])).toBe('\\')
    expect(signeParmi({ key: '?', code: 'KeyM' }, [',', '.'])).toBeNull()
    expect(signeParmi({ key: '/', code: 'Period' }, [',', '.'])).toBeNull()
  })

  it('ce qui est appris se garde d’une visite à l’autre, et ce qui est gardé passe par la porte', async () => {
    frappe(',', 'KeyM')
    expect(JSON.parse(localStorage.getItem('notak:disposition')!)).toEqual({ KeyM: ',' })
    localStorage.setItem('notak:disposition', JSON.stringify({ KeyM: ',', 'Comma⇧': '.', mauvais: 'long', '<script>': 'x', Period: 3 }))
    vi.resetModules()
    const neuf = await import('./touches')
    expect(neuf.signeAppris('KeyM')).toBe(',')
    expect(neuf.signeAppris('Comma', true)).toBe('.')
    expect(neuf.signeAppris('mauvais')).toBeUndefined()
    expect(neuf.signeAppris('Period')).toBeUndefined()
  })
})
