import { describe, expect, it } from 'vitest'
import { docLegende, legendeNeuve, legendeVide, texteLegende } from './legende'

describe('la légende de la note', () => {
  it('un texte brut devient un document, une ligne par paragraphe', () => {
    expect(docLegende('un\ndeux')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'un' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'deux' }] },
      ],
    })
  })

  it('un document passe tel quel, et rien reste rien', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }] }] }
    expect(docLegende(doc)).toBe(doc)
    expect(docLegende(undefined)).toBeUndefined()
    expect(docLegende('   ')).toBeUndefined()
  })

  it('sait si elle est vide', () => {
    expect(legendeVide(undefined)).toBe(true)
    expect(legendeVide('')).toBe(true)
    expect(legendeVide(legendeNeuve())).toBe(true)
    expect(legendeVide('a')).toBe(false)
    expect(legendeVide(docLegende('a'))).toBe(false)
  })

  it('en rend le texte brut', () => {
    expect(texteLegende('a\nb')).toBe('a\nb')
    expect(texteLegende({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'gras', marks: [{ type: 'bold' }] }] }] })).toBe('gras')
    expect(texteLegende(undefined)).toBe('')
  })
})

describe('les extensions de la légende', () => {
  it('lisent un texte riche et ignorent ce qu\'elle n\'accepte pas', async () => {
    const { getSchema } = await import('@tiptap/react')
    const { EXTENSIONS_LEGENDE } = await import('./extensions')
    const schema = getSchema(EXTENSIONS_LEGENDE)
    for (const m of ['bold', 'italic', 'strike', 'underline', 'link', 'highlight', 'textStyle']) expect(schema.marks[m], m).toBeDefined()
    for (const n of ['heading', 'bulletList', 'blockquote', 'codeBlock']) expect(schema.nodes[n], n).toBeUndefined()
  })
})
