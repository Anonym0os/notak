import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { type KeyboardEvent, type ReactNode, memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Element, Id, NoeudTexte, Taches } from '../../coeur/tableau'
import type { PropsOutils, PropsRendu } from '../types'
import { EXTENSIONS_TACHES, type GestesTaches, clavierListe } from './extensions'
import { type Chemin, basculer, compter, docTaches, effacerFaites, estFaite, retirer, sousTaches } from './liste'

/** Les listes dont le titre vient d'être ajouté : leur édition y met le curseur. */
const titreAFocaliser = new Set<Id>()

const sansTitre = ({ titre: _, ...reste }: Taches): Taches => reste

export function RenduTaches({ element, enEdition, contexte, brouillon, changer }: PropsRendu<Taches>) {
  const { contenu } = element
  const jeter = () => {
    contexte.jeter([element.id])
    contexte.finirEdition()
  }
  return (
    <div className="notak-taches">
      {enEdition ? (
        <Edition id={element.id} contenu={contenu} surChangement={brouillon} jeter={jeter} />
      ) : (
        <Figee contenu={contenu} changer={changer} />
      )}
    </div>
  )
}

// ———— Hors édition : la liste se dessine à partir du JSON, cases cliquables ————

const Figee = memo(function Figee({ contenu, changer }: { contenu: Taches; changer(apres: Taches): void }) {
  const doc = docTaches(contenu.texte)
  const cocher = (chemin: Chemin, enCascade: boolean) =>
    changer({ ...contenu, texte: basculer(doc, chemin, enCascade) })
  const supprimer = (chemin: Chemin) => changer({ ...contenu, texte: retirer(doc, chemin) })
  return (
    <>
      {contenu.titre && <div className="notak-taches-titre">{contenu.titre}</div>}
      <Liste noeud={doc} chemin={[]} cocher={cocher} supprimer={supprimer} />
    </>
  )
})

interface PropsListe {
  noeud: NoeudTexte
  chemin: Chemin
  cocher(c: Chemin, cascade: boolean): void
  supprimer(c: Chemin): void
}

function Liste({ noeud, chemin, cocher, supprimer }: PropsListe) {
  const taches = sousTaches(noeud)
  if (taches.length === 0) return null
  return (
    <ul data-type="taskList">
      {taches.map((tache, i) => {
        const ici = [...chemin, i]
        const faite = estFaite(tache)
        return (
          <li key={i} data-type="taskItem" data-checked={faite}>
            <button
              type="button"
              tabIndex={-1}
              className="notak-case"
              role="checkbox"
              aria-checked={faite}
              aria-label="Fait"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => cocher(ici, e.shiftKey)}
            />
            <div>
              {(tache.content ?? []).map((n, k) =>
                n.type === 'paragraph' ? <p key={k}>{inline(n)}</p> : null,
              )}
              <Liste noeud={tache} chemin={ici} cocher={cocher} supprimer={supprimer} />
            </div>
            <button
              type="button"
              tabIndex={-1}
              className="notak-tache-suppr"
              title="Supprimer la tâche"
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={() => supprimer(ici)}
            />
          </li>
        )
      })}
    </ul>
  )
}

function inline(paragraphe: NoeudTexte): ReactNode {
  return (paragraphe.content ?? []).map((n, i): ReactNode => {
    if (n.type === 'hardBreak') return <br key={i} />
    let rendu: ReactNode = n.text ?? ''
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') rendu = <strong>{rendu}</strong>
      else if (m.type === 'italic') rendu = <em>{rendu}</em>
      else if (m.type === 'strike') rendu = <s>{rendu}</s>
      else if (m.type === 'underline') rendu = <u>{rendu}</u>
      else if (m.type === 'code') rendu = <code>{rendu}</code>
      else if (m.type === 'link' && typeof m.attrs?.href === 'string')
        rendu = (
          <a href={m.attrs.href} target="_blank" rel="noopener noreferrer nofollow">
            {rendu}
          </a>
        )
    }
    return <span key={i}>{rendu}</span>
  })
}

// ———— En édition : Tiptap, avec un titre en champ simple ————

const CASE_EN_TETE = /^\[([ xX]?)\]\s/

