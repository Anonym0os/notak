import type { Editor } from '@tiptap/react'
import { type RefObject, useEffect, useState } from 'react'
import { partager, parts, ratiosDe, regler } from './colonnes'

/**
 * Les poignées de largeur entre deux colonnes (docs/NOTION.md § 8) : tirer règle le partage de ces deux colonnes
 * seulement, aimanté par pas de 1/(8·n).
 */

interface Frontiere {
  /** La position du nœud `colonnes` dans le texte. */
  rangee: number
  /** La frontière entre la colonne `i` et la suivante. */
  i: number
  x: number
  haut: number
  hauteur: number
}

/** Les frontières des rangées du texte, dans le repère de la zone. */
function frontieres(editeur: Editor, zone: HTMLElement): Frontiere[] {
  const rz = zone.getBoundingClientRect()
  const vue = editeur.view
  return [...vue.dom.querySelectorAll<HTMLElement>('.notak-blocs-rangee')].flatMap((rangee) => {
    let pos: number
    try {
      pos = vue.posAtDOM(rangee, 0) - 1
    } catch {
      return []
    }
    if (vue.state.doc.nodeAt(pos)?.type.name !== 'colonnes') return []
    const r = rangee.getBoundingClientRect()
    const cols = [...rangee.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('notak-blocs-colonne'))
    return cols.slice(0, -1).map((c, i) => {
      const fin = c.getBoundingClientRect().right
      const debutSuivante = cols[i + 1]!.getBoundingClientRect().left
      return { rangee: pos, i, x: (fin + debutSuivante) / 2 - rz.left, haut: r.top - rz.top + zone.scrollTop, hauteur: r.height }
    })
  })
}

export function Largeurs({ editeur, zone }: { editeur: Editor; zone: RefObject<HTMLElement | null> }) {
  const [liste, setListe] = useState<Frontiere[]>([])
  const [tiree, setTiree] = useState<string | null>(null)

  // Les frontières suivent le texte : à chaque changement, et quand la fenêtre change de taille.
  useEffect(() => {
    const relire = () => zone.current && setListe(frontieres(editeur, zone.current))
    relire()
    editeur.on('transaction', relire)
    window.addEventListener('resize', relire)
    return () => {
      editeur.off('transaction', relire)
      window.removeEventListener('resize', relire)
    }
  }, [editeur, zone])

  const tirer = (e: React.PointerEvent, f: Frontiere) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const vue = editeur.view
    const noeud = vue.state.doc.nodeAt(f.rangee)
    const dom = vue.nodeDOM(f.rangee)
    if (!noeud || !(dom instanceof HTMLElement)) return
    const depart = parts(Array.from({ length: noeud.childCount }, (_, i) => noeud.child(i).attrs.ratio as number | null))
    const largeur = dom.getBoundingClientRect().width
    const x0 = e.clientX
    setTiree(`${f.rangee}:${f.i}`)
    const bouger = (m: PointerEvent) => {
      const tr = regler(vue.state, f.rangee, ratiosDe(partager(depart, f.i, (m.clientX - x0) / largeur)))
      if (tr) vue.dispatch(tr)
    }
    const lacher = () => {
      window.removeEventListener('pointermove', bouger, true)
      window.removeEventListener('pointerup', lacher, true)
      setTiree(null)
    }
    window.addEventListener('pointermove', bouger, true)
    window.addEventListener('pointerup', lacher, true)
  }

  if (!editeur.isEditable) return null
  return (
    <>
      {liste.map((f) => (
        <div
          key={`${f.rangee}:${f.i}`}
          className="notak-blocs-largeur"
          data-tire={tiree === `${f.rangee}:${f.i}` || undefined}
          style={{ left: f.x, top: f.haut, height: f.hauteur }}
          onPointerDown={(e) => tirer(e, f)}
          aria-hidden
        />
      ))}
    </>
  )
}
