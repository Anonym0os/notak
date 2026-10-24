// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { decaler, deplacer, dupliquer, indenter, supprimer } from './gestes'
import { EXTENSIONS_BLOCS } from './schema'
import { blocsChoisis } from './selection'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const p = (text: string, id: string): NoeudTexte => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] })
const b = (type: string, text: string, id: string, plus: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs: { id, ...plus }, content: [{ type: 'text', text }] })
const retraits = (ed: Editor) => (json(ed).content ?? []).map((n) => `${n.content?.[0]?.text ?? n.type}:${n.attrs?.retrait ?? 0}`)
const ouvrir = (...content: NoeudTexte[]) => (editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content } }))
const json = (ed: Editor) => ed.getJSON() as NoeudTexte
const ordre = (ed: Editor) => (json(ed).content ?? []).map((n) => n.content?.[0]?.text ?? n.type)
const appliquer = (ed: Editor, tr: ReturnType<typeof supprimer> | undefined) => {
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

  it('un bloc emporte ses enfants', () => {
    const ed = ouvrir(b('puce', 'x', 'X'), b('puce', 'y', 'Y', { retrait: 1 }), p('b', 'B'))
    appliquer(ed, supprimer(ed.state, ['X']))
    expect(ordre(ed)).toEqual(['b'])
  })

  it('duplique les blocs et leurs enfants après le dernier, avec de nouveaux ids, et rend les copies', () => {
    const ed = ouvrir(p('a', 'A'), b('puce', 'a1', 'A1', { retrait: 1 }), p('b', 'B'))
    const d = dupliquer(ed.state, ['A', 'B'])!
    appliquer(ed, d.tr)
    expect(ordre(ed)).toEqual(['a', 'a1', 'b', 'a', 'a1', 'b'])
    expect(retraits(ed)[4]).toBe('a1:1')
    const ids = (ed.getJSON().content ?? []).map((n) => n.attrs?.id)
    expect(new Set(ids).size).toBe(6)
    expect(d.copies).toEqual([ids[3], ids[5]])
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

  it('un bloc déplacé garde ses enfants et prend le rang de la cible', () => {
    const ed = ouvrir(p('a', 'A'), b('puce', 'x', 'X', { retrait: 1 }), b('puce', 'x1', 'X1', { retrait: 2 }), p('b', 'B'))
    appliquer(ed, deplacer(ed.state, ['X'], 'B', 'dessous'))
    expect(retraits(ed)).toEqual(['a:0', 'b:0', 'x:0', 'x1:1'])
  })

  it('un bloc ne se pose pas dans ses propres enfants', () => {
    const ed = ouvrir(b('depliant', 'R', 'D'), { type: 'paragraph', attrs: { id: 'P', retrait: 1 }, content: [{ type: 'text', text: 'dedans' }] })
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

  it('⌘⇧↑ emporte les enfants et passe le sous-arbre du frère', () => {
    const ed = ouvrir(p('a', 'A'), b('puce', 'a1', 'A1', { retrait: 1 }), p('b', 'B'), b('puce', 'b1', 'B1', { retrait: 1 }))
    appliquer(ed, decaler(ed.state, ['B'], -1))
    expect(ordre(ed)).toEqual(['b', 'b1', 'a', 'a1'])
  })
})

describe('NOTION.md § 3 : Tab et Maj+Tab', () => {
  it('Tab range le bloc seul sous son frère d’avant ; ses enfants restent où ils sont', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C', ), )
    ed.view.dispatch(ed.state.tr.setNodeAttribute(ed.state.doc.child(0).nodeSize + ed.state.doc.child(1).nodeSize, 'retrait', 1))
    appliquer(ed, indenter(ed.state, ['B'], 1))
    expect(retraits(ed)).toEqual(['a:0', 'b:1', 'c:1'])
  })

  it('Tab ne range rien sous un titre simple, ni sous rien', () => {
    const ed = ouvrir(b('heading', 'T', 'T', { level: 1 }), p('a', 'A'))
    expect(indenter(ed.state, ['A'], 1)).toBeNull()
    expect(indenter(ed.state, ['T'], 1)).toBeNull()
  })

  it('Tab sous un dépliant fermé l’ouvre', () => {
    const ed = ouvrir(b('depliant', 'D', 'D', { ouvert: false }), p('a', 'A'))
    appliquer(ed, indenter(ed.state, ['A'], 1))
    expect(json(ed).content?.[0]?.attrs?.ouvert).toBe(true)
  })

  it('Maj+Tab sort le bloc avec ses enfants ; ses frères d’après deviennent ses enfants', () => {
    const ed = ouvrir(p('a', 'A'), b('puce', 'x', 'X', { retrait: 1 }), b('puce', 'x1', 'X1', { retrait: 2 }), b('puce', 'y', 'Y', { retrait: 1 }))
    appliquer(ed, indenter(ed.state, ['X'], -1))
    expect(retraits(ed)).toEqual(['a:0', 'x:0', 'x1:1', 'y:1'])
  })

  it('Maj+Tab ne sort pas d’un encadré', () => {
    const ed = ouvrir(b('encadreBloc', 'e', 'E'), p('a', 'A', ))
    ed.view.dispatch(ed.state.tr.setNodeAttribute(ed.state.doc.child(0).nodeSize, 'retrait', 1))
    expect(indenter(ed.state, ['A'], -1)).toBeNull()
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
    const ed = ouvrir(b('depliant', 'R', 'D', { ouvert: false }), { type: 'paragraph', attrs: { id: 'P', retrait: 1 }, content: [{ type: 'text', text: 'caché' }] }, p('b', 'B'))
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
    expect(blocsChoisis(ed.state)).toHaveLength(1)
    expect(blocsChoisis(ed.state)[0]).not.toBe('A')
  })

  it('Tab sur des blocs choisis les range avec leurs enfants', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), b('puce', 'b1', 'B1', { retrait: 1 }))
    ed.commands.setTextSelection(5)
    touche(ed, 'Escape')
    touche(ed, 'Tab')
    expect(retraits(ed)).toEqual(['a:0', 'b:1', 'b1:2'])
    expect(blocsChoisis(ed.state)).toEqual(['B'])
  })

  it('chaque bloc porte son id dans la page (`data-bloc`), sa couleur aussi', () => {
    const ed = ouvrir({ type: 'paragraph', attrs: { id: 'A', couleur: 'rouge-fond' }, content: [{ type: 'text', text: 'a' }] })
    const p = ed.view.dom.querySelector('p')!
    expect(p.getAttribute('data-bloc')).toBe('A')
    expect(p.getAttribute('data-couleur')).toBe('rouge-fond')
  })
})
