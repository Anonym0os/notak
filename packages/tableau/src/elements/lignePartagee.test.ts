import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { decaler, ecart } from './lignePartagee'

describe('ligne partagée', () => {
  it('ramène une frappe à ce qui a changé', () => {
    expect(ecart('Courses', 'Courses du jour')).toEqual({ pos: 7, retire: 0, insere: ' du jour' })
    expect(ecart('Courses', 'Course')).toEqual({ pos: 6, retire: 1, insere: '' })
    expect(ecart('abc', 'aXc')).toEqual({ pos: 1, retire: 1, insere: 'X' })
    // Une lettre répétée : le changement se place au plus loin, là où on tape d'ordinaire.
    expect(ecart('aa', 'aaa')).toEqual({ pos: 2, retire: 0, insere: 'a' })
    expect(ecart('même', 'même')).toEqual({ pos: 4, retire: 0, insere: '' })
  })

  it('le curseur suit ce que l’autre a écrit avant lui, et pas après', () => {
    expect(decaler(5, [{ insert: 'Les ' }])).toBe(9)
    expect(decaler(5, [{ retain: 7 }, { insert: '!' }])).toBe(5)
    expect(decaler(5, [{ retain: 1 }, { delete: 2 }])).toBe(3)
    // Une suppression qui englobe le curseur l'arrête à son début.
    expect(decaler(3, [{ retain: 1 }, { delete: 5 }])).toBe(1)
  })

  it('deux personnes qui tapent en même temps gardent chacune leurs lettres', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    const ta = a.getMap<Y.Text>('lignes')
    ta.set('x', new Y.Text('Courses'))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const la = ta.get('x')!
    const lb = b.getMap<Y.Text>('lignes').get('x')!
    const { pos, insere } = ecart(la.toString(), 'Les Courses')
    la.insert(pos, insere)
    const e = ecart(lb.toString(), 'Courses du jour')
    lb.insert(e.pos, e.insere)
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    expect(la.toString()).toBe('Les Courses du jour')
    expect(lb.toString()).toBe('Les Courses du jour')
  })
})
