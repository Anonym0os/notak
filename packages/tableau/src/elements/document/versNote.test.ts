import { describe, expect, it } from 'vitest'
import type { DocumentTexte, NoeudTexte } from '../../coeur/tableau'
import { documentVersNote } from './versNote'

const doc = (...content: NoeudTexte[]): DocumentTexte => ({ type: 'document', titre: 'Page', texte: { type: 'doc', content } })
const p = (text: string): NoeudTexte => ({ type: 'paragraph', content: [{ type: 'text', text }] })
/** Les blocs de la note, sans le titre de la page qu'elle met en tête. */
const corps = (c: DocumentTexte) => (documentVersNote(c).texte.content ?? []).slice(1)
const carte = (attrs: Record<string, unknown>): NoeudTexte => ({ type: 'apercuLien', attrs })

describe('un document devient une note : l’aperçu de lien ne se perd pas', () => {
  it('une carte devient un paragraphe dont le titre est un lien vers l’adresse', () => {
    const blocs = corps(doc(p('avant'), carte({ url: 'https://exemple.fr/a', titre: 'Exemple', description: 'Une page', image: 'https://exemple.fr/i.png' }), p('après')))
    expect(blocs.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'paragraph'])
    expect(blocs[1]?.content).toEqual([{ type: 'text', text: 'Exemple', marks: [{ type: 'link', attrs: expect.objectContaining({ href: 'https://exemple.fr/a' }) }] }])
  })

  it('sans titre, l’adresse fait le texte du lien ; une carte sans adresse s’en va', () => {
    const blocs = corps(doc(carte({ url: 'https://exemple.fr', titre: '' }), carte({ url: '' })))
    expect(blocs).toHaveLength(1)
    expect(blocs[0]?.content?.[0]).toMatchObject({ text: 'https://exemple.fr', marks: [{ type: 'link' }] })
  })

  it('une carte dans une colonne est gardée aussi', () => {
    const colonnes: NoeudTexte = { type: 'colonnes', content: [{ type: 'colonne', content: [carte({ url: 'https://exemple.fr', titre: 'Dedans' })] }, { type: 'colonne', content: [p('autre')] }] }
    const texte = JSON.stringify(documentVersNote(doc(colonnes)).texte)
    expect(texte).toContain('Dedans')
    expect(texte).toContain('https://exemple.fr')
  })
})
