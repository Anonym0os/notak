import { EditorContent, getSchema, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Note, NoeudTexte } from '../../coeur/tableau'
import { extensionsDuPartage, textePartage } from '../partage'
import type { PropsRendu } from '../types'
import { BarreTexte } from './Barre'
import { adresseSeule, adressesEnLiens, caseSeule, docEstVide } from './conversion'
import { docVide } from '../taches/liste'
import { texteDuContenu } from './couleurs'
import { EXTENSIONS_NOTE, EXTENSIONS_NOTE_PARTAGEE, type GestesEdition, raccourcisEdition } from './extensions'

export function RenduNote(props: PropsRendu<Note>) {
  const { element, enEdition } = props
  const { contenu } = element
  const texte = texteDuContenu(contenu)
  const racine = useRef<HTMLDivElement>(null)
  // Un fond libre ne peut pas se dire en CSS : la carte, que `Cadre` pose, le reçoit d'ici.
  useLayoutEffect(() => {
    const carte = racine.current?.parentElement
    if (!carte || !contenu.fond) return
    carte.style.background = contenu.fond
    carte.style.setProperty('--notak-voile', contenu.fond)
    return () => {
      carte.style.background = ''
      carte.style.removeProperty('--notak-voile')
    }
  }, [contenu.fond])
  // Sous un plafond de hauteur, le texte déborde en silence : le bas s'efface (voir `note.css`).
  const [deborde, setDeborde] = useState(false)
  useLayoutEffect(() => {
    const texteDom = racine.current?.querySelector<HTMLElement>(':scope > .notak-texte')
    if (!texteDom) return
    const mesurer = () => setDeborde(texteDom.scrollHeight > texteDom.clientHeight + 1)
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(texteDom)
    return () => obs.disconnect()
  }, [enEdition, contenu.texte])
  return (
    <div
      ref={racine}
      className="notak-note"
      data-couleur={contenu.fond ? undefined : contenu.couleur}
      data-variante={contenu.variante}
      data-barre={contenu.barre ? '' : undefined}
      data-deborde={deborde || undefined}
      style={texte ? { color: texte } : undefined}
      // Hors édition, un lien s'ouvre : l'appui ne doit pas lancer un glisser.
      onPointerDown={enEdition ? undefined : (e) => (e.target as HTMLElement).closest('a') && e.stopPropagation()}
    >
      {contenu.barre && <div className="notak-note-bande" style={{ background: contenu.barre }} aria-hidden />}
      {enEdition ? <Editeur {...props} /> : <TexteFige texte={contenu.texte} />}
      {contenu.legende && <div className="notak-note-legende">{contenu.legende}</div>}
    </div>
  )
}

const TexteFige = memo(function TexteFige({ texte }: { texte: NoeudTexte }) {
  const rendu = useMemo(() => renderToReactElement({ content: adressesEnLiens(texte), extensions: EXTENSIONS_NOTE }), [texte])
  return <div className="notak-texte">{rendu}</div>
})

const SCHEMA = getSchema(EXTENSIONS_NOTE)

function Editeur(props: PropsRendu<Note>) {
  const { element, contexte, brouillon } = props
  const { contenu } = element
  const [lien, setLien] = useState<string | null>(null)
  const gestes = useRef<GestesEdition>(null!)
  // Lu une fois, à l'entrée en édition : la suite du texte arrive par le fragment.
  const fragment = useMemo(() => textePartage(contexte, element.id, contenu.texte, SCHEMA), [])
  const extensions = useMemo(
    () => [...(fragment ? [...EXTENSIONS_NOTE_PARTAGEE, ...extensionsDuPartage(fragment, contexte)] : EXTENSIONS_NOTE), raccourcisEdition(gestes)],
    [fragment],
  )
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
