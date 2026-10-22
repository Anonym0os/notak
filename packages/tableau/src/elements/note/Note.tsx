import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useMemo } from 'react'
import type { NoeudTexte, Note } from '../../coeur/tableau'
import type { PropsRendu } from '../types'

export const EXTENSIONS_NOTE = [StarterKit]

export function RenduNote({ element, enEdition, brouillon }: PropsRendu<Note>) {
  const { contenu } = element
  return enEdition ? (
    <Editeur texte={contenu.texte} surChangement={(texte) => brouillon({ ...contenu, texte })} />
  ) : (
    <TexteFige texte={contenu.texte} />
  )
}

const TexteFige = memo(function TexteFige({ texte }: { texte: NoeudTexte }) {
  const rendu = useMemo(() => renderToReactElement({ content: texte, extensions: EXTENSIONS_NOTE }), [texte])
  return <div className="notak-texte">{rendu}</div>
})

function Editeur({ texte, surChangement }: { texte: NoeudTexte; surChangement(t: NoeudTexte): void }) {
  const editeur = useEditor({
    extensions: EXTENSIONS_NOTE,
    content: texte,
    autofocus: 'end',
    editorProps: { attributes: { class: 'notak-texte' } },
    onUpdate: ({ editor }) => surChangement(editor.getJSON() as NoeudTexte),
  })
  return <EditorContent editor={editeur} />
}
