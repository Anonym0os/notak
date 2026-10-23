// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import { basculerCentre, basculerCode, basculerSurlignage, poserCouleurTexte, poserStyle } from './commandes'
import { EXTENSIONS_NOTE } from './extensions'

// Un éditeur laissé vivant garde un minuteur de ProseMirror, qui part après le démontage de jsdom.
const ouverts: Editor[] = []
afterEach(() => ouverts.splice(0).forEach((e) => e.destroy()))

const editeur = (texte = 'abc') => {
  const e = new Editor({
    extensions: EXTENSIONS_NOTE,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }] },
  })
  ouverts.push(e)
  return e
}

const marques = (e: Editor) => (e.getJSON().content![0]!.content![0] as NoeudTexte).marks?.map((m) => m.type) ?? []

describe('mise en forme', () => {
  it('le surlignage retire la couleur du texte, et inversement', () => {
    const e = editeur()
    e.commands.selectAll()
    poserCouleurTexte(e, 'bleu')
    expect(marques(e)).toEqual(['textStyle'])
    basculerSurlignage(e, 'vert')
    expect(marques(e)).toEqual(['highlight'])
    poserCouleurTexte(e, 'rouge')
    expect(marques(e)).toEqual(['textStyle'])
  })

  it('reposer le même surlignage le retire', () => {
    const e = editeur()
    e.commands.selectAll()
    basculerSurlignage(e, 'vert')
    basculerSurlignage(e, 'vert')
    expect(marques(e)).toEqual([])
  })

  it('centre et décentre', () => {
    const e = editeur()
    basculerCentre(e)
    expect(e.getJSON().content![0]!.attrs).toMatchObject({ textAlign: 'center' })
    basculerCentre(e)
    expect(e.getJSON().content![0]!.attrs).toMatchObject({ textAlign: 'left' })
  })

  it('pose et lève les styles de bloc', () => {
    const e = editeur()
    poserStyle(e, 'titre1')
    expect(e.getJSON().content![0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    poserStyle(e, 'citation')
    expect(e.isActive('blockquote')).toBe(true)
    poserStyle(e, 'texte')
    expect(e.getJSON().content![0]!.type).toBe('paragraph')
    poserStyle(e, 'code')
    expect(e.isActive('codeBlock')).toBe(true)
  })

  it('un titre posé sur une citation ou du code en retire l\'enveloppe', () => {
    const e = editeur()
    poserStyle(e, 'citation')
    poserStyle(e, 'titre1')
    expect(e.getJSON().content![0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    poserStyle(e, 'code')
    poserStyle(e, 'citation')
    expect(e.getJSON().content![0]!.type).toBe('blockquote')
    poserStyle(e, 'code')
    expect(e.getJSON().content![0]!.type).toBe('codeBlock')
  })

  it('⌘. : un passage dans une ligne passe en code en ligne, une ligne entière en bloc', () => {
    const e = editeur('abcdef')
    e.commands.setTextSelection({ from: 2, to: 4 })
    basculerCode(e)
    expect(e.isActive('code')).toBe(true)
    e.commands.setTextSelection({ from: 1, to: 7 })
    e.commands.unsetCode()
    basculerCode(e)
    expect(e.isActive('codeBlock')).toBe(true)
  })

  it('le code en ligne accepte d\'autres marques', () => {
    const e = editeur()
    e.commands.selectAll()
    e.commands.toggleCode()
    e.commands.toggleBold()
    expect(marques(e).sort()).toEqual(['bold', 'code'])
  })

  it('ne connaît que deux niveaux de titre', () => {
    const e = editeur()
    expect(e.commands.setHeading({ level: 3 })).toBe(false)
  })
})
