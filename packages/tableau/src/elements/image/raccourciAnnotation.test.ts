import { afterEach, describe, expect, it } from 'vitest'
import type { ContexteToile } from '../types'
import { annoter, etatAnnotation } from './modeAnnotation'
import { raccourciAnnoter } from './raccourciAnnotation'

const touche = (init: Partial<KeyboardEvent>) => ({ key: 'D', shiftKey: true, metaKey: false, ctrlKey: false, altKey: false, ...init }) as KeyboardEvent
const contexte = (choisis: string[], elements: { id: string; type: string; verrou?: boolean }[]) =>
  ({
    selection: new Set(choisis),
    magasin: { lire: () => ({ elements: elements.map((e) => ({ id: e.id, verrou: e.verrou, contenu: { type: e.type } })) }) },
  }) as unknown as ContexteToile

afterEach(() => annoter(null))

describe('Maj+D', () => {
  it('entre dans le mode dessin sur l’image choisie, puis en sort', () => {
    const c = contexte(['a'], [{ id: 'a', type: 'image' }])
    expect(raccourciAnnoter(touche({}), c)).toBe(true)
    expect(etatAnnotation().id).toBe('a')
    expect(raccourciAnnoter(touche({}), c)).toBe(true)
    expect(etatAnnotation().id).toBeNull()
  })
  it('ne fait rien sans image seule choisie', () => {
    expect(raccourciAnnoter(touche({}), contexte([], []))).toBe(false)
    expect(raccourciAnnoter(touche({}), contexte(['a', 'b'], [{ id: 'a', type: 'image' }, { id: 'b', type: 'image' }]))).toBe(false)
    expect(raccourciAnnoter(touche({}), contexte(['a'], [{ id: 'a', type: 'note' }]))).toBe(false)
    expect(raccourciAnnoter(touche({}), contexte(['a'], [{ id: 'a', type: 'image', verrou: true }]))).toBe(false)
    expect(etatAnnotation().id).toBeNull()
  })
  it('laisse les autres touches, dont Cmd+Maj+D (thème sombre)', () => {
    const c = contexte(['a'], [{ id: 'a', type: 'image' }])
    expect(raccourciAnnoter(touche({ shiftKey: false, key: 'd' }), c)).toBe(false)
    expect(raccourciAnnoter(touche({ metaKey: true }), c)).toBe(false)
    expect(raccourciAnnoter(touche({ key: 'e' }), c)).toBe(false)
  })
})
