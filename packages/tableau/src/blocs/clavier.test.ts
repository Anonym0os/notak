// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { CLE_GESTE } from './annulation'
import { entree, entreeCode, retourArriere, suppr, tab } from './clavier'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })
const p = (text: string, attrs: Record<string, unknown> = {}) => b('paragraph', text, attrs)

/** Un éditeur, le curseur dans le bloc `i` à la position `ou` de son texte (`fin` : à sa fin). */
function ouvrir(blocs: NoeudTexte[], i = 0, ou: number | 'fin' = 'fin'): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  let pos = 0
  for (let k = 0; k < i; k++) pos += editeur.state.doc.child(k).nodeSize
  const n = editeur.state.doc.child(i)
  editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.create(editeur.state.doc, pos + 1 + (ou === 'fin' ? n.content.size : ou))))
  return editeur
}

const jouer = (ed: Editor, f: (s: Editor['state']) => ReturnType<typeof entree>) => {
  const tr = f(ed.state)
  expect(tr).not.toBeNull()
  ed.view.dispatch(tr!)
}
const lire = (ed: Editor) => ((ed.getJSON() as NoeudTexte).content ?? []).map((n) => `${n.type}${n.attrs?.retrait ? `>${n.attrs.retrait}` : ''}:${(n.content ?? []).map((t) => t.text).join('')}`)
const ici = (ed: Editor) => ed.state.selection.$from.parent.textContent

describe('NOTION.md § 5 : Entrée', () => {
  it('une puce donne une puce ; un titre, une citation, un encadré donnent du texte', () => {
    for (const [type, attendu] of [['puce', 'puce'], ['tache', 'tache'], ['numero', 'numero'], ['heading', 'paragraph'], ['citation', 'paragraph'], ['encadreBloc', 'paragraph']] as const) {
      const ed = ouvrir([b(type, 'a', type === 'heading' ? { level: 1 } : {})])
      jouer(ed, entree)
      expect(ed.getJSON().content?.[1]?.type).toBe(attendu)
      ed.destroy()
    }
  })

  it('au milieu d’un titre, la seconde moitié devient du texte', () => {
    const ed = ouvrir([b('heading', 'Titre', { level: 2 })], 0, 3)
    jouer(ed, entree)
    expect(lire(ed)).toEqual(['heading:Tit', 'paragraph:re'])
  })

  it('une tâche neuve n’est pas cochée ; le retrait suit', () => {
    const ed = ouvrir([b('tache', 'a', { coche: true, retrait: 1 })])
    jouer(ed, entree)
    expect(ed.getJSON().content?.[1]).toMatchObject({ type: 'tache', attrs: { coche: false, retrait: 1 } })
  })

  it('un dépliant ouvert reçoit un premier enfant ; un dépliant fermé, un frère après ses enfants cachés', () => {
    const ed = ouvrir([b('depliant', 'D'), p('dedans', { retrait: 1 })])
    jouer(ed, entree)
    expect(lire(ed)).toEqual(['depliant:D', 'paragraph>1:', 'paragraph>1:dedans'])
    ed.destroy()
    const ed2 = ouvrir([b('depliant', 'D', { ouvert: false }), p('caché', { retrait: 1 })])
    jouer(ed2, entree)
    expect(lire(ed2)).toEqual(['depliant:D', 'paragraph>1:caché', 'depliant:'])
    expect(ed2.state.selection.$from.parent.type.name).toBe('depliant')
  })

  it('les enfants d’une puce coupée passent sous la nouvelle', () => {
    const ed = ouvrir([b('puce', 'a'), b('puce', 'x', { retrait: 1 })])
    jouer(ed, entree)
    expect(lire(ed)).toEqual(['puce:a', 'puce:', 'puce>1:x'])
  })

  it('en tête d’un bloc non vide, un bloc vide se glisse au-dessus et le curseur reste', () => {
    const ed = ouvrir([b('heading', 'T', { level: 1 })], 0, 0)
    jouer(ed, entree)
    expect(lire(ed)).toEqual(['paragraph:', 'heading:T'])
    expect(ici(ed)).toBe('T')
  })

  it('une puce vide devient du texte ; imbriquée et dernière, elle remonte d’un cran', () => {
    const ed = ouvrir([b('puce', '')])
    jouer(ed, entree)
    expect(lire(ed)).toEqual(['paragraph:'])
    ed.destroy()
    const ed2 = ouvrir([b('puce', 'a'), b('puce', '', { retrait: 1 })], 1)
    jouer(ed2, entree)
    expect(lire(ed2)).toEqual(['puce:a', 'puce:'])
  })
})

