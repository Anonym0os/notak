// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { guillemet } from './saisie'
import { EXTENSIONS_BLOCS } from './schema'
import { colorer, dupliquerBloc, inserer, supprimerBloc, transformer, versActuel } from './transformer'

definirLangue('fr')

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const p = (text: string): NoeudTexte => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })

/** Un éditeur du moteur, le curseur à la fin du premier bloc de texte. */
function ouvrir(...content: NoeudTexte[]): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: content.length ? content : [p('')] } })
  editeur.commands.setTextSelection(1)
  editeur.commands.selectTextblockEnd()
  return editeur
}

/** Tape comme au clavier : chaque caractère passe par les règles de saisie. */
function taper(ed: Editor, texte: string) {
  for (const c of texte) {
    const { from, to } = ed.state.selection
    const pris = ed.view.someProp('handleTextInput', (f) => f(ed.view, from, to, c, () => ed.state.tr.insertText(c, from, to)))
    if (!pris) ed.view.dispatch(ed.state.tr.insertText(c, from, to))
  }
}

const types = (ed: Editor) => (ed.getJSON().content ?? []).map((n) => n.type)
const texte = (ed: Editor) => ed.state.doc.textContent

describe('NOTION.md § 4 : les raccourcis markdown', () => {
  it('`#`, `##` et `###` font les trois titres', () => {
    for (const [signe, niveau] of [['#', 1], ['##', 2], ['###', 3]] as const) {
      const ed = ouvrir()
      taper(ed, `${signe} T`)
      expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: niveau } })
      ed.destroy()
    }
  })

  it('`> ` fait un dépliant, le curseur dans son résumé', () => {
    const ed = ouvrir()
    taper(ed, '> Plus')
    expect(types(ed)).toEqual(['deroulant'])
    expect(ed.state.selection.$from.parent.type.name).toBe('resumeDeroulant')
    expect(texte(ed)).toBe('Plus')
  })

  it('`" ` fait une citation', () => {
    const ed = ouvrir()
    taper(ed, '" cité')
    expect(types(ed)).toEqual(['blockquote'])
    expect(texte(ed)).toBe('cité')
  })

  it('`- `, `1. `, `a. ` et `[] ` font des listes', () => {
    for (const [signe, type] of [['- ', 'bulletList'], ['1. ', 'orderedList'], ['a. ', 'orderedList'], ['[] ', 'taskList']] as const) {
      const ed = ouvrir()
      taper(ed, `${signe}x`)
      expect(types(ed)).toEqual([type])
      ed.destroy()
    }
  })

  it('`*mot*` met en italique (et non en gras comme dans la note), `~mot~` barre', () => {
    const ed = ouvrir()
    taper(ed, 'un *mot* et ~ça~ ')
    const marques = ((ed.getJSON().content?.[0]?.content ?? []) as NoeudTexte[]).flatMap((n) => (n.marks ?? []).map((m) => `${n.text}:${m.type}`))
    expect(marques).toEqual(['mot:italic', 'ça:strike'])
  })
})

describe('NOTION.md § 4 : les remplacements typographiques', () => {
  it('flèches, comparaisons, tiret cadratin et points de suspension', () => {
    const ed = ouvrir()
    taper(ed, 'a -> b <- c <-> d => e >= f <= g != h -- i...')
    expect(texte(ed)).toBe('a → b ← c ↔ d ⇒ e ≥ f ≤ g ≠ h — i…')
  })

  it('les guillemets suivent la langue, l’apostrophe devient courbe', () => {
    const ed = ouvrir()
    taper(ed, 'il dit "oui" et l\'arbre')
    expect(texte(ed)).toBe('il dit « oui » et l’arbre')
    expect(guillemet('', false)).toBe('“')
    expect(guillemet('mot', false)).toBe('”')
  })

  it('en tête de bloc, le guillemet attend la suite, puis s’ouvre', () => {
    const ed = ouvrir()
    taper(ed, '"oui')
    expect(texte(ed)).toBe('« oui')
  })

  it('rien ne se remplace dans du code', () => {
    const ed = ouvrir({ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] })
    taper(ed, ' -> ...')
    expect(texte(ed)).toBe('x -> ...')
  })
})

