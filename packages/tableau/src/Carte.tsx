import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useEffect, useMemo, useRef } from 'react'
import { PX_PAR_UG } from './coeur/camera'
import type { Element, Id, NoeudTexte } from './coeur/tableau'

export const EXTENSIONS = [StarterKit]

interface Props {
  element: Element
  choisie: boolean
  enEdition: boolean
  /** La hauteur rendue, en UG : elle sert au lasso et à l'ajustement. */
  surHauteur(id: Id, hauteur: number): void
  /** Chaque frappe pendant l'écriture : la toile garde le brouillon et l'enregistre à la sortie. */
  surBrouillon(id: Id, texte: NoeudTexte): void
}

export const Carte = memo(function Carte({ element, choisie, enEdition, surHauteur, surBrouillon }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const div = ref.current
    if (!div) return
    const obs = new ResizeObserver(() => surHauteur(element.id, div.offsetHeight / PX_PAR_UG))
    obs.observe(div)
    return () => obs.disconnect()
  }, [element.id, surHauteur])

  const { contenu } = element
  return (
    <div
      ref={ref}
      className="notak-carte"
      data-id={element.id}
      data-choisie={choisie || undefined}
      data-edition={enEdition || undefined}
      style={{
        left: element.x * PX_PAR_UG,
        top: element.y * PX_PAR_UG,
        width: element.largeur * PX_PAR_UG,
      }}
    >
      {enEdition ? (
        <Editeur texte={contenu.texte} surBrouillon={(t) => surBrouillon(element.id, t)} />
      ) : (
        <TexteFige texte={contenu.texte} />
      )}
    </div>
  )
})

const TexteFige = memo(function TexteFige({ texte }: { texte: NoeudTexte }) {
  const rendu = useMemo(() => renderToReactElement({ content: texte, extensions: EXTENSIONS }), [texte])
  return <div className="notak-texte">{rendu}</div>
})

function Editeur({ texte, surBrouillon }: { texte: NoeudTexte; surBrouillon(t: NoeudTexte): void }) {
  const editeur = useEditor({
    extensions: EXTENSIONS,
    content: texte,
    autofocus: 'end',
    editorProps: { attributes: { class: 'notak-texte' } },
    onUpdate: ({ editor }) => surBrouillon(editor.getJSON() as NoeudTexte),
  })
  return <EditorContent editor={editeur} />
}
