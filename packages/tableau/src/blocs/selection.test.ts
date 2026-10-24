// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { EXTENSIONS_BLOCS } from './schema'
import { CLE_CHOIX, type Choix, basculerBloc, blocsChoisis, choisir, choixDeLaPoignee, deplacerChoix, gaucheDroite, idsDuChoix, toutChoisir } from './selection'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const b = (type: string, text: string, id: string, plus: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs: { id, ...plus }, ...(text ? { content: [{ type: 'text', text }] } : {}) })
const p = (text: string, id: string, plus: Record<string, unknown> = {}) => b('paragraph', text, id, plus)

/** Un éditeur sur ces blocs, le curseur au début du premier. */
function ouvrir(...content: NoeudTexte[]): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content } })
  return editeur
}

/** Joue une touche dans l’éditeur, comme le navigateur : rend vrai si une extension l’a prise. */
function jouer(ed: Editor, key: string, mods: { meta?: boolean; shift?: boolean; alt?: boolean } = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, metaKey: !!mods.meta, shiftKey: !!mods.shift, altKey: !!mods.alt, bubbles: true, cancelable: true })
  return !!ed.view.someProp('handleKeyDown', (f) => f(ed.view, e))
}

const choix = (ed: Editor) => CLE_CHOIX.getState(ed.state) ?? null
const choisis = (ed: Editor) => blocsChoisis(ed.state)
const selectionner = (ed: Editor, c: Choix) => ed.view.dispatch(choisir(ed.state, c))
const textes = (ed: Editor) => ((ed.getJSON() as NoeudTexte).content ?? []).map((n) => n.content?.[0]?.text ?? n.type)
const curseurDans = (ed: Editor, i: number, ou: 'debut' | 'fin' = 'debut') => {
  let pos = 0
  for (let k = 0; k < i; k++) pos += ed.state.doc.child(k).nodeSize
  const n = ed.state.doc.child(i)
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos + 1 + (ou === 'fin' ? n.content.size : 0))))
}

/** A, son enfant A1, puis B et C. */
const arbre = () => ouvrir(b('puce', 'a', 'A'), b('puce', 'a1', 'A1', { retrait: 1 }), p('b', 'B'), p('c', 'C'))

describe('NOTION.md § 7 : entrer et sortir de la sélection de blocs', () => {
  it('Échap choisit les blocs que la sélection de texte touche, Échap de nouveau désélectionne', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 5)))
    expect(jouer(ed, 'Escape')).toBe(true)
    expect(choisis(ed)).toEqual(['A', 'B'])
    expect(jouer(ed, 'Escape')).toBe(true)
    expect(choix(ed)).toBeNull()
  })

  it('une lettre tapée n’écrase rien', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'))
    selectionner(ed, { ancre: 'A', tete: 'A' })
    expect(jouer(ed, 'x')).toBe(true)
    expect(textes(ed)).toEqual(['a', 'b'])
    expect(choisis(ed)).toEqual(['A'])
  })

  it('Entrée reprend la saisie à la fin du premier bloc choisi', () => {
    const ed = ouvrir(p('ab', 'A'), p('cd', 'B'))
    selectionner(ed, { ancre: 'A', tete: 'B' })
    jouer(ed, 'Enter')
    expect(choix(ed)).toBeNull()
    expect(ed.state.selection.empty).toBe(true)
    expect(ed.state.selection.$from.parent.textContent).toBe('ab')
    expect(ed.state.selection.$from.parentOffset).toBe(2)
  })

  it('⌘Entrée coche les tâches choisies et ouvre ou ferme les dépliants', () => {
    const ed = ouvrir(b('tache', 't', 'T'), b('tache', 'u', 'U', { coche: true }), b('depliant', 'd', 'D'))
    selectionner(ed, { ancre: 'T', tete: 'D' })
    jouer(ed, 'Enter', { meta: true })
    const [t, u, d] = (ed.getJSON() as NoeudTexte).content!
    expect([t!.attrs!.coche, u!.attrs!.coche, d!.attrs!.ouvert]).toEqual([true, true, false])
  })

  it('Retour arrière supprime les blocs et leurs enfants', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'A', tete: 'A' })
    jouer(ed, 'Backspace')
    expect(textes(ed)).toEqual(['b', 'c'])
    expect(choix(ed)).toBeNull()
  })
})

