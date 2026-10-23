// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import { nouvelleColonne, nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import '../index'
import { creerNoteExtraite, docDuPassage, sansMarquesDeFil } from './extraction'
import { EXTENSIONS_NOTE } from './extensions'

const ouverts: Editor[] = []
afterEach(() => ouverts.splice(0).forEach((e) => e.destroy()))

const editeur = (...paragraphes: string[]) => {
  const e = new Editor({
    extensions: EXTENSIONS_NOTE,
    content: { type: 'doc', content: paragraphes.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p, marks: [{ type: 'commentaireTexte', attrs: { fil: 'f' } }, { type: 'bold' }] }] })) },
  })
  ouverts.push(e)
  return e
}

describe("le passage à extraire", () => {
  it('sans passage choisi, rien', () => {
    const e = editeur('abc')
    e.commands.setTextSelection(2)
    expect(docDuPassage(e)).toBeNull()
  })

  it('est coupé à ses bords, sans la marque de commentaire mais avec le reste de la mise en forme', () => {
    const e = editeur('abcdef')
    e.commands.setTextSelection({ from: 2, to: 5 })
    expect(docDuPassage(e)).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { petit: null, textAlign: 'left' }, content: [{ type: 'text', text: 'bcd', marks: [{ type: 'bold' }] }] }],
    })
  })

  it('court sur plusieurs paragraphes', () => {
    const e = editeur('abc', 'def')
    e.commands.setTextSelection({ from: 3, to: 8 })
    const doc = docDuPassage(e)!
    expect(doc.content!.map((p) => p.content![0]!.text)).toEqual(['c', 'de'])
  })

  it('retire les marques de fil à tout niveau', () => {
    expect(sansMarquesDeFil({ type: 'text', text: 'a', marks: [{ type: 'commentaireTexte', attrs: { fil: 'f' } }] })).toEqual({ type: 'text', text: 'a' })
  })
})

describe('la note née du passage', () => {
  const monde = (...elements: ReturnType<typeof nouvelleNote>[]) => {
    const magasin = creerMagasin({ titre: 't', elements })
    return { magasin, contexte: { magasin } as unknown as ContexteToile }
  }
  const texte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }

  it('se pose à l\'endroit lâché', () => {
    const { magasin, contexte } = monde()
    const neuve = creerNoteExtraite(contexte, texte, { x: 12.4, y: 30 }, null)
    expect(magasin.lire().elements).toHaveLength(1)
    expect(neuve).toMatchObject({ x: 12, y: 30, contenu: { type: 'note', texte } })
    expect(neuve.parent).toBeUndefined()
  })

  it('lâchée sur une colonne, elle s\'y range', () => {
    const colonne = nouvelleColonne(0, 0)
    const { magasin, contexte } = monde(colonne as never)
    const neuve = creerNoteExtraite(contexte, texte, { x: 0, y: 0 }, colonne.id)
    expect(magasin.lire().elements.find((e) => e.id === neuve.id)!.parent).toBe(colonne.id)
  })

  it('lâchée sur un élément de la colonne, elle se range juste après', () => {
    const colonne = nouvelleColonne(0, 0)
    const { magasin, contexte } = monde(colonne as never)
    const premiere = creerNoteExtraite(contexte, texte, { x: 0, y: 0 }, colonne.id)
    const derniere = creerNoteExtraite(contexte, texte, { x: 0, y: 0 }, colonne.id)
    const milieu = creerNoteExtraite(contexte, texte, { x: 0, y: 0 }, premiere.id)
    const rangs = magasin.lire().elements.filter((e) => e.parent === colonne.id).sort((a, b) => (a.ordre! < b.ordre! ? -1 : 1)).map((e) => e.id)
    expect(rangs).toEqual([premiere.id, milieu.id, derniere.id])
  })
})
