// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { avecColonne, enColonnes, partager, parts, ratiosDe, regler } from './colonnes'
import { supprimer } from './gestes'
import { EXTENSIONS_BLOCS } from './schema'

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})

const p = (text: string, id: string): NoeudTexte => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] })
const col = (...content: NoeudTexte[]): NoeudTexte => ({ type: 'colonne', content })
const ouvrir = (...content: NoeudTexte[]) => (editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content } }))
/** Le document en raccourci : un texte, ou ses colonnes entre crochets. */
const forme = (ed: Editor): unknown[] =>
  ((ed.getJSON() as NoeudTexte).content ?? []).map((n) =>
    n.type === 'colonnes' ? (n.content ?? []).map((c) => (c.content ?? []).map((b) => b.content?.[0]?.text ?? b.type)) : (n.content?.[0]?.text ?? n.type),
  )

describe('NOTION.md § 8 : les colonnes', () => {
  it('lâcher sur le côté d’un bloc crée une rangée de deux colonnes', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'), p('c', 'C'))
    ed.view.dispatch(enColonnes(ed.state, ['C'], 'A', 'droite')!)
    expect(forme(ed)).toEqual([[['a'], ['c']], 'b'])
  })

  it('à gauche, la colonne neuve vient en premier', () => {
    const ed = ouvrir(p('a', 'A'), p('b', 'B'))
    ed.view.dispatch(enColonnes(ed.state, ['B'], 'A', 'gauche')!)
    expect(forme(ed)).toEqual([[['b'], ['a']]])
  })

  it('à côté d’un bloc d’une colonne, une colonne s’ajoute, de part 1/n, les autres gardant leurs proportions', () => {
    const ed = ouvrir({ type: 'colonnes', content: [{ ...col(p('a', 'A')), attrs: { ratio: 1.5 } }, { ...col(p('b', 'B')), attrs: { ratio: 0.5 } }] }, p('c', 'C'))
    ed.view.dispatch(enColonnes(ed.state, ['C'], 'B', 'droite')!)
    expect(forme(ed)).toEqual([[['a'], ['b'], ['c']]])
    const ratios = (ed.getJSON() as NoeudTexte).content![0]!.content!.map((c) => c.attrs?.ratio)
    expect(ratios).toEqual([1.5, 0.5, null])
  })

  it('une colonne ajoutée à gauche prend la première place, sans limite de nombre', () => {
    const ed = ouvrir({ type: 'colonnes', content: ['1', '2', '3', '4', '5'].map((x) => col(p(x, x))) }, p('c', 'C'))
    ed.view.dispatch(enColonnes(ed.state, ['C'], '1', 'gauche')!)
    expect(forme(ed)).toEqual([[['c'], ['1'], ['2'], ['3'], ['4'], ['5']]])
    expect((ed.getJSON() as NoeudTexte).content![0]!.content!.map((c) => c.attrs?.ratio)).toEqual([null, null, null, null, null, null])
  })

  it('une colonne vidée disparaît ; une rangée réduite à une colonne se dissout dans le flux', () => {
    const ed = ouvrir({ type: 'colonnes', content: [col(p('a', 'A'), p('a2', 'A2')), col(p('b', 'B'))] }, p('c', 'C'))
    ed.view.dispatch(supprimer(ed.state, ['B'])!)
    expect(forme(ed)).toEqual(['a', 'a2', 'c'])
  })

  it('un bloc posé dans une colonne emporte ses enfants, ramenés au premier rang', () => {
    const ed = ouvrir(p('a', 'A'), { type: 'puce', attrs: { id: 'L', retrait: 1 }, content: [{ type: 'text', text: 'x' }] }, { type: 'puce', attrs: { id: 'L1', retrait: 2 }, content: [{ type: 'text', text: 'y' }] })
    ed.view.dispatch(enColonnes(ed.state, ['L'], 'A', 'droite')!)
    const droite = (ed.getJSON() as NoeudTexte).content![0]!.content![1]!.content!
    expect(droite.map((n) => [n.type, n.attrs?.retrait ?? 0])).toEqual([['puce', 0], ['puce', 1]])
  })

  it('régler les largeurs écrit les parts des colonnes', () => {
    const ed = ouvrir({ type: 'colonnes', content: [col(p('a', 'A')), col(p('b', 'B'))] })
    ed.view.dispatch(regler(ed.state, 0, [1.5, 0.5])!)
    expect((ed.getJSON() as NoeudTexte).content![0]!.content!.map((c) => c.attrs?.ratio)).toEqual([1.5, 0.5])
  })
})

describe('NOTION.md § 8 : l’ajout d’une colonne', () => {
  it('la neuve prend 1/n, les autres sont multipliées par 1 − 1/n et la somme reste 1', () => {
    const f = avecColonne([0.75, 0.25], 2)
    expect(f[2]).toBeCloseTo(1 / 3)
    expect(f[0]).toBeCloseTo(0.5)
    expect(f[1]).toBeCloseTo(1 / 6)
    expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('à gauche, la neuve vient en tête', () => {
    expect(avecColonne([0.5, 0.5], 0)[0]).toBeCloseTo(1 / 3)
  })
})

describe('NOTION.md § 8 : les largeurs aimantées', () => {
  it('des parts absentes sont égales', () => {
    expect(parts([null, null])).toEqual([0.5, 0.5])
    expect(parts([2, null])).toEqual([2 / 3, 1 / 3])
  })

  it('la frontière s’aimante par pas de 1/(8·n), seule la paire change', () => {
    const f = partager([1 / 3, 1 / 3, 1 / 3], 0, 0.05)
    const pas = 1 / 24
    expect(Math.round((f[0]! / pas) * 1000) / 1000 % 1).toBe(0)
    expect(f[2]).toBeCloseTo(1 / 3)
    expect(f[0]! + f[1]!).toBeCloseTo(2 / 3)
  })

  it('chaque colonne garde au moins un pas', () => {
    const f = partager([0.5, 0.5], 0, 0.9)
    expect(f[1]).toBeCloseTo(1 / 16)
    expect(partager([0.5, 0.5], 0, -0.9)[0]).toBeCloseTo(1 / 16)
  })

  it('une part égale s’écrit sans ratio', () => {
    expect(ratiosDe([0.5, 0.5])).toEqual([null, null])
    expect(ratiosDe([0.75, 0.25])).toEqual([1.5, 0.5])
  })
})
