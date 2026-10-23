import { type Editor, useEditorState } from '@tiptap/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NoeudTexte } from '../../coeur/tableau'
import { texteBrut } from '../../coeur/tableau'
import { t } from '../../langue'
import { Icone } from '../../icones'
import type { ContexteToile } from '../types'
import { CLE_PASSAGE_EXTRAIT, creerNoteExtraite, docDuPassage } from './extraction'

/** Le déplacement, en pixels, en dessous duquel on n'a pas tiré : un clic, ou un geste annulé. */
const SEUIL = 4

/**
 * L'extraction d'un passage : tant qu'un passage est choisi dans la note en édition, une petite icône de note paraît au
 * bord droit de la carte, à mi-hauteur du passage. On la tire sur le tableau (ou dans une colonne) : une note neuve
 * reçoit le passage, qui quitte la note d'origine ; avec Alt, il y reste (copié). Le passage s'atténue pendant le
 * geste ; lâcher là où l'on a pris annule.
 */
export function Extraction({ editeur, contexte }: { editeur: Editor; contexte: ContexteToile }) {
  const passage = useEditorState({
    editor: editeur,
    selector: ({ editor }) => (editor.state.selection.empty ? null : `${editor.state.selection.from}:${editor.state.selection.to}`),
  })
  const [haut, setHaut] = useState(0)
  const [glisse, setGlisse] = useState<{ x: number; y: number } | null>(null)
  const prise = useRef<{ x: number; y: number; deplace: boolean; doc: NoeudTexte | null; from: number; to: number } | null>(null)

  // À mi-hauteur du passage, dans le plan de la carte (la toile peut être zoomée).
  useLayoutEffect(() => {
    if (!passage || editeur.isDestroyed) return
    const carte = editeur.view.dom.closest<HTMLElement>('.notak-carte')
    if (!carte) return
    const r = carte.getBoundingClientRect()
    const echelle = carte.offsetWidth > 0 ? r.width / carte.offsetWidth : 1
    const { from, to } = editeur.state.selection
    const milieu = (editeur.view.coordsAtPos(from).top + editeur.view.coordsAtPos(to).bottom) / 2
    const y = (milieu - r.top) / echelle - 11
    setHaut((avant) => (Math.abs(avant - y) < 0.5 ? avant : y))
  }, [passage, editeur])

  if (!passage || contexte.services.lectureSeule) return null

  const atténuer = (p: { from: number; to: number } | null) => {
    if (!editeur.isDestroyed) editeur.view.dispatch(editeur.state.tr.setMeta(CLE_PASSAGE_EXTRAIT, p))
  }
  const finir = (e: React.PointerEvent<HTMLButtonElement>, deposer: boolean) => {
    const p = prise.current
    prise.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setGlisse(null)
    atténuer(null)
    if (!p || !p.deplace || !deposer || !p.doc) return
    const toile = editeur.view.dom.closest<HTMLElement>('.notak-toile')
    const r = toile?.getBoundingClientRect()
    if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
    const chez = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]')?.getAttribute('data-id') ?? null
    const origine = editeur.view.dom.closest('[data-id]')?.getAttribute('data-id') ?? null
    // Lâché sur la note d'où il vient : rien à extraire.
    if (chez && chez === origine) return
    creerNoteExtraite(contexte, p.doc, contexte.versTableau({ x: e.clientX - r.left, y: e.clientY - r.top }), chez)
    // Le passage quitte la note, sauf avec Alt, qui le copie ; l'écriture reprend dans la note d'origine.
    if (e.altKey) editeur.commands.focus()
    else editeur.chain().focus().setTextSelection({ from: p.from, to: p.to }).deleteSelection().run()
  }

  return (
    <>
      <button
        type="button"
        className="notak-extraction"
        style={{ top: haut }}
        aria-label={t('note.extraire')}
        title={t('note.extraire')}
        data-glisse={glisse ? '' : undefined}
        // Ni le focus ni la sélection de l'éditeur ne bougent.
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          const { from, to } = editeur.state.selection
          prise.current = { x: e.clientX, y: e.clientY, deplace: false, doc: docDuPassage(editeur), from, to }
        }}
        onPointerMove={(e) => {
          const p = prise.current
          if (!p) return
          if (!p.deplace && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SEUIL) {
            p.deplace = true
            atténuer({ from: p.from, to: p.to })
          }
          if (p.deplace) setGlisse({ x: e.clientX, y: e.clientY })
        }}
        onPointerUp={(e) => finir(e, true)}
        onPointerCancel={(e) => finir(e, false)}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Icone nom="note" taille={16} />
      </button>
      {glisse && prise.current?.doc &&
        createPortal(
          <div className="notak-extraction-fantome" style={{ left: glisse.x + 10, top: glisse.y + 10 }} aria-hidden>
            {texteBrut(prise.current.doc).slice(0, 90)}
          </div>,
          document.body,
        )}
    </>
  )
}
