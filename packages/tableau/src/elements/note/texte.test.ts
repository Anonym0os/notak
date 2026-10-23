// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import type { NoeudTexte } from '../../coeur/tableau'
import { describe, expect, it } from 'vitest'
import { augmenterRetrait, casseSuivante, changerCasse, diminuerRetrait, enCasse, espacesAAjouter, espacesARetirer } from './texte'
import { EXTENSIONS_NOTE } from './extensions'

const editeur = (...lignes: string[]) =>
  new Editor({
    extensions: EXTENSIONS_NOTE,
    content: { type: 'doc', content: lignes.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) },
  })
const lignes = (e: Editor) => (e.getJSON() as NoeudTexte).content!.map((p) => p.content?.[0]?.text ?? '')

describe('retraits', () => {
  it('va au retrait suivant ou précédent, par quatre espaces', () => {
    expect([0, 1, 4, 6].map(espacesAAjouter)).toEqual([4, 3, 4, 2])
    expect([0, 1, 4, 6].map(espacesARetirer)).toEqual([0, 1, 4, 2])
  })

  it('décale chaque ligne choisie, puis la ramène', () => {
    const e = editeur('a', 'b')
    e.commands.selectAll()
    augmenterRetrait(e)
    expect(lignes(e)).toEqual(['    a', '    b'])
    diminuerRetrait(e)
    expect(lignes(e)).toEqual(['a', 'b'])
  })

  it('le curseur seul insère des espaces là où il est', () => {
    const e = editeur('ab')
    e.commands.setTextSelection(2)
    augmenterRetrait(e)
    expect(lignes(e)).toEqual(['a    b'])
  })
})

describe('casse', () => {
  it('passe des majuscules aux minuscules, puis à une capitale par mot', () => {
    expect(casseSuivante('Bonjour')).toBe('haut')
    expect(casseSuivante('BONJOUR')).toBe('bas')
    expect(casseSuivante('bonjour')).toBe('mots')
    expect(enCasse('mots', "l'été à paris")).toBe("L'Été À Paris")
  })

  it('Maj+F3 garde la mise en forme', () => {
    const e = new Editor({
      extensions: EXTENSIONS_NOTE,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ab' }, { type: 'text', text: 'cd', marks: [{ type: 'bold' }] }] }] },
    })
    e.commands.selectAll()
    changerCasse(e)
    const p = (e.getJSON() as NoeudTexte).content![0]!.content!
    expect(p.map((t) => t.text)).toEqual(['AB', 'CD'])
    expect(p[1]!.marks?.[0]?.type).toBe('bold')
    changerCasse(e)
    changerCasse(e)
    expect((e.getJSON() as NoeudTexte).content![0]!.content!.map((t) => t.text)).toEqual(['Ab', 'cd'])
  })
})
