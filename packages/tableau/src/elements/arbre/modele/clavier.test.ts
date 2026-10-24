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

  it('ouvre le panneau de gauche à Cmd+[ (et laisse Maj+Cmd+[ aux feuilles)', () => {
    expect(touche('[', { metaKey: true })).toEqual({ type: 'mode', mode: 'navigation' })
    expect(touche('[', { metaKey: true, shiftKey: true })).toBeNull()
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

describe('créer et écrire au clavier (docs/XMIND.md § 4 bis)', () => {
  it('Tab, Entrée et Maj+Entrée donnent un geste de création : jamais l’ouverture du champ', () => {
    for (const g of [touche('Tab'), touche('Enter'), touche('Enter', { shiftKey: true }), touche('Insert'), touche('Enter', { metaKey: true })]) {
      expect(g?.type).not.toBe('editer')
      expect(['enfant', 'frere', 'parent']).toContain(g?.type)
    }
  })

  it('Maj+Tab n’est pas à la carte', () => {
    expect(touche('Tab', { shiftKey: true })).toBeNull()
  })

  it('sur le central, Entrée reste un geste « frère » (la carte en fait un sous-sujet)', () => {
    expect(gesteDe(new KeyboardEvent('keydown', { key: 'Enter' }), [c], l, d)).toEqual({ type: 'frere', id: c, avant: false })
  })

  it('Espace ouvre l’édition du sujet choisi, sans frappe : le titre reste', () => {
    expect(touche(' ')).toEqual({ type: 'editer', id: p0 })
  })

  it('un caractère imprimable ouvre l’édition en remplaçant le titre, majuscule comprise', () => {
    expect(touche('a')).toEqual({ type: 'editer', id: p0, frappe: 'a' })
    expect(touche('A', { shiftKey: true })).toEqual({ type: 'editer', id: p0, frappe: 'A' })
    expect(touche('7')).toEqual({ type: 'editer', id: p0, frappe: '7' })
    expect(touche('?', { shiftKey: true })).toEqual({ type: 'editer', id: p0, frappe: '?' })
    expect(touche('ç')).toEqual({ type: 'editer', id: p0, frappe: 'ç' })
  })

  it('une touche qui n’est pas un caractère n’ouvre rien', () => {
    for (const k of ['Shift', 'Control', 'Meta', 'Alt', 'Escape', 'CapsLock', 'F5', 'Dead', 'Unidentified', 'Home', 'PageDown']) expect(touche(k)).toBeNull()
  })

  it('un caractère avec Cmd, Ctrl ou Alt n’est pas une frappe', () => {
    expect(touche('a', { ctrlKey: true })).toBeNull()
    expect(touche('x', { metaKey: true })?.type).not.toBe('editer')
    expect(touche('é', { altKey: true })).toBeNull()
  })

  it('la frappe vise le dernier sujet choisi', () => {
    expect(gesteDe(new KeyboardEvent('keydown', { key: 'z' }), [p0, p1], l, d)).toEqual({ type: 'editer', id: p1, frappe: 'z' })
    expect(gesteDe(new KeyboardEvent('keydown', { key: 'z' }), [], l, d)).toEqual({ type: 'editer', id: c, frappe: 'z' })
  })

  it('Maj+flèche étend la sélection au voisin, sans doubler le sujet', () => {
    expect(gesteDe(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }), [p0], l, d)).toEqual({ type: 'choisir', ids: [p0, c] })
    expect(gesteDe(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }), [c, p0], l, d)).toEqual({ type: 'choisir', ids: [c, p0] })
  })
})