describe('NOTION.md § 7 : les flèches dans l’arbre des blocs', () => {
  it('↓ descend dans l’ordre qu’on voit : l’enfant d’abord ; ↑ remonte', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'A', tete: 'A' })
    jouer(ed, 'ArrowDown')
    expect(choisis(ed)).toEqual(['A1'])
    jouer(ed, 'ArrowDown')
    expect(choisis(ed)).toEqual(['B'])
    jouer(ed, 'ArrowUp')
    expect(choisis(ed)).toEqual(['A1'])
  })

  it('Alt+↓ saute les enfants ; Alt+↑ monte au frère, ou au parent', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'A', tete: 'A' })
    jouer(ed, 'ArrowDown', { alt: true })
    expect(choisis(ed)).toEqual(['B'])
    jouer(ed, 'ArrowUp', { alt: true })
    expect(choisis(ed)).toEqual(['A'])
    selectionner(ed, { ancre: 'A1', tete: 'A1' })
    jouer(ed, 'ArrowUp', { alt: true })
    expect(choisis(ed)).toEqual(['A'])
  })

  it('sans Maj, ↓ part du bas de la sélection et ↑ du haut', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'B', tete: 'A' })
    jouer(ed, 'ArrowDown')
    // La sélection va de A à B, enfants compris : ce qui suit B est C.
    expect(choisis(ed)).toEqual(['C'])
    selectionner(ed, { ancre: 'B', tete: 'C' })
    jouer(ed, 'ArrowUp')
    // Le bloc d’avant le premier choisi : l’enfant de A, qu’on voit au-dessus de B.
    expect(choisis(ed)).toEqual(['A1'])
  })

  it('Maj+↓ étend d’un frère en sautant les enfants ; Maj+↑ rétrécit', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'A', tete: 'A' })
    jouer(ed, 'ArrowDown', { shift: true })
    expect(choix(ed)).toMatchObject({ ancre: 'A', tete: 'B' })
    jouer(ed, 'ArrowDown', { shift: true })
    expect(choix(ed)).toMatchObject({ ancre: 'A', tete: 'C' })
    jouer(ed, 'ArrowUp', { shift: true })
    expect(choix(ed)).toMatchObject({ ancre: 'A', tete: 'B' })
  })

  it('Maj+↑ sans frère au-dessus prend le parent à la place des enfants', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'A1', tete: 'A1' })
    jouer(ed, 'ArrowUp', { shift: true })
    expect(choix(ed)).toMatchObject({ ancre: 'A', tete: 'A' })
  })

  it('Maj+↑ au-dessus de l’ancre étend vers le haut, et la sélection de l’éditeur suit ce sens', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    selectionner(ed, { ancre: 'C', tete: 'C' })
    jouer(ed, 'ArrowUp', { shift: true })
    expect(choisis(ed)).toEqual(['B', 'C'])
    expect(ed.state.selection.head).toBeLessThan(ed.state.selection.anchor)
  })

  it('⌘↑ et ⌘↓ vont au premier et au dernier bloc de la page', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'B', tete: 'B' })
    jouer(ed, 'ArrowUp', { meta: true })
    expect(choisis(ed)).toEqual(['A'])
    jouer(ed, 'ArrowDown', { meta: true })
    expect(choisis(ed)).toEqual(['C'])
  })

  it('← ferme un dépliant ouvert, puis choisit son parent ; → ouvre un dépliant fermé, puis choisit le premier enfant', () => {
    const ed = ouvrir(b('depliant', 'd', 'D'), p('e', 'E', { retrait: 1 }), p('f', 'F'))
    selectionner(ed, { ancre: 'D', tete: 'D' })
    jouer(ed, 'ArrowLeft')
    expect((ed.getJSON() as NoeudTexte).content![0]!.attrs!.ouvert).toBe(false)
    expect(choisis(ed)).toEqual(['D'])
    jouer(ed, 'ArrowRight')
    expect((ed.getJSON() as NoeudTexte).content![0]!.attrs!.ouvert).toBe(true)
    jouer(ed, 'ArrowRight')
    expect(choisis(ed)).toEqual(['E'])
    jouer(ed, 'ArrowLeft')
    expect(choisis(ed)).toEqual(['D'])
  })

  it('deplacerChoix et gaucheDroite rendent null quand rien ne bouge', () => {
    const ed = ouvrir(p('a', 'A'))
    expect(deplacerChoix(ed.state.doc, { ancre: 'A', tete: 'A' }, { sens: 1, maj: false, alt: false, mod: false })).toBeNull()
    expect(deplacerChoix(ed.state.doc, { ancre: 'A', tete: 'A' }, { sens: -1, maj: true, alt: false, mod: false })).toBeNull()
    expect(gaucheDroite(ed.state.doc, { ancre: 'A', tete: 'A' }, -1)).toBeNull()
    expect(gaucheDroite(ed.state.doc, { ancre: 'A', tete: 'A' }, 1)).toBeNull()
  })
})

