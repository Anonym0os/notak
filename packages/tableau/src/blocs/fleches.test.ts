// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { apresLesBlocsSansTexte, ligneLogique, plageDesBlocs, toutSelectionner } from './fleches'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const p = (text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type: 'paragraph', attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })
const hr: NoeudTexte = { type: 'horizontalRule' }

/** Un éditeur, le curseur au bloc `i` de la page, à `ou` de son texte (`fin` : à sa fin). */
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

const touche = (ed: Editor, init: KeyboardEventInit) => ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
const ici = (ed: Editor) => ed.state.selection.$from.parent.textContent

describe('flèches : à travers un séparateur ou une image', () => {
  it('vers le bas, la flèche saute les blocs sans texte et arrive au début du texte d’après', () => {
    const ed = ouvrir([p('un'), hr, { type: 'image', attrs: { fichier: 'f' } }, p('deux')], 0)
    const cible = apresLesBlocsSansTexte(ed.state, 1)
    expect(cible).toBeTypeOf('number')
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, cible as number)))
    expect(ici(ed)).toBe('deux')
    expect(ed.state.selection.$from.parentOffset).toBe(0)
  })

  it('vers le haut, elle arrive à la fin du texte d’avant', () => {
    const ed = ouvrir([p('un'), hr, p('deux')], 2, 0)
    const cible = apresLesBlocsSansTexte(ed.state, -1)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, cible as number)))
    expect(ici(ed)).toBe('un')
    expect(ed.state.selection.$from.parentOffset).toBe(2)
  })

  it('quand le voisin a du texte, le navigateur s’en charge', () => {
    const ed = ouvrir([p('un'), p('deux')], 0)
    expect(apresLesBlocsSansTexte(ed.state, 1)).toBeNull()
  })

  it('plus de texte de ce côté : la flèche ne fait rien', () => {
    const ed = ouvrir([p('un'), hr], 0)
    expect(apresLesBlocsSansTexte(ed.state, 1)).toBe(false)
  })

  it('un dépliant fermé cache ses enfants : on les enjambe', () => {
    const ed = ouvrir([p('un'), hr, { type: 'depliant', attrs: { ouvert: false } }, p('caché', { retrait: 1 }), p('fin')], 0)
    const d = apresLesBlocsSansTexte(ed.state, 1) as number
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, d)))
    expect(ed.state.selection.$from.parent.type.name).toBe('depliant')
    // Vers le haut depuis « fin » : les enfants cachés ne reçoivent pas le curseur, il arrive sur le dépliant.
    const ed2 = ouvrir([{ type: 'depliant', attrs: { ouvert: false } }, p('caché', { retrait: 1 }), hr, p('fin')], 3, 0)
    const h = apresLesBlocsSansTexte(ed2.state, -1) as number
    ed2.view.dispatch(ed2.state.tr.setSelection(TextSelection.create(ed2.state.doc, h)))
    expect(ed2.state.selection.$from.parent.type.name).toBe('depliant')
  })

  it('Droite en fin de bloc passe le séparateur au clavier', () => {
    const ed = ouvrir([p('un'), hr, p('deux')], 0)
    touche(ed, { key: 'ArrowRight' })
    expect(ici(ed)).toBe('deux')
  })

  it('Gauche en tête de bloc aussi', () => {
    const ed = ouvrir([p('un'), hr, p('deux')], 2, 0)
    touche(ed, { key: 'ArrowLeft' })
    expect(ici(ed)).toBe('un')
    expect(ed.state.selection.$from.parentOffset).toBe(2)
  })
})

describe('flèches : ⌘A en deux temps', () => {
  it('le premier appui choisit le texte du bloc, le second tout le texte de la page', () => {
    const ed = ouvrir([p('un'), p('deux'), p('trois')], 1, 1)
    const premier = toutSelectionner(ed.state)!
    expect(ed.state.doc.textBetween(premier.from, premier.to)).toBe('deux')
    ed.view.dispatch(ed.state.tr.setSelection(premier))
    const second = toutSelectionner(ed.state)!
    expect(ed.state.doc.textBetween(second.from, second.to, '|')).toBe('un|deux|trois')
    ed.view.dispatch(ed.state.tr.setSelection(second))
    // Un appui de plus ne change rien.
    expect(toutSelectionner(ed.state)!.eq(second)).toBe(true)
  })

  it('un bloc vide passe tout de suite à la page', () => {
    const ed = ouvrir([p('un'), p(''), p('trois')], 1)
    const s = toutSelectionner(ed.state)!
    expect(ed.state.doc.textBetween(s.from, s.to, '|')).toContain('un')
  })

  it('une sélection sur deux blocs choisit le texte des deux', () => {
    const ed = ouvrir([p('un'), p('deux'), p('trois')], 0, 1)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 2, 7)))
    expect(plageDesBlocs(ed.state)).toEqual([1, 9])
  })

  it('au clavier', () => {
    const ed = ouvrir([p('un'), p('deux')], 1, 1)
    touche(ed, { key: 'a', ctrlKey: true })
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe('deux')
    touche(ed, { key: 'a', ctrlKey: true })
    expect(ed.state.selection.from).toBe(1)
  })
})

describe('flèches : code en ligne et ligne logique', () => {
  it('Droite en fin de bloc après un code en ligne le ferme et écrit une espace', () => {
    const ed = ouvrir([{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'x', marks: [{ type: 'code' }] }] }])
    touche(ed, { key: 'ArrowRight' })
    const contenu = ed.getJSON().content?.[0]?.content as NoeudTexte[]
    expect(contenu.map((n) => `${n.text}:${(n.marks ?? []).map((m) => m.type).join('+')}`)).toEqual(['a:', 'x:code', ' :'])
    expect(ed.state.selection.$from.parentOffset).toBe(3)
  })

  it('la ligne logique s’arrête aux retours à la ligne forcés', () => {
    const ed = ouvrir([{ type: 'paragraph', content: [{ type: 'text', text: 'ab' }, { type: 'hardBreak' }, { type: 'text', text: 'cd' }, { type: 'hardBreak' }, { type: 'text', text: 'ef' }] }])
    const parent = ed.state.doc.child(0)
    expect(ligneLogique(parent, 0)).toEqual([0, 2])
    expect(ligneLogique(parent, 4)).toEqual([3, 5])
    expect(ligneLogique(parent, parent.content.size)).toEqual([6, parent.content.size])
  })
})
