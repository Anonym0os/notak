import { Node as NoeudPM } from '@tiptap/pm/model'
import { EditorContent, getSchema, useEditor } from '@tiptap/react'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Note, NoeudTexte } from '../../coeur/tableau'
import type { PropsRendu } from '../types'
import { BarreTexte } from './Barre'
import { adresseSeule, caseSeule, docEstVide } from './conversion'
import { docVide } from '../taches/liste'
import { texteDeNote } from './couleurs'
import type { XmlFragment } from 'yjs'
import { EXTENSIONS_NOTE, type GestesEdition, extensionsPartagees, raccourcisEdition } from './extensions'

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

const SCHEMA = getSchema(EXTENSIONS_NOTE)

/**
 * Le texte partagé de la note, prêt à éditer. Si personne d'autre n'y écrit, il repart du contenu de la note
 * (qu'une annulation a pu changer depuis) ; sinon on rejoint ce qui s'écrit.
 */
/** Le document que porte le fragment ; `null` s'il est vide (jamais écrit à plusieurs) ou illisible. */
function lire(fragment: XmlFragment): NoeudPM | null {
  if (fragment.length === 0) return null
  try {
    return yXmlFragmentToProseMirrorRootNode(fragment, SCHEMA)
  } catch {
    return null
  }
}

function textePartage({ element, contexte }: PropsRendu<Note>): XmlFragment | null {
  const fragment = contexte.magasin.texte?.(element.id)
  if (!fragment) return null
  const ailleurs = contexte.services.presence?.autres().some((p) => p.edition === element.id)
  const voulu = NoeudPM.fromJSON(SCHEMA, element.contenu.texte)
  if (!ailleurs && !lire(fragment)?.eq(voulu)) {
    fragment.doc!.transact(() => {
      fragment.delete(0, fragment.length)
      prosemirrorToYXmlFragment(voulu, fragment)
    }, 'notak:texte')
  }
  return fragment
}

function Editeur(props: PropsRendu<Note>) {
  const { element, contexte, brouillon } = props
  const { contenu } = element
  const [lien, setLien] = useState<string | null>(null)
  const gestes = useRef<GestesEdition>(null!)
  // Lu une fois, à l'entrée en édition : la suite du texte arrive par le fragment.
  const fragment = useMemo(() => textePartage(props), [])
  const extensions = useMemo(() => [...(fragment ? extensionsPartagees(fragment) : EXTENSIONS_NOTE), raccourcisEdition(gestes)], [fragment])
  const editeur = useEditor({
    extensions,
    ...(fragment ? {} : { content: contenu.texte }),
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
      // À la corbeille d'abord : la sortie de l'édition n'inscrit plus rien d'une note partie,
      // et l'annulation rend la note telle qu'elle était avant l'édition.
      contexte.jeter([element.id])
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