describe('NOTION.md § 7 : les gestes sur la sélection', () => {
  it('⌘D duplique le groupe après le dernier bloc, et choisit les copies', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    selectionner(ed, { ancre: 'A', tete: 'B' })
    jouer(ed, 'd', { meta: true })
    expect(textes(ed)).toEqual(['a', 'b', 'a', 'b', 'c'])
    const ids = choisis(ed)
    expect(ids).toHaveLength(2)
    expect(ids).not.toContain('A')
    expect(ed.state.selection.from).toBeGreaterThanOrEqual(ed.state.doc.child(0).nodeSize + ed.state.doc.child(1).nodeSize)
  })

  it('⌘D tapé dans le texte duplique le bloc du curseur et choisit la copie', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'))
    curseurDans(ed, 0, 'fin')
    jouer(ed, 'd', { meta: true })
    expect(textes(ed)).toEqual(['a', 'a', 'b'])
    expect(choisis(ed)).toHaveLength(1)
    expect(choisis(ed)[0]).not.toBe('A')
  })

  it('⌘D refuse des blocs de parents différents', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'A1', tete: 'B' })
    jouer(ed, 'd', { meta: true })
    expect(textes(ed)).toEqual(['a', 'a1', 'b', 'c'])
  })

  it('Tab et Maj+Tab imbriquent toute la sélection et la gardent', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    selectionner(ed, { ancre: 'B', tete: 'C' })
    jouer(ed, 'Tab')
    expect(((ed.getJSON() as NoeudTexte).content ?? []).map((n) => n.attrs?.retrait ?? 0)).toEqual([0, 1, 1])
    expect(choisis(ed)).toEqual(['B', 'C'])
    jouer(ed, 'Tab', { shift: true })
    expect(((ed.getJSON() as NoeudTexte).content ?? []).map((n) => n.attrs?.retrait ?? 0)).toEqual([0, 0, 0])
    expect(choisis(ed)).toEqual(['B', 'C'])
  })

  it('⌘⇧↓ descend les blocs et garde la sélection', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    selectionner(ed, { ancre: 'A', tete: 'A' })
    jouer(ed, 'ArrowDown', { meta: true, shift: true })
    expect(textes(ed)).toEqual(['b', 'a', 'c'])
    expect(choisis(ed)).toEqual(['A'])
  })

  it('⌘A en sélection de blocs choisit tous les blocs', () => {
    const ed = arbre()
    selectionner(ed, { ancre: 'B', tete: 'B' })
    expect(jouer(ed, 'a', { meta: true })).toBe(true)
    expect(choix(ed)).toMatchObject({ ancre: 'A', tete: 'C' })
    expect(toutChoisir(ed.state.doc)).toMatchObject({ ancre: 'A', tete: 'C' })
  })
})

describe('NOTION.md § 7 : ⌘A et le débordement dans le texte', () => {
  it('⌘A : le texte du bloc, puis celui de la page, puis tous les blocs', () => {
    const ed = ouvrir(p('abc', 'A'), p('def', 'B'))
    curseurDans(ed, 0)
    jouer(ed, 'a', { meta: true })
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe('abc')
    expect(choix(ed)).toBeNull()
    jouer(ed, 'a', { meta: true })
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, '|')).toBe('abc|def')
    expect(choix(ed)).toBeNull()
    jouer(ed, 'a', { meta: true })
    expect(choisis(ed)).toEqual(['A', 'B'])
  })

  it('⌘A dans un bloc vide passe au texte de la page', () => {
    const ed = ouvrir(p('abc', 'A'), p('', 'B'))
    curseurDans(ed, 1)
    jouer(ed, 'a', { meta: true })
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe('abc')
  })

  it('Maj+→ au bout du bloc passe à la sélection de blocs : ce bloc et le suivant', () => {
    const ed = ouvrir(p('ab', 'A'), p('cd', 'B'))
    curseurDans(ed, 0, 'fin')
    expect(jouer(ed, 'ArrowRight', { shift: true })).toBe(true)
    expect(choix(ed)).toMatchObject({ ancre: 'A', tete: 'B' })
  })

  it('Maj+→ au milieu du bloc reste une sélection de texte', () => {
    const ed = ouvrir(p('ab', 'A'), p('cd', 'B'))
    curseurDans(ed, 0)
    expect(jouer(ed, 'ArrowRight', { shift: true })).toBe(false)
    expect(choix(ed)).toBeNull()
  })

  it('Maj+← en tête du premier bloc ne change rien', () => {
    const ed = ouvrir(p('ab', 'A'), p('cd', 'B'))
    curseurDans(ed, 0)
    expect(jouer(ed, 'ArrowLeft', { shift: true })).toBe(false)
  })
})

