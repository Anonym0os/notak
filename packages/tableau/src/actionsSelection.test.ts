import { describe, expect, it } from 'vitest'
import { nouvelId } from './coeur/tableau'
import { creeLe } from './actionsSelection'
import { documentEnNote, enDocument } from './elements/note/conversion'

describe('creeLe', () => {
  it('lit la date dans un identifiant ULID', () => {
    const ms = Date.UTC(2026, 9, 12, 8, 30)
    expect(creeLe(nouvelId(ms))).toBe(ms)
  })
  it('ne devine rien d’un identifiant qui n’en est pas un', () => {
    expect(creeLe('a')).toBeNull()
    expect(creeLe('élément-un-peu-long')).toBeNull()
    expect(creeLe('0000000000ABC')).toBeNull()
  })
})

describe('note et document', () => {
  const texte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }] }
  it('une note devient un document avec le même texte', () => {
    expect(enDocument({ type: 'note', texte, couleur: 'rouge' })).toEqual({ type: 'document', titre: '', texte })
  })
  it('un document devient une note, et son titre ouvre le texte', () => {
    const note = documentEnNote({ type: 'document', titre: 'Plan', texte })
    expect(note.texte.content![0]).toMatchObject({ type: 'heading', content: [{ text: 'Plan' }] })
    expect(note.texte.content).toHaveLength(2)
    expect(documentEnNote({ type: 'document', titre: ' ', texte }).texte).toBe(texte)
  })
})
