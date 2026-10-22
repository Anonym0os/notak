import { EditorContent, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Note, NoeudTexte } from '../../coeur/tableau'
import type { PropsRendu } from '../types'
import { BarreTexte } from './Barre'
import { adresseSeule, caseSeule, docEstVide } from './conversion'
import { docVide } from '../taches/liste'
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
    editorProps: { attributes: { class: 'notak-texte' } },
    onUpdate: ({ editor }) => brouillon({ ...contenu, texte: editor.getJSON() as NoeudTexte }),
  })

  // Le curseur se pose là où l'on a cliqué, sinon à la fin : une fois l'éditeur accroché à la page
  // (les effets des enfants passent avant, `EditorContent` y accroche la vue).
  useEffect(() => {
    if (!editeur || editeur.isDestroyed) return
    const ou = contexte.prendrePointEdition()
    const pos = ou && editeur.view.posAtCoords({ left: ou.x, top: ou.y })
    // Tout de suite, sans la focalisation différée de Tiptap : ce qu'on tape aussitôt arrive dans la note.
    editeur.commands.setTextSelection(pos ? pos.pos : editeur.state.doc.content.size)
    editeur.view.focus()
  }, [editeur, contexte])

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
    noteDessous: () => contexte.creerSuivant(element.id, false),
    // Une note qui n'est qu'une adresse devient un lien en sortant ; qui n'est qu'une case, une liste de tâches.
    entree: () => {
      if (!editeur || !adresseSeule(editeur.getJSON() as NoeudTexte)) return false
      contexte.finirEdition()
      return true
    },
    enTaches: () => {
      const cochee = editeur && caseSeule(editeur.getJSON() as NoeudTexte)
      if (cochee === null || cochee === undefined) return false
      const texte = docVide()
      texte.content![0]!.content![0]!.attrs = { checked: cochee }
      brouillon({ type: 'taches', texte } as never)
      contexte.finirEdition()
      contexte.commencerEdition(element.id)
      return true
    },
  }

  return (
    <>
      {editeur && <BarreTexte editor={editeur} lien={lien} surLien={setLien} />}
      <EditorContent editor={editeur} />
    </>
  )
}
