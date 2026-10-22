import { EditorContent, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useMemo, useRef, useState } from 'react'
import { HAUTEUR_NOTE_MIN, type Note, type NoeudTexte, nouvelleNote } from '../../coeur/tableau'
import type { PropsRendu } from '../types'
import { BarreTexte } from './Barre'
import { docEstVide } from './conversion'
import { texteDeNote } from './couleurs'
import { EXTENSIONS_NOTE, type GestesEdition, raccourcisEdition } from './extensions'

export function RenduNote(props: PropsRendu<Note>) {
  const { element, enEdition } = props
  const { contenu } = element
  const texte = texteDeNote(contenu.couleur)
  return (
    <div
      className="notak-note"
      data-couleur={contenu.couleur}
      data-variante={contenu.variante}
      style={texte ? { color: texte } : undefined}
      // Hors édition, un lien s'ouvre : l'appui ne doit pas lancer un glisser.
      onPointerDown={enEdition ? undefined : (e) => (e.target as HTMLElement).closest('a') && e.stopPropagation()}
    >
      {enEdition ? <Editeur {...props} /> : <TexteFige texte={contenu.texte} />}
    </div>
  )
}

const TexteFige = memo(function TexteFige({ texte }: { texte: NoeudTexte }) {
  const rendu = useMemo(() => renderToReactElement({ content: texte, extensions: EXTENSIONS_NOTE }), [texte])
  return <div className="notak-texte">{rendu}</div>
})

function Editeur({ element, contexte, brouillon }: PropsRendu<Note>) {
  const { contenu } = element
  const [lien, setLien] = useState<string | null>(null)
  const gestes = useRef<GestesEdition>(null!)
  const extensions = useMemo(() => [...EXTENSIONS_NOTE, raccourcisEdition(gestes)], [])
  const editeur = useEditor({
    extensions,
    content: contenu.texte,
    autofocus: 'end',
    editorProps: { attributes: { class: 'notak-texte' } },
    onUpdate: ({ editor }) => brouillon({ ...contenu, texte: editor.getJSON() as NoeudTexte }),
  })

  gestes.current = {
    lien: () => {
      if (editeur && (!editeur.state.selection.empty || editeur.isActive('link')))
        setLien((editeur.getAttributes('link').href as string | undefined) ?? '')
    },
    estVide: () => !!editeur && docEstVide(editeur.getJSON() as NoeudTexte),
    supprimerNote: () => {
      // Supprimer d'abord : la sortie de l'édition n'inscrit plus rien d'une note disparue,
      // et l'annulation rend la note telle qu'elle était avant l'édition.
      const courante = contexte.magasin.lire().elements.find((e) => e.id === element.id)
      if (courante) contexte.magasin.faire([{ type: 'supprimer', element: courante }])
      contexte.finirEdition()
    },
    noteDessous: () => {
      const courante = contexte.magasin.lire().elements.find((e) => e.id === element.id)
      if (!courante) return
      const bas = contexte.rect(element.id)?.max.y ?? courante.y + HAUTEUR_NOTE_MIN
      const neuve = nouvelleNote(courante.x, Math.round(bas) + 1)
      const note: typeof neuve = {
        ...neuve,
        largeur: courante.largeur,
        contenu: { ...neuve.contenu, ...(contenu.couleur ? { couleur: contenu.couleur } : {}) },
      }
      contexte.finirEdition()
      contexte.magasin.faire([{ type: 'creer', element: note }])
      contexte.commencerEdition(note.id)
    },
  }

  return (
    <>
      {editeur && <BarreTexte editor={editeur} lien={lien} surLien={setLien} />}
      <EditorContent editor={editeur} />
    </>
  )
}
