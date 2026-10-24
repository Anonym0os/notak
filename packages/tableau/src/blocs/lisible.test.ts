import { getSchema } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { EXTENSIONS_NOTE } from '../elements/note/extensions'
import { degrader, lisible } from './lisible'

const SCHEMA = getSchema(EXTENSIONS_NOTE)

const p = (text: string, marks?: NoeudTexte['marks']): NoeudTexte => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] })
const doc = (...content: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content })

describe('NOTION.md § 1 : un texte d’une version plus récente', () => {
  it('un texte de la note se lit', () => {
    const texte = doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Titre' }] }, p('gras', [{ type: 'bold' }]))
    expect(lisible(texte, SCHEMA)).toBe(true)
    expect(degrader(texte, SCHEMA)).toBe(texte)
  })

  it('un bloc inconnu ne se lit pas, et se réduit à ses blocs connus', () => {
    const texte = doc(p('avant'), { type: 'blocDuFutur', content: [p('dedans'), p('aussi')] }, p('après'))
    expect(lisible(texte, SCHEMA)).toBe(false)
    expect(degrader(texte, SCHEMA)).toEqual(doc(p('avant'), p('dedans'), p('aussi'), p('après')))
  })

  it('un bloc inconnu fait de texte devient un paragraphe', () => {
    const texte = doc({ type: 'resumeDuFutur', content: [{ type: 'text', text: 'le résumé' }] })
    expect(degrader(texte, SCHEMA)).toEqual(doc(p('le résumé')))
  })

  it('une marque inconnue est ôtée, le texte reste', () => {
    const texte = doc(p('équation', [{ type: 'bold' }, { type: 'equationDuFutur' }]))
    expect(lisible(texte, SCHEMA)).toBe(false)
    expect(degrader(texte, SCHEMA)).toEqual(doc(p('équation', [{ type: 'bold' }])))
  })

  it('un nœud en ligne inconnu devient son texte', () => {
    const texte = doc({ type: 'paragraph', content: [{ type: 'text', text: 'le ' }, { type: 'dateDuFutur', content: [{ type: 'text', text: '24 oct.' }] }] })
    expect(degrader(texte, SCHEMA)).toEqual(doc({ type: 'paragraph', content: [{ type: 'text', text: 'le ' }, { type: 'text', text: '24 oct.' }] }))
  })

  it('le texte dégradé se lit toujours', () => {
    const texte = doc({ type: 'colonnesDuFutur', content: [{ type: 'colonne', content: [p('a')] }, { type: 'colonne', content: [{ type: 'x' }] }] })
    expect(lisible(degrader(texte, SCHEMA), SCHEMA)).toBe(true)
  })
})