describe('NOTION.md § 5 : Transformer en', () => {
  it('un paragraphe devient chaque type, et revient en texte', () => {
    for (const vers of ['titre2', 'puce', 'numero', 'tache', 'citation', 'encadre', 'code', 'deroulant', 'titreDeroulant1'] as const) {
      const ed = ouvrir(p('bonjour'))
      transformer(ed, vers)
      expect(versActuel(ed)).toBe(vers)
      expect(texte(ed)).toBe('bonjour')
      transformer(ed, 'texte')
      expect(versActuel(ed)).toBe('texte')
      expect(types(ed)).toEqual(['paragraph'])
      expect(texte(ed)).toBe('bonjour')
      ed.destroy()
    }
  })

  it('une puce devient une tâche sans rester dans la liste à puces', () => {
    const ed = ouvrir({ type: 'bulletList', content: [{ type: 'listItem', content: [p('a')] }] })
    transformer(ed, 'tache')
    expect(types(ed)).toEqual(['taskList'])
  })

  it('un titre rendu dépliant range dessous les blocs jusqu’au prochain titre de son rang', () => {
    const ed = ouvrir(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Partie' }] },
      p('un'),
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Sous' }] },
      p('deux'),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Suite' }] },
    )
    transformer(ed, 'titreDeroulant2')
    const [d, suite] = ed.getJSON().content ?? []
    expect(d).toMatchObject({ type: 'deroulant', attrs: { niveau: 2 } })
    expect(d!.content!.map((n) => n.type)).toEqual(['resumeDeroulant', 'paragraph', 'heading', 'paragraph'])
    expect(suite).toMatchObject({ type: 'heading', attrs: { level: 2 } })
  })

  it('un dépliant défait rend ses blocs au flux', () => {
    const ed = ouvrir({ type: 'deroulant', content: [{ type: 'resumeDeroulant', content: [{ type: 'text', text: 'R' }] }, p('dedans')] })
    transformer(ed, 'titre1')
    expect(types(ed)).toEqual(['heading', 'paragraph'])
    expect(texte(ed)).toBe('Rdedans')
  })

  it('⌘⌥ et un chiffre transforment, lus sur la touche', () => {
    const ed = ouvrir(p('x'))
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: '¡', code: 'Digit1', metaKey: true, altKey: true, bubbles: true }))
    expect(versActuel(ed)).toBe('titre1')
  })
})

describe('les gestes du menu', () => {
  it('insère un séparateur sous le bloc, le curseur après lui', () => {
    const ed = ouvrir(p('a'))
    inserer(ed, 'separateur')
    expect(types(ed)).toEqual(['paragraph', 'horizontalRule', 'paragraph'])
    expect(ed.state.selection.$from.index(0)).toBe(2)
  })

  it('remplace le bloc vide par des colonnes, le curseur dans la première', () => {
    const ed = ouvrir()
    inserer(ed, 'colonnes3')
    expect(ed.getJSON().content?.[0]).toMatchObject({ type: 'colonnes' })
    expect(ed.getJSON().content?.[0]?.content).toHaveLength(3)
    expect(ed.state.selection.$from.node(2).type.name).toBe('colonne')
  })

  it('duplique le bloc juste après lui, la copie avec son propre id', () => {
    const ed = ouvrir(p('a'), p('b'))
    dupliquerBloc(ed)
    expect(texte(ed)).toBe('aab')
    const [x, y] = ed.getJSON().content ?? []
    expect(x!.attrs?.id).toBeTruthy()
    expect(y!.attrs?.id).toBeTruthy()
    expect(y!.attrs?.id).not.toBe(x!.attrs?.id)
  })

  it('supprime le bloc ; le seul élément d’une liste emporte sa liste', () => {
    const ed = ouvrir({ type: 'bulletList', content: [{ type: 'listItem', content: [p('a')] }] }, p('b'))
    supprimerBloc(ed)
    expect(types(ed)).toEqual(['paragraph'])
    expect(texte(ed)).toBe('b')
  })

  it('colore le bloc sans passage choisi, le passage sinon', () => {
    const ed = ouvrir(p('abc'))
    colorer(ed, { nom: 'rouge', fond: true })
    expect(ed.getJSON().content?.[0]?.attrs?.couleur).toBe('rouge-fond')
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 3)))
    colorer(ed, { nom: 'bleu', fond: false })
    expect(ed.getJSON().content?.[0]?.content?.[0]?.marks?.[0]).toMatchObject({ type: 'textStyle', attrs: { color: 'var(--notak-bloc-bleu)' } })
  })
})
