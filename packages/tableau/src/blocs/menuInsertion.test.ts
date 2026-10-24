// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { CATALOGUE } from './catalogue'
import { poserIds } from './ids'
import { choisirDansSlash, decisionInsertion } from './menuInsertion'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })

/** Un éditeur, le curseur à la fin du bloc `i`. */
function ouvrir(blocs: NoeudTexte[], i = 0): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  let pos = 0
  for (let k = 0; k < i; k++) pos += editeur.state.doc.child(k).nodeSize
  const n = editeur.state.doc.child(i)
  editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.create(editeur.state.doc, pos + 1 + n.content.size)))
  return editeur
}

const lire = (ed: Editor) => ((ed.getJSON() as NoeudTexte).content ?? []).map((n) => `${n.type}${n.attrs?.retrait ? `>${n.attrs.retrait}` : ''}:${(n.content ?? []).map((t) => t.text).join('')}`)
const entree = (id: string) => CATALOGUE.find((e) => e.id === id)!
/** La zone du `/` et de son filtre, à la fin du bloc du curseur. */
const zone = (ed: Editor, longueur: number) => ({ de: ed.state.selection.from - longueur, a: ed.state.selection.from })

describe('NOTION.md § 2.5 : insérer dessous, ou remplacer', () => {
  it('seul un paragraphe vide, sans enfant, est remplacé', () => {
    const base = { type: 'paragraph', vide: true, enfants: 0, dansConteneur: true }
    expect(decisionInsertion(base)).toBe('remplacer')
    expect(decisionInsertion({ ...base, type: 'puce' })).toBe('dessous')
    expect(decisionInsertion({ ...base, type: 'heading' })).toBe('dessous')
    expect(decisionInsertion({ ...base, type: 'tache' })).toBe('dessous')
    expect(decisionInsertion({ ...base, type: 'citation' })).toBe('dessous')
    expect(decisionInsertion({ ...base, type: 'encadreBloc' })).toBe('dessous')
    expect(decisionInsertion({ ...base, vide: false })).toBe('dessous')
    expect(decisionInsertion({ ...base, enfants: 2 })).toBe('dessous')
    expect(decisionInsertion({ ...base, dansConteneur: false })).toBe('dessous')
  })

  it('un paragraphe vide devient le bloc choisi : il n’en reste pas un vide', () => {
    const ed = ouvrir([b('paragraph', '/tit')])
    choisirDansSlash(ed, entree('titre1'), zone(ed, 4))
    expect(lire(ed)).toEqual(['heading:'])
    expect(ed.getJSON().content?.[0]).toMatchObject({ attrs: { level: 1 } })
  })

  it('une puce vide reste, le bloc vient dessous', () => {
    const ed = ouvrir([b('puce', '/tit')])
    choisirDansSlash(ed, entree('titre2'), zone(ed, 4))
    expect(lire(ed)).toEqual(['puce:', 'heading:'])
    expect(ed.state.selection.$from.parent.type.name).toBe('heading')
  })

  it('le texte d’avant le `/` reste, le bloc vient dessous', () => {
    const ed = ouvrir([b('paragraph', 'voir /tit')])
    choisirDansSlash(ed, entree('puce'), zone(ed, 4))
    expect(lire(ed)).toEqual(['paragraph:voir ', 'puce:'])
  })

  it('un bloc qui a des enfants garde ses enfants : le bloc neuf se pose après eux, au même retrait', () => {
    const ed = ouvrir([b('paragraph', '/tit'), b('paragraph', 'enfant', { retrait: 1 }), b('paragraph', 'frère')])
    choisirDansSlash(ed, entree('code'), zone(ed, 4))
    expect(lire(ed)).toEqual(['paragraph:', 'paragraph>1:enfant', 'codeBlock:', 'paragraph:frère'])
  })

  it('un séparateur remplace le paragraphe vide, et se pose sous un bloc qui a du texte', () => {
    const ed = ouvrir([b('paragraph', '/sep')])
    choisirDansSlash(ed, entree('separateur'), zone(ed, 4))
    expect(lire(ed)).toEqual(['horizontalRule:', 'paragraph:'])
    ed.destroy()
    const ed2 = ouvrir([b('heading', 'Titre /sep', { level: 1 })])
    choisirDansSlash(ed2, entree('separateur'), zone(ed2, 4))
    expect(lire(ed2)).toEqual(['heading:Titre ', 'horizontalRule:', 'paragraph:'])
  })

  it('« Transformer en » transforme le bloc courant, sans en insérer', () => {
    const ed = ouvrir([b('puce', 'a /tit')])
    choisirDansSlash(ed, entree('vers-titre1'), zone(ed, 4))
    expect(lire(ed)).toEqual(['heading:a '])
  })

  it('choisir un bloc se défait d’un seul ⌘Z', () => {
    const ed = ouvrir([b('puce', '/tit')])
    const avant = lire(ed)
    choisirDansSlash(ed, entree('titre1'), zone(ed, 4))
    expect(lire(ed)).toEqual(['puce:', 'heading:'])
    ed.commands.undo()
    expect(lire(ed)).toEqual(avant)
  })

  it('remplacer un paragraphe vide se défait d’un seul ⌘Z', () => {
    const ed = ouvrir([b('paragraph', '/tit')])
    const avant = lire(ed)
    choisirDansSlash(ed, entree('titre3'), zone(ed, 4))
    ed.commands.undo()
    expect(lire(ed)).toEqual(avant)
  })
})
