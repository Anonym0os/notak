// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/react'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { invites } from './invite'
import { EXTENSIONS_BLOCS } from './schema'

definirLangue('fr')
const schema = getSchema(EXTENSIONS_BLOCS)
const doc = (...blocs: NoeudTexte[]) => schema.nodeFromJSON({ type: 'doc', content: blocs })
const vide = (type: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs })
const textes = (d: ReturnType<typeof doc>, curseur: number | null = null) => invites(d, curseur).map((x) => (x as unknown as { type: { attrs: Record<string, string> } }).type.attrs['data-invite'])

describe('NOTION.md : les invites des blocs vides', () => {
  it('les blocs d’un type montrent la leur sans le curseur', () => {
    const d = doc(vide('heading', { level: 1 }), vide('heading', { level: 2 }), vide('heading', { level: 3 }), vide('puce'), vide('numero'), vide('tache'), vide('citation'), vide('depliant'))
    expect(textes(d)).toEqual(['Titre 1', 'Titre 2', 'Titre 3', 'Liste', 'Liste', 'Tâche', 'Citation vide', 'Menu dépliant'])
  })

  it('un paragraphe vide attend le curseur, et dit comment ouvrir les commandes', () => {
    const d = doc(vide('paragraph'), vide('paragraph'))
    expect(textes(d)).toEqual([])
    expect(textes(d, 0)).toEqual(['Appuyez sur « / » pour afficher les commandes'])
    expect(textes(d, d.child(0).nodeSize)).toHaveLength(1)
  })

  it('un bloc qui a du texte, un encadré vide, un code vide n’ont pas d’invite', () => {
    const d = doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'a' }] }, vide('encadreBloc'), vide('codeBlock'))
    expect(textes(d)).toEqual([])
  })

  it('un titre dépliant vide montre l’invite de son niveau', () => {
    expect(textes(doc(vide('heading', { level: 2, depliant: true })))).toEqual(['Titre 2'])
  })
})
