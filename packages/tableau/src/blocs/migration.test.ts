import { describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { aplatir, deplier, estImbrique } from './migration'

const p = (text: string, attrs?: Record<string, unknown>): NoeudTexte => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [{ type: 'text', text }] })
const t = (type: string, text: string, attrs?: Record<string, unknown>): NoeudTexte => ({ type, ...(attrs ? { attrs } : {}), content: [{ type: 'text', text }] })
const doc = (...content: NoeudTexte[]): NoeudTexte => ({ type: 'doc', content })
const li = (text: string, attrs?: Record<string, unknown>, ...dessous: NoeudTexte[]): NoeudTexte => ({ type: 'listItem', ...(attrs ? { attrs } : {}), content: [p(text), ...dessous] })

describe('NOTION.md § 1 : un texte imbriqué passe à plat, et revient', () => {
  const ancien = doc(
    p('intro'),
    { type: 'bulletList', content: [li('un', { id: 'l1' }, { type: 'orderedList', content: [li('un.un', { id: 'l2' })] }), li('deux')] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { id: 'c', checked: true }, content: [p('fait')] }] },
    { type: 'blockquote', attrs: { id: 'q' }, content: [p('cité'), p('suite')] },
    { type: 'encadre', attrs: { icone: '⚠️' }, content: [p('attention')] },
    { type: 'deroulant', attrs: { id: 'd', niveau: 2, ouvert: false }, content: [{ type: 'resumeDeroulant', content: [{ type: 'text', text: 'Plus' }] }, p('caché')] },
    { type: 'deroulant', content: [{ type: 'resumeDeroulant', content: [{ type: 'text', text: 'Simple' }] }] },
  )
  const plat = doc(
    p('intro'),
    t('puce', 'un', { id: 'l1' }),
    t('numero', 'un.un', { id: 'l2', retrait: 1 }),
    t('puce', 'deux'),
    t('tache', 'fait', { id: 'c', coche: true }),
    t('citation', 'cité', { id: 'q' }),
    p('suite', { retrait: 1 }),
    t('encadreBloc', 'attention', { icone: '⚠️' }),
    t('heading', 'Plus', { id: 'd', level: 2, depliant: true, ouvert: false }),
    p('caché', { retrait: 1 }),
    t('depliant', 'Simple'),
  )

  it('aplatit les listes, les tâches, les citations, les encadrés et les dépliants', () => {
    expect(estImbrique(ancien)).toBe(true)
    expect(aplatir(ancien)).toEqual(plat)
    expect(estImbrique(plat)).toBe(false)
  })

  it('un texte déjà à plat est rendu tel quel', () => {
    expect(aplatir(plat)).toBe(plat)
  })

  it('déplie pour les exports et la note : on retrouve l’écriture imbriquée', () => {
    expect(aplatir(deplier(plat))).toEqual(plat)
    const d = deplier(plat)
    expect(d.content?.[1]).toMatchObject({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }, { type: 'orderedList' }] }, { type: 'listItem' }] })
  })

  it('les enfants d’un paragraphe le suivent au même rang dans l’écriture imbriquée', () => {
    expect(deplier(doc(p('a'), p('b', { retrait: 1 })))).toEqual(doc(p('a'), p('b')))
  })

  it('les colonnes passent dans les deux sens', () => {
    const c = doc({ type: 'colonnes', content: [{ type: 'colonne', content: [{ type: 'bulletList', content: [li('x')] }] }, { type: 'colonne', content: [p('y')] }] })
    expect(aplatir(c).content?.[0]?.content?.[0]?.content).toEqual([t('puce', 'x')])
    expect(deplier(aplatir(c))).toEqual(c)
  })
})
