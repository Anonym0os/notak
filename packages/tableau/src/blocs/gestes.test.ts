// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { decaler, deplacer, dupliquer, supprimer } from './gestes'
import { EXTENSIONS_BLOCS } from './schema'
import { blocsChoisis } from './selection'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const p = (text: string, id: string): NoeudTexte => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] })
const li = (text: string, id: string): NoeudTexte => ({ type: 'listItem', attrs: { id }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const ouvrir = (...content: NoeudTexte[]) => (editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content } }))
const json = (ed: Editor) => ed.getJSON() as NoeudTexte
const ordre = (ed: Editor) => (json(ed).content ?? []).map((n) => (n.type === 'paragraph' ? n.content?.[0]?.text : n.type))
const appliquer = (ed: Editor, tr: ReturnType<typeof supprimer>) => {
  expect(tr).not.toBeNull()
  ed.view.dispatch(tr!)
}

describe('NOTION.md § 6 à 8 : les gestes sur des blocs', () => {
  it('supprime des blocs ; un document vidé garde un paragraphe', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    appliquer(ed, supprimer(ed.state, ['A', 'C']))
    expect(ordre(ed)).toEqual(['b'])
    appliquer(ed, supprimer(ed.state, ['B']))
    expect(ed.getJSON().content).toHaveLength(1)
    expect(ed.state.doc.textContent).toBe('')
  })

  it('le seul élément d’une liste emporte sa liste', () => {
    const ed = ouvrir({ type: 'bulletList', content: [li('x', 'X')] }, p('b', 'B'))
    appliquer(ed, supprimer(ed.state, ['X']))
    expect(ordre(ed)).toEqual(['b'])
  })

  it('duplique chaque bloc juste après lui, avec de nouveaux ids', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'))
    appliquer(ed, dupliquer(ed.state, ['A', 'B']))
    expect(ordre(ed)).toEqual(['a', 'a', 'b', 'b'])
    const ids = (ed.getJSON().content ?? []).map((n) => n.attrs?.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('déplace au-dessus ou au-dessous d’un bloc, en gardant les ids', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    appliquer(ed, deplacer(ed.state, ['A'], 'C', 'dessous'))
    expect(ordre(ed)).toEqual(['b', 'c', 'a'])
    appliquer(ed, deplacer(ed.state, ['A'], 'B', 'dessus'))
    expect(ordre(ed)).toEqual(['a', 'b', 'c'])
    expect(ed.getJSON().content?.[0]?.attrs?.id).toBe('A')
  })

  it('⌥ copie au lieu de déplacer', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'))
    appliquer(ed, deplacer(ed.state, ['A'], 'B', 'dessous', true))
    expect(ordre(ed)).toEqual(['a', 'b', 'a'])
  })

  it('un élément de liste sorti de sa liste retrouve une liste ; un texte posé dans une liste devient un élément', () => {
    const ed = ouvrir({ type: 'bulletList', content: [li('x', 'X'), li('y', 'Y')] }, p('b', 'B'))
    appliquer(ed, deplacer(ed.state, ['X'], 'B', 'dessous'))
    expect(ordre(ed)).toEqual(['bulletList', 'b', 'bulletList'])
    appliquer(ed, deplacer(ed.state, ['B'], 'Y', 'dessus'))
    const liste = json(ed).content?.[0]
    expect(liste?.type).toBe('bulletList')
    expect(liste?.content?.map((i) => i.content?.[0]?.content?.[0]?.text)).toEqual(['b', 'y'])
  })

  it('un bloc ne se pose pas dans ses propres descendants', () => {
    const ed = ouvrir({ type: 'deroulant', attrs: { id: 'D' }, content: [{ type: 'resumeDeroulant', content: [{ type: 'text', text: 'R' }] }, p('dedans', 'P')] })
    expect(deplacer(ed.state, ['D'], 'P', 'dessous')).toBeNull()
  })

  it('⌘⇧↑ et ⌘⇧↓ passent un frère', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    appliquer(ed, decaler(ed.state, ['B'], -1))
    expect(ordre(ed)).toEqual(['b', 'a', 'c'])
    appliquer(ed, decaler(ed.state, ['B'], 1))
    expect(ordre(ed)).toEqual(['a', 'b', 'c'])
    expect(decaler(ed.state, ['A'], -1)).toBeNull()
  })
})

const touche = (ed: Editor, key: string, plus: KeyboardEventInit = {}) => ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...plus }))

describe('NOTION.md § 7 : la sélection de blocs', () => {
  it('Échap choisit le bloc du curseur ; les flèches passent au voisin, Maj étend', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    ed.commands.setTextSelection(2)
    touche(ed, 'Escape')
    expect(blocsChoisis(ed.state)).toEqual(['A'])
    touche(ed, 'ArrowDown')
    expect(blocsChoisis(ed.state)).toEqual(['B'])
    touche(ed, 'ArrowDown', { shiftKey: true })
    expect(blocsChoisis(ed.state)).toEqual(['B', 'C'])
  })

  it('une lettre tapée n’écrase rien ; Retour arrière supprime les blocs choisis', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'))
    ed.commands.setTextSelection(2)
    touche(ed, 'Escape')
    touche(ed, 'x')
    expect(ordre(ed)).toEqual(['a', 'b'])
    touche(ed, 'Backspace')
    expect(ordre(ed)).toEqual(['b'])
    expect(blocsChoisis(ed.state)).toEqual([])
  })

  it('⌘⇧↓ déplace les blocs choisis, qui restent choisis ; Entrée revient au texte', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    ed.commands.setTextSelection(2)
    touche(ed, 'Escape')
    touche(ed, 'ArrowDown', { metaKey: true, shiftKey: true })
    expect(ordre(ed)).toEqual(['b', 'a', 'c'])
    expect(blocsChoisis(ed.state)).toEqual(['A'])
    touche(ed, 'Enter')
    expect(blocsChoisis(ed.state)).toEqual([])
    expect(ed.state.selection.$from.parent.textContent).toBe('a')
  })

  it('dans un dépliant fermé, les flèches sautent ce qu’il cache', () => {
    const ed = ouvrir(
      { type: 'deroulant', attrs: { id: 'D', ouvert: false }, content: [{ type: 'resumeDeroulant', content: [{ type: 'text', text: 'R' }] }, p('caché', 'P')] },
      p('b', 'B'),
    )
    ed.commands.setTextSelection(2)
    touche(ed, 'Escape')
    expect(blocsChoisis(ed.state)).toEqual(['D'])
    touche(ed, 'ArrowDown')
    expect(blocsChoisis(ed.state)).toEqual(['B'])
  })

  it('⌘D duplique le bloc du curseur, hors sélection de blocs', () => {
    const ed = ouvrir(p('a', 'A'))
    ed.commands.setTextSelection(2)
    touche(ed, 'd', { metaKey: true })
    expect(ordre(ed)).toEqual(['a', 'a'])
  })

  it('chaque bloc porte son id dans la page (`data-bloc`), sa couleur aussi', () => {
    const ed = ouvrir({ type: 'paragraph', attrs: { id: 'A', couleur: 'rouge-fond' }, content: [{ type: 'text', text: 'a' }] })
    const p = ed.view.dom.querySelector('p')!
    expect(p.getAttribute('data-bloc')).toBe('A')
    expect(p.getAttribute('data-couleur')).toBe('rouge-fond')
  })
})
