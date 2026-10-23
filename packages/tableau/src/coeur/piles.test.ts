import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { creerMagasin, enLectureSeule } from './magasin'
import { creerMagasinYjs } from './magasinYjs'
import { nouvelleNote } from './tableau'

const vide = () => ({ titre: '', elements: [] })

describe.each([
  ['magasin simple', () => creerMagasin(vide())],
  ['magasin Yjs', () => creerMagasinYjs(new Y.Doc())],
])('les piles d’annulation du %s', (_nom, creer) => {
  it('commence vide, se remplit au geste, bascule en rétablissant', () => {
    const m = creer()
    expect([m.peutAnnuler(), m.peutRetablir()]).toEqual([false, false])
    m.faire([{ type: 'creer', element: nouvelleNote(1, 1) }])
    expect([m.peutAnnuler(), m.peutRetablir()]).toEqual([true, false])
    m.annuler()
    expect([m.peutAnnuler(), m.peutRetablir()]).toEqual([false, true])
    m.retablir()
    expect([m.peutAnnuler(), m.peutRetablir()]).toEqual([true, false])
  })

  it('un nouveau geste vide la pile de rétablissement', () => {
    const m = creer()
    m.faire([{ type: 'creer', element: nouvelleNote(1, 1) }])
    m.annuler()
    m.faire([{ type: 'creer', element: nouvelleNote(2, 2) }])
    expect(m.peutRetablir()).toBe(false)
  })

  it('prévient ceux qui écoutent quand une pile change, déjà à jour', () => {
    const m = creer()
    const vus: boolean[] = []
    m.ecouter(() => vus.push(m.peutAnnuler()))
    m.faire([{ type: 'creer', element: nouvelleNote(1, 1) }])
    expect(vus.at(-1)).toBe(true)
    m.annuler()
    expect(vus.at(-1)).toBe(false)
  })
})

describe('en lecture seule', () => {
  it('rien à annuler ni à rétablir', () => {
    const m = enLectureSeule(creerMagasin(vide()))
    expect([m.peutAnnuler(), m.peutRetablir()]).toEqual([false, false])
  })
})
