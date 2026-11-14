import { describe, expect, it } from 'vitest'
import { estCreation, touchesCreation } from './raccourciCreation'

const touche = (init: Partial<KeyboardEvent>) => ({ shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...init }) as KeyboardEvent

describe('le raccourci de création', () => {
  it('s’affiche avec la lettre', () => {
    expect(touchesCreation('G')).toMatch(/G$/)
    expect(touchesCreation('B')).toMatch(/B$/)
  })
  it('exige les deux modificateurs et la bonne lettre', () => {
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    const bon = mac ? { ctrlKey: true, metaKey: true } : { ctrlKey: true, altKey: true }
    expect(estCreation(touche({ code: 'KeyG', ...bon }), 'G')).toBe(true)
    expect(estCreation(touche({ code: 'KeyB', ...bon }), 'G')).toBe(false)
    expect(estCreation(touche({ code: 'KeyG', ctrlKey: true }), 'G')).toBe(false)
    expect(estCreation(touche({ code: 'KeyG', ...bon, shiftKey: true }), 'G')).toBe(false)
  })

  it('lit la lettre marquée : sur un clavier Dvorak, ⌃⌘G est la touche G, pas celle que QWERTY place à G', () => {
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    const bon = mac ? { ctrlKey: true, metaKey: true } : { ctrlKey: true, altKey: true }
    // En Dvorak, la lettre G est à la place QWERTY de I ; ce que QWERTY place à G y est un U.
    expect(estCreation(touche({ key: 'g', code: 'KeyI', keyCode: 71, ...bon }), 'G')).toBe(true)
    expect(estCreation(touche({ key: 'u', code: 'KeyG', keyCode: 85, ...bon }), 'G')).toBe(false)
  })
})
