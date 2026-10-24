// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Id } from '../../../coeur/tableau'
import { disposer } from '../disposition'
import { gesteDe } from './clavier'
import { ajouterEnfant, lire, nouvelArbre } from './sujets'

// Central, deux principaux : P0 à droite, P1 à gauche.
let a = nouvelArbre('C')
const c = lire(a).central
let p0: Id, p1: Id
;[a, p0] = ajouterEnfant(a, c, 'P0')
;[a, p1] = ajouterEnfant(a, c, 'P1')
const l = lire(a)
const d = disposer(l, () => ({ l: 80, h: 24 }))

const touche = (key: string, mods: Partial<KeyboardEvent> = {}) =>
  gesteDe(new KeyboardEvent('keydown', { key, ...mods }), [p0], l, d)

describe('le clavier d’une carte (docs/XMIND.md § 4)', () => {
  it('crée', () => {
    expect(touche('Tab')).toEqual({ type: 'enfant', id: p0 })
    expect(touche('Insert')).toEqual({ type: 'enfant', id: p0 })
    expect(touche('Enter')).toEqual({ type: 'frere', id: p0, avant: false })
    expect(touche('Enter', { shiftKey: true })).toEqual({ type: 'frere', id: p0, avant: true })
    expect(touche('Enter', { metaKey: true })).toEqual({ type: 'parent', id: p0 })
  })

  it('édite et supprime', () => {
    expect(touche(' ')).toEqual({ type: 'editer', id: p0 })
    expect(touche('F2')).toEqual({ type: 'editer', id: p0 })
    expect(touche('é')).toEqual({ type: 'editer', id: p0, frappe: 'é' })
    expect(touche('Backspace')).toEqual({ type: 'supprimer', ids: [p0] })
    expect(touche('Backspace', { metaKey: true })).toEqual({ type: 'supprimerSeul', id: p0 })
    expect(touche('d', { metaKey: true })).toEqual({ type: 'dupliquer', id: p0 })
  })

  it('replie, sur AZERTY comme ailleurs : la touche se lit au caractère', () => {
    expect(touche('/', { metaKey: true, shiftKey: true })).toEqual({ type: 'replier', id: p0 })
    expect(touche('/', { metaKey: true, altKey: true })).toEqual({ type: 'toutReplier' })
    expect(touche('&', { metaKey: true, altKey: true, code: 'Digit1' })).toEqual({ type: 'deplierNiveau', n: 1 })
  })

  it('les flèches suivent la carte dessinée : à gauche de P0, le central, puis P1', () => {
    expect(touche('ArrowLeft')).toEqual({ type: 'choisir', ids: [c] })
    expect(gesteDe(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), [c], l, d)).toEqual({ type: 'choisir', ids: [p1] })
    expect(touche('ArrowRight')).toEqual({ type: 'choisir', ids: [p0] })
    expect(touche('ArrowDown', { altKey: true })).toEqual({ type: 'echanger', id: p0, sens: 1 })
  })
})
