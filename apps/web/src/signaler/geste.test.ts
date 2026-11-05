// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { EVENEMENT_SIGNALER, gesteDe, gesteRetenu, relayerGeste } from './geste'

describe('signaler d’un geste, depuis la coque d’iOS', () => {
  it('ne retient que la secousse et la capture d’écran', () => {
    expect(gesteDe({ par: 'secousse' })).toBe('secousse')
    expect(gesteDe({ par: 'capture' })).toBe('capture')
    expect(gesteDe({ par: 'autre' })).toBeNull()
    expect(gesteDe(null)).toBeNull()
    expect(gesteDe('capture')).toBeNull()
  })

  it('relaie le geste à la fenêtre, et rien d’autre', () => {
    const recu = vi.fn()
    window.addEventListener(EVENEMENT_SIGNALER, (e) => recu((e as CustomEvent).detail))
    relayerGeste(window, { par: 'capture' })
    relayerGeste(window, { par: 'nimporte' })
    expect(recu.mock.calls).toEqual([['capture']])
  })

  it('laisse la secousse à « Annuler la saisie » pendant qu’on écrit ; la capture ouvre toujours', () => {
    const champ = document.createElement('textarea')
    const texte = document.createElement('div')
    texte.setAttribute('contenteditable', 'true')
    const bouton = document.createElement('button')
    for (const actif of [champ, texte]) {
      expect(gesteRetenu('secousse', actif)).toBe(false)
      expect(gesteRetenu('capture', actif)).toBe(true)
    }
    expect(gesteRetenu('secousse', bouton)).toBe(true)
    expect(gesteRetenu('secousse', document.body)).toBe(true)
    expect(gesteRetenu('secousse', null)).toBe(true)
  })
})
