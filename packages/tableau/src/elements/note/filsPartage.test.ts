import { getSchema } from '@tiptap/react'
import { Node as NoeudPM } from '@tiptap/pm/model'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import { describe, expect, it } from 'vitest'
import { Doc } from 'yjs'
import type { NoeudTexte } from '../../coeur/tableau'
import { EXTENSIONS_NOTE_PARTAGEE } from './extensions'
import { filsDuTexte } from './fils'

const SCHEMA = getSchema(EXTENSIONS_NOTE_PARTAGEE)

const texte: NoeudTexte = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'avant ' },
        { type: 'text', text: 'le passage', marks: [{ type: 'commentaireTexte', attrs: { fil: 'F1' } }] },
        { type: 'text', text: ' après' },
      ],
    },
  ],
}

describe('passage commenté dans le texte partagé', () => {
  it('la marque est dans le schéma de la note', () => {
    expect(SCHEMA.marks.commentaireTexte).toBeDefined()
  })

  it('la marque traverse le fragment Yjs avec la clé de son fil', () => {
    const doc = new Doc()
    const fragment = doc.getXmlFragment('texte')
    prosemirrorToYXmlFragment(NoeudPM.fromJSON(SCHEMA, texte), fragment)
    const relu = yXmlFragmentToProseMirrorRootNode(fragment, SCHEMA).toJSON() as NoeudTexte
    expect(filsDuTexte(relu)).toEqual(['F1'])
    const passage = relu.content![0]!.content!.find((n) => n.marks?.length)
    expect(passage?.text).toBe('le passage')
  })
})
