import { Node as NoeudPM } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import { describe, expect, it } from 'vitest'
import { Doc } from 'yjs'
import type { NoeudTexte } from '../coeur/tableau'
import { idsManquants, poserIds } from './ids'
import { lisible } from './lisible'
import { aplatir } from './migration'
import { blocsDe } from './modele'
import { SCHEMA_BLOCS } from './schema'

const p = (text: string, attrs?: Record<string, unknown>): NoeudTexte => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: text ? [{ type: 'text', text }] : [] })
const doc = (...content: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content })
const lire = (texte: NoeudTexte) => NoeudPM.fromJSON(SCHEMA_BLOCS, texte)

const t = (type: string, text: string, attrs?: Record<string, unknown>): NoeudTexte => ({ type, ...(attrs ? { attrs } : {}), content: [{ type: 'text', text }] })

/** Un document qui porte tous les blocs du moteur, à plat : les enfants sont rangés par leur retrait. */
const TOUT = doc(
  t('heading', 'Petit titre', { level: 3, id: 't3' }),
  t('puce', 'un', { id: 'l1' }),
  t('puce', 'deux', { id: 'l2', retrait: 1 }),
  t('numero', 'premier', { id: 'n1' }),
  t('tache', 'fait', { id: 'c1', coche: true }),
  t('heading', 'Plus', { id: 'd1', level: 2, depliant: true, ouvert: false }),
  p('caché', { id: 'p1', retrait: 1 }),
  t('citation', 'cité', { id: 'q' }),
  t('encadreBloc', 'idée', { id: 'e', icone: '💡' }),
  t('depliant', 'Dépliant', { id: 'dp' }),
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

  it('lit le texte d’une note une fois aplati', () => {
    const note = doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'T' }] }, { type: 'blockquote', content: [p('cité')] }, { type: 'encadre', attrs: { icone: '💡' }, content: [p('idée')] })
    expect(lisible(note, SCHEMA_BLOCS)).toBe(false)
    expect(lisible(aplatir(note), SCHEMA_BLOCS)).toBe(true)
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
    const state = EditorState.create({ doc: lire(doc(p('a'), t('puce', 'b'), { type: 'colonnes', content: [{ type: 'colonne', content: [p('c')] }, { type: 'colonne', content: [p('d')] }] })) })
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
      'q:citation',
      'e:encadre',
      'dp:deroulant',
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

  it('le parent d’un bloc est le bloc moins en retrait au-dessus de lui ; il emporte ses enfants', () => {
    expect(de('l1')).toMatchObject({ texte: 'un', enfants: ['l2'], profondeur: 0 })
    expect(de('l2')).toMatchObject({ texte: 'deux', parent: 'l1', profondeur: 1 })
    expect(de('l1').fin).toBe(de('n1').pos)
    expect(de('d1')).toMatchObject({ texte: 'Plus', enfants: ['p1'], format: { ouvert: false, depliant: true, level: 2 } })
  })

  it('les colonnes portent leurs blocs et leur part', () => {
    expect(de('k').enfants).toEqual(['k1', 'k2'])
    expect(de('k1')).toMatchObject({ enfants: ['g'], format: { ratio: 2 } })
    expect(de('g')).toMatchObject({ parent: 'k1', profondeur: 2 })
  })

  it('la couleur et le reste vont dans le format', () => {
    expect(de('r').format).toEqual({ couleur: 'rouge-fond' })
    expect(de('c1').format).toMatchObject({ coche: true })
    expect(de('co')).toMatchObject({ texte: 'let x = 1', format: { language: 'ts' } })
  })

  it('la position désigne le nœud du bloc', () => {
    const d = lire(TOUT)
    for (const b of blocs) expect(d.nodeAt(b.pos)?.attrs.id).toBe(b.id)
  })
})
