import { describe, expect, test } from 'vitest'
import type { NoeudTexte } from '../../coeur/tableau'
import { documentEnTexte, nomFichier } from './export'

const p = (...content: NoeudTexte[]): NoeudTexte => ({ type: 'paragraph', content })
const mot = (text: string, ...marks: string[]): NoeudTexte => ({ type: 'text', text, marks: marks.map((type) => ({ type })) })
const doc: NoeudTexte = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [mot('Plan')] },
    p(mot('un '), mot('fort', 'bold'), mot(' mot')),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(mot('a'))] }, { type: 'listItem', content: [p(mot('b'))] }] },
    { type: 'horizontalRule' },
  ],
}

describe('l’export du document', () => {
  test('en Markdown : titre, mise en forme et listes', () => {
    expect(documentEnTexte('Mon doc', doc, 'md')).toBe('# Mon doc\n\n## Plan\n\nun **fort** mot\n\n- a\n- b\n\n---\n')
  })

  test('en texte brut : aucun signe de mise en forme', () => {
    expect(documentEnTexte('Mon doc', doc, 'txt')).toBe('Mon doc\n\nPlan\n\nun fort mot\n\n- a\n- b\n')
  })

  test('sans titre, le texte seul', () => {
    expect(documentEnTexte('  ', { type: 'doc', content: [p(mot('x'))] }, 'txt')).toBe('x\n')
  })

  test('le nom du fichier vient du titre, sans caractère interdit', () => {
    expect(nomFichier(' Plan: 1/2 ', 'md')).toBe('Plan 1 2.md')
    expect(nomFichier('', 'txt')).toBe('document.txt')
  })
})
