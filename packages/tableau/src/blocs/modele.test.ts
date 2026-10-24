import { Node as NoeudPM } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import { describe, expect, it } from 'vitest'
import { Doc } from 'yjs'
import type { NoeudTexte } from '../coeur/tableau'
import { idsManquants, poserIds } from './ids'
import { lisible } from './lisible'
import { blocsDe } from './modele'
import { SCHEMA_BLOCS } from './schema'

const p = (text: string, attrs?: Record<string, unknown>): NoeudTexte => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: text ? [{ type: 'text', text }] : [] })
const doc = (...content: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content })
const lire = (texte: NoeudTexte) => NoeudPM.fromJSON(SCHEMA_BLOCS, texte)

/** Un document qui porte tous les blocs du moteur. */
const TOUT = doc(
  { type: 'heading', attrs: { level: 3, id: 't3' }, content: [{ type: 'text', text: 'Petit titre' }] },
  { type: 'bulletList', content: [{ type: 'listItem', attrs: { id: 'l1' }, content: [p('un'), { type: 'bulletList', content: [{ type: 'listItem', attrs: { id: 'l2' }, content: [p('deux')] }] }] }] },
  { type: 'orderedList', content: [{ type: 'listItem', attrs: { id: 'n1' }, content: [p('premier')] }] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { id: 'c1', checked: true }, content: [p('fait')] }] },
  { type: 'deroulant', attrs: { id: 'd1', niveau: 2, ouvert: false }, content: [{ type: 'resumeDeroulant', content: [{ type: 'text', text: 'Plus' }] }, p('caché', { id: 'p1' })] },
  { type: 'colonnes', attrs: { id: 'k' }, content: [{ type: 'colonne', attrs: { id: 'k1', ratio: 2 }, content: [p('gauche', { id: 'g' })] }, { type: 'colonne', attrs: { id: 'k2' }, content: [p('droite', { id: 'dr' })] }] },
  { type: 'image', attrs: { id: 'i', fichier: 'F1', largeur: 0.5, legende: 'Vue' } },
  { type: 'apercuLien', attrs: { id: 'a', url: 'https://exemple.fr', titre: 'Exemple' } },
  { type: 'codeBlock', attrs: { id: 'co', language: 'ts' }, content: [{ type: 'text', text: 'let x = 1' }] },
  { type: 'horizontalRule', attrs: { id: 'hr' } },
  p('rouge', { id: 'r', couleur: 'rouge-fond' }),
)

describe('le schéma du moteur (NOTION.md § 2)', () => {
  it('lit tous ses blocs', () => {
    expect(lisible(TOUT, SCHEMA_BLOCS)).toBe(true)
  })

  it('lit le texte d’une note tel quel', () => {
    const note = doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'T' }] }, { type: 'blockquote', content: [p('cité')] }, { type: 'encadre', attrs: { icone: '💡' }, content: [p('idée')] })
    expect(lisible(note, SCHEMA_BLOCS)).toBe(true)
  })

  it('chaque bloc traverse le fragment Yjs', () => {
    const fragment = new Doc().getXmlFragment('texte')
    prosemirrorToYXmlFragment(lire(TOUT), fragment)
    expect(yXmlFragmentToProseMirrorRootNode(fragment, SCHEMA_BLOCS).toJSON()).toEqual(lire(TOUT).toJSON())
  })
})

describe('les ids de blocs (NOTION.md § 1)', () => {
  it('un bloc sans id en reçoit un, un id déjà vu plus haut est remplacé', () => {
    const texte = lire(doc(p('a', { id: 'x' }), p('b'), p('c', { id: 'x' })))
    let n = 0
    expect(idsManquants(texte, () => `n${++n}`)).toEqual([
      [3, 'n1'],
      [6, 'n2'],
    ])
  })

  it('après la pose, tous les blocs ont un id distinct, et la pose ne s’annule pas', () => {
    const state = EditorState.create({ doc: lire(doc(p('a'), { type: 'bulletList', content: [{ type: 'listItem', content: [p('b')] }] })) })
    const tr = poserIds(state)!
    expect(tr.getMeta('addToHistory')).toBe(false)
    const ids = blocsDe(tr.doc).map((b) => b.id)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(poserIds(state.apply(tr))).toBeNull()
  })
})

describe('le document relu comme des blocs', () => {
  const blocs = blocsDe(lire(TOUT))
  const de = (id: string) => blocs.find((b) => b.id === id)!

  it('dans l’ordre de lecture, avec les types de Notion', () => {
    expect(blocs.map((b) => `${b.id}:${b.type}`)).toEqual([
      't3:titre3',
      'l1:puce',
      'l2:puce',
      'n1:numero',
      'c1:tache',
      'd1:titreDeroulant2',
      'p1:texte',
      'k:colonnes',
      'k1:colonne',
      'g:texte',
      'k2:colonne',
      'dr:texte',
      'i:image',
      'a:apercuLien',
      'co:code',
      'hr:separateur',
      'r:texte',
    ])
  })

  it('le premier paragraphe d’un élément de liste ou d’un dépliant est son texte', () => {
    expect(de('l1')).toMatchObject({ texte: 'un', enfants: ['l2'], profondeur: 0 })
    expect(de('l2')).toMatchObject({ texte: 'deux', parent: 'l1', profondeur: 1 })
    expect(de('d1')).toMatchObject({ texte: 'Plus', enfants: ['p1'], format: { ouvert: false, niveau: 2 } })
  })

  it('les colonnes portent leurs blocs et leur part', () => {
    expect(de('k').enfants).toEqual(['k1', 'k2'])
    expect(de('k1')).toMatchObject({ enfants: ['g'], format: { ratio: 2 } })
    expect(de('g')).toMatchObject({ parent: 'k1', profondeur: 2 })
  })

  it('la couleur et le reste vont dans le format', () => {
    expect(de('r').format).toEqual({ couleur: 'rouge-fond' })
    expect(de('c1').format).toMatchObject({ checked: true })
    expect(de('co')).toMatchObject({ texte: 'let x = 1', format: { language: 'ts' } })
  })

  it('la position désigne le nœud du bloc', () => {
    const d = lire(TOUT)
    for (const b of blocs) expect(d.nodeAt(b.pos)?.attrs.id).toBe(b.id)
  })
})
