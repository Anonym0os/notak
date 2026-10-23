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
})