describe('NOTION.md § 7 : Maj+clic et ⌘+clic', () => {
  const appuyer = (ed: Editor, id: string, mods: { shift?: boolean; meta?: boolean }) => {
    const el = ed.view.dom.querySelector(`[data-bloc="${id}"]`)!
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, shiftKey: !!mods.shift, metaKey: !!mods.meta })
    Object.defineProperty(e, 'target', { value: el })
    // Le gestionnaire de l'extension seul : le navigateur, lui, a besoin d'une mise en page que jsdom n'a pas.
    ed.view.someProp('handleDOMEvents', (h) => h.mousedown?.(ed.view, e))
    return e.defaultPrevented
  }

  it('Maj+clic dans un autre bloc étend de celui du curseur jusque-là, en comblant l’intervalle', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    curseurDans(ed, 0)
    expect(appuyer(ed, 'C', { shift: true })).toBe(true)
    expect(choisis(ed)).toEqual(['A', 'B', 'C'])
  })

  it('Maj+clic dans le même bloc laisse le navigateur étendre le texte', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'))
    curseurDans(ed, 0)
    expect(appuyer(ed, 'A', { shift: true })).toBe(false)
    expect(choix(ed)).toBeNull()
  })

  it('Maj+clic en sélection de blocs étend depuis le premier bloc choisi', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    selectionner(ed, { ancre: 'B', tete: 'B' })
    appuyer(ed, 'C', { shift: true })
    expect(choisis(ed)).toEqual(['B', 'C'])
    appuyer(ed, 'A', { shift: true })
    expect(choisis(ed)).toEqual(['A', 'B'])
  })

  it('Maj+⌘+clic ajoute un bloc, ou le retire', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    selectionner(ed, { ancre: 'A', tete: 'A' })
    appuyer(ed, 'C', { shift: true, meta: true })
    expect(choisis(ed)).toEqual(['A', 'C'])
    appuyer(ed, 'A', { shift: true, meta: true })
    expect(choisis(ed)).toEqual(['C'])
    appuyer(ed, 'C', { meta: true })
    expect(choix(ed)).toBeNull()
  })
})

describe('NOTION.md § 7 : les blocs séparés', () => {
  it('basculerBloc ajoute, retire, et rend null quand il ne reste rien', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    const un = basculerBloc(ed.state.doc, { ancre: 'A', tete: 'A' }, null, 'C')
    expect(un).toMatchObject({ ids: ['A', 'C'], tete: 'C' })
    expect(idsDuChoix(ed.state.doc, un)).toEqual(['A', 'C'])
    expect(basculerBloc(ed.state.doc, un, null, 'A')).toMatchObject({ ids: ['C'] })
    expect(basculerBloc(ed.state.doc, { ancre: 'A', tete: 'A' }, null, 'A')).toBeNull()
    expect(basculerBloc(ed.state.doc, null, 'B', 'C')).toMatchObject({ ids: ['B', 'C'] })
  })

  it('la poignée garde la sélection quand le bloc en fait partie, étend avec Maj, bascule avec Maj+⌘', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    const deux = { ancre: 'A', tete: 'B' }
    expect(choixDeLaPoignee(ed.state.doc, deux, 'B', false, false)).toBe(deux)
    expect(choixDeLaPoignee(ed.state.doc, deux, 'C', false, false)).toEqual({ ancre: 'C', tete: 'C' })
    expect(choixDeLaPoignee(ed.state.doc, deux, 'C', true, false)).toEqual({ ancre: 'A', tete: 'C' })
    expect(choixDeLaPoignee(ed.state.doc, deux, 'C', true, true)).toMatchObject({ ids: ['A', 'B', 'C'] })
    expect(choixDeLaPoignee(ed.state.doc, null, 'B', false, false)).toEqual({ ancre: 'B', tete: 'B' })
  })
})