describe('NOTION.md § 5 : Retour arrière et Suppr', () => {
  it('en tête d’une puce, d’une tâche cochée, d’une citation : du texte, à sa place', () => {
    const ed = ouvrir([p('a'), b('tache', 'x', { coche: true, retrait: 1 })], 1, 0)
    jouer(ed, retourArriere)
    expect(ed.getJSON().content?.[1]).toMatchObject({ type: 'paragraph', attrs: { retrait: 1 } })
  })

  it('un titre simple fusionne directement avec le texte d’avant', () => {
    const ed = ouvrir([p('a'), b('heading', 'T', { level: 1 })], 1, 0)
    jouer(ed, retourArriere)
    expect(lire(ed)).toEqual(['paragraph:aT'])
    expect(ed.state.selection.$from.parentOffset).toBe(1)
  })

  it('la fusion saute le séparateur ; les enfants du bloc fusionné prennent sa place', () => {
    const ed = ouvrir([p('a'), { type: 'horizontalRule' }, p('b'), p('b1', { retrait: 1 })], 2, 0)
    jouer(ed, retourArriere)
    expect(lire(ed)).toEqual(['paragraph:ab', 'horizontalRule:', 'paragraph:b1'])
  })

  it('le dernier enfant remonte d’un cran plutôt que de fusionner', () => {
    const ed = ouvrir([b('puce', 'a'), p('x', { retrait: 1 })], 1, 0)
    jouer(ed, retourArriere)
    expect(lire(ed)).toEqual(['puce:a', 'paragraph:x'])
  })

  it('⌘ + Retour arrière fusionne sans convertir', () => {
    const ed = ouvrir([p('a'), b('puce', 'x')], 1, 0)
    jouer(ed, (s) => retourArriere(s, true))
    expect(lire(ed)).toEqual(['paragraph:ax'])
  })

  it('Suppr en fin de bloc absorbe le texte suivant, quel que soit son type', () => {
    const ed = ouvrir([p('a'), b('heading', 'T', { level: 1 })])
    jouer(ed, suppr)
    expect(lire(ed)).toEqual(['paragraph:aT'])
  })
})

describe('NOTION.md § 3 : Tab dans le texte', () => {
  it('Tab range le bloc du curseur, jamais d’espaces', () => {
    const ed = ouvrir([p('a'), p('b')], 1, 1)
    jouer(ed, (s) => tab(s, 1))
    expect(lire(ed)).toEqual(['paragraph:a', 'paragraph>1:b'])
  })

  it('dans le code, Tab met une tabulation en tête de chaque ligne touchée', () => {
    const ed = ouvrir([{ type: 'codeBlock', content: [{ type: 'text', text: 'un\ndeux' }] }], 0, 4)
    jouer(ed, (s) => tab(s, 1))
    expect(ed.state.doc.textContent).toBe('un\n\tdeux')
    jouer(ed, (s) => tab(s, -1))
    expect(ed.state.doc.textContent).toBe('un\ndeux')
  })
})

describe('NOTION.md § 5 : Entrée dans le code et dans un encadré', () => {
  it('dans un code, Entrée écrit un saut de ligne et recopie l’indentation de la ligne', () => {
    const ed = ouvrir([{ type: 'codeBlock', content: [{ type: 'text', text: 'a\n  \tb' }] }])
    jouer(ed, (s) => entreeCode(s))
    expect(ed.state.doc.textContent).toBe('a\n  \tb\n  \t')
    expect(ed.state.selection.$from.parentOffset).toBe(ed.state.doc.textContent.length)
  })

  it('Entrée sur un bloc de texte vide, dernier enfant d’un encadré, l’en fait sortir', () => {
    const ed = ouvrir([b('encadreBloc', 'E'), p('', { retrait: 1 })], 1)
    jouer(ed, entree)
    expect(lire(ed)).toEqual(['encadreBloc:E', 'paragraph:'])
  })

  it('une puce vide, dernier enfant d’un encadré, en sort aussi et reste une puce', () => {
    const ed = ouvrir([b('encadreBloc', 'E'), b('puce', '', { retrait: 1 })], 1)
    jouer(ed, entree)
    expect(lire(ed)).toEqual(['encadreBloc:E', 'puce:'])
  })
})