function Edition({ id, contenu, surChangement, jeter }: { id: Id; contenu: Taches; surChangement(apres: Taches): void; jeter(): void }) {
  // L'état courant vit ici : la toile ne remet l'élément à jour qu'à la sortie de l'édition.
  const courant = useRef(contenu)
  const [titre, setTitre] = useState(contenu.titre)
  const champ = useRef<HTMLInputElement>(null)
  const editeurRef = useRef<Editor | null>(null)
  const focaliserTitre = useRef(titreAFocaliser.delete(id) && contenu.titre !== undefined)

  const poser = (apres: Taches) => {
    courant.current = apres
    surChangement(apres)
  }
  const gestes = useRef<GestesTaches>(null!)
  const extensions = useMemo(() => [...EXTENSIONS_TACHES, clavierListe(gestes)], [])
  const editeur = useEditor({
    extensions,
    content: docTaches(contenu.texte),
    autofocus: focaliserTitre.current ? false : 'end',
    editorProps: { attributes: { class: 'notak-taches-texte' } },
    onUpdate: ({ editor }) => poser({ ...courant.current, texte: editor.getJSON() as NoeudTexte }),
  })
  editeurRef.current = editeur

  useEffect(() => {
    if (focaliserTitre.current) champ.current?.focus()
  }, [])

  const changerTitre = (valeur: string | undefined) => {
    setTitre(valeur)
    poser(valeur === undefined ? sansTitre(courant.current) : { ...courant.current, titre: valeur })
  }
  gestes.current = {
    aUnTitre: () => courant.current.titre !== undefined,
    versTitre: () => {
      if (courant.current.titre === undefined) changerTitre('')
      // Le champ naît au rendu suivant.
      setTimeout(() => {
        const c = champ.current
        c?.focus()
        c?.setSelectionRange(c.value.length, c.value.length)
      }, 0)
    },
    jeter,
  }
  // `[] ` en tête du titre le change en tâche, posée en haut de la liste.
  const titreTape = (valeur: string) => {
    const c = CASE_EN_TETE.exec(valeur)
    const ed = editeurRef.current
    if (!c || !ed) return changerTitre(valeur)
    const reste = valeur.slice(c[0].length)
    changerTitre(undefined)
    ed.chain()
      .insertContentAt(1, {
        type: 'taskItem',
        attrs: { checked: c[1]!.toLowerCase() === 'x' },
        content: [reste ? { type: 'paragraph', content: [{ type: 'text', text: reste }] } : { type: 'paragraph' }],
      })
      .setTextSelection(3 + reste.length)
      .run()
    // Tout de suite, sans la focalisation différée de Tiptap.
    ed.view.focus()
  }
  const clavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      editeurRef.current?.commands.focus('start')
    } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault()
      changerTitre(undefined)
      editeurRef.current?.commands.focus('start')
    }
  }

  return (
    <>
      {titre !== undefined && (
        <input
          ref={champ}
          className="notak-taches-titre"
          value={titre}
          placeholder="Titre"
          onChange={(e) => titreTape(e.target.value)}
          onKeyDown={clavier}
        />
      )}
      <EditorContent editor={editeur} />
    </>
  )
}

// ———— La barre de sélection ————

export function OutilsTaches({ elements, contexte }: PropsOutils<Taches>) {
  const { faites, total } = elements.reduce(
    (cumul, e) => {
      const c = compter(e.contenu.texte)
      return { faites: cumul.faites + c.faites, total: cumul.total + c.total }
    },
    { faites: 0, total: 0 },
  )
  const toutesTitrees = elements.every((e) => e.contenu.titre !== undefined)

  const changerTout = (f: (e: Element<Taches>) => Taches) =>
    contexte.magasin.faire(
      elements.flatMap((e) => {
        const apres = f(e)
        return JSON.stringify(apres) === JSON.stringify(e.contenu)
          ? []
          : [{ type: 'contenu' as const, id: e.id, avant: e.contenu, apres }]
      }),
    )

  const basculerTitre = () => {
    changerTout((e) =>
      toutesTitrees ? sansTitre(e.contenu) : e.contenu.titre === undefined ? { ...e.contenu, titre: '' } : e.contenu,
    )
    if (!toutesTitrees && elements.length === 1) {
      titreAFocaliser.add(elements[0]!.id)
      contexte.commencerEdition(elements[0]!.id)
    }
  }

  return (
    <>
      {total > 0 && (
        <span className="notak-taches-compteur" title="Faites">
          {faites}/{total}
        </span>
      )}
      <button type="button" aria-pressed={toutesTitrees} onClick={basculerTitre}>
        Titre
      </button>
      {faites >= 2 && (
        <button
          type="button"
          onClick={() => changerTout((e) => ({ ...e.contenu, texte: effacerFaites(docTaches(e.contenu.texte)) }))}
        >
          Effacer les faites
        </button>
      )}
    </>
  )
}