describe('NOTION.md § 5 : touches du clavier', () => {
  it('Retour arrière en tête d’un bloc de code ne fait rien', () => {
    const ed = ouvrir([{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }], 0, 0)
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
    expect(lire(ed)).toEqual(['codeBlock:x'])
  })

  it('chaque geste est marqué comme un pas d’annulation à part', () => {
    const ed = ouvrir([p('a'), p('b')], 1, 0)
    expect(entree(ed.state)!.getMeta(CLE_GESTE)).toBe(true)
    expect(retourArriere(ed.state)!.getMeta(CLE_GESTE)).toBe(true)
    expect(tab(ed.state, 1)!.getMeta(CLE_GESTE)).toBe(true)
  })

  it('Retour arrière en tête du premier bloc d’une colonne ne tire pas le texte d’une autre colonne', () => {
    const col = (...blocs: NoeudTexte[]): NoeudTexte => ({ type: 'colonne', content: blocs })
    editeur = new Editor({
      extensions: EXTENSIONS_BLOCS,
      content: { type: 'doc', content: [{ type: 'colonnes', content: [col(p('gauche')), col(p('droite'))] }] },
    })
    const ids = poserIds(editeur.state)
    if (ids) editeur.view.dispatch(ids)
    let pos = 0
    editeur.state.doc.descendants((n, ici) => {
      if (n.isTextblock && n.textContent === 'droite') pos = ici + 1
    })
    editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.create(editeur.state.doc, pos)))
    const tr = retourArriere(editeur.state)
    expect(tr?.docChanged).toBeFalsy()
  })

  it('Tab dans une cellule de tableau va à la cellule suivante, et n’indente pas le tableau', () => {
    const cellule = (t: string): NoeudTexte => ({ type: 'celluleTable', content: [p(t)] })
    const ed = ouvrir([{ type: 'table', content: [{ type: 'ligneTable', content: [cellule('un'), cellule('deux')] }] }])
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(4))))
    expect(ici(ed)).toBe('un')
    jouer(ed, (s) => tab(s, 1))
    expect(ici(ed)).toBe('deux')
    expect(ed.getJSON().content?.[0]?.attrs?.retrait ?? 0).toBe(0)
    jouer(ed, (s) => tab(s, -1))
    expect(ici(ed)).toBe('un')
  })
})

describe('IME : rien ne casse pendant une composition', () => {
  it('Entrée, Retour arrière, Suppr et Tab laissent la composition faire', () => {
    const ed = ouvrir([p('ab'), p('cd')], 0, 1)
    ;(ed.view as unknown as { input: { composing: boolean } }).input.composing = true
    for (const key of ['Enter', 'Backspace', 'Delete', 'Tab']) ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    expect(lire(ed)).toEqual(['paragraph:ab', 'paragraph:cd'])
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true, isComposing: true }))
    expect(lire(ed)).toEqual(['paragraph:ab', 'paragraph:cd'])
    ;(ed.view as unknown as { input: { composing: boolean } }).input.composing = false
  })
})

describe('NOTION.md § 5 : cas du relevé 1 § 1 et § 2', () => {
  it('une puce vide imbriquée qui n’est pas la dernière devient du texte, toujours imbriquée', () => {
    const ed = ouvrir([b('puce', 'a'), b('puce', '', { retrait: 1 }), b('puce', 'b', { retrait: 1 })], 1)
    jouer(ed, entree)
    expect(lire(ed)).toEqual(['puce:a', 'paragraph>1:', 'puce>1:b'])
  })

  it('Retour arrière sur une sélection de plusieurs blocs : la fin du dernier se recolle à la fin du premier, qui garde son type', () => {
    const ed = ouvrir([b('puce', 'abc'), p('def')], 0, 2)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 3, 8)))
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
    expect(lire(ed)).toEqual(['puce:abf'])
  })

  it('Maj+Entrée écrit un saut de ligne dans un texte, et sort d’un code', () => {
    const ed = ouvrir([p('ab')], 0, 1)
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    expect(ed.getJSON().content?.[0]?.content?.some((n) => n.type === 'hardBreak')).toBe(true)
    const ed2 = ouvrir([{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }])
    ed2.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    expect(lire(ed2)).toEqual(['codeBlock:x', 'paragraph:'])
  })
})
