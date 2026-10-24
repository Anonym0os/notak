import type { Editor } from '@tiptap/react'
import { type RefObject, useEffect, useState } from 'react'
import { partager, parts, ratiosDe, regler } from './colonnes'

/**
 * Les poignées de largeur entre deux colonnes (docs/NOTION.md § 8) : un séparateur de 46 px, invisible jusqu'au survol,
 * dont un trait de 4 px apparaît en fondu. Tirer règle le partage de ces deux colonnes seulement, aimanté par pas de
 * 1/(8·n) ; un double-clic remet toutes les colonnes à parts égales. Rien ne s'écrit à l'historique avant le lâcher :
 * un seul ⌘Z défait le réglage.
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
      return { rangee: pos, i, x: (fin + debutSuivante) / 2 - rz.left + zone.scrollLeft, haut: r.top - rz.top + zone.scrollTop, hauteur: r.height }
    })
  })
}

export function Largeurs({ editeur, zone }: { editeur: Editor; zone: RefObject<HTMLElement | null> }) {
  const [liste, setListe] = useState<Frontiere[]>([])
  const [tiree, setTiree] = useState<string | null>(null)

  // Les frontières suivent le texte : à chaque changement, et quand la fenêtre ou la colonne de texte change de taille.
  useEffect(() => {
    const relire = () => zone.current && setListe(frontieres(editeur, zone.current))
    relire()
    editeur.on('transaction', relire)
    window.addEventListener('resize', relire)
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(relire)
    observateur?.observe(editeur.view.dom)
    return () => {
      editeur.off('transaction', relire)
      window.removeEventListener('resize', relire)
      observateur?.disconnect()
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
    const brutes = Array.from({ length: noeud.childCount }, (_, i) => noeud.child(i).attrs.ratio as number | null)
    const depart = parts(brutes)
    // La largeur que se partagent les colonnes : celle des colonnes, sans les séparateurs.
    const largeur = [...dom.children].reduce((s, c) => s + (c instanceof HTMLElement && c.classList.contains('notak-blocs-colonne') ? c.getBoundingClientRect().width : 0), 0) || dom.getBoundingClientRect().width
    const x0 = e.clientX
    const cle = `${f.rangee}:${f.i}`
    setTiree(cle)
    zone.current?.setAttribute('data-glisse-largeur', '')
    let dernier: (number | null)[] | null = null
    const bouger = (m: PointerEvent) => {
      dernier = ratiosDe(partager(depart, f.i, (m.clientX - x0) / largeur))
      const tr = regler(vue.state, f.rangee, dernier)
      if (tr) vue.dispatch(tr.setMeta('addToHistory', false))
    }
    const lacher = () => {
      window.removeEventListener('pointermove', bouger, true)
      window.removeEventListener('pointerup', lacher, true)
      zone.current?.removeAttribute('data-glisse-largeur')
      setTiree(null)
      if (!dernier) return
      // Les étapes du glisser n'ont pas laissé de trace : on rend d'abord les parts du départ, puis on écrit le réglage d'un coup.
      const final = dernier
      const retour = regler(vue.state, f.rangee, brutes)
      if (retour) vue.dispatch(retour.setMeta('addToHistory', false))
      const tr = regler(vue.state, f.rangee, final)
      if (tr?.docChanged) vue.dispatch(tr)
    }
    window.addEventListener('pointermove', bouger, true)
    window.addEventListener('pointerup', lacher, true)
  }

  // Un double-clic remet toutes les colonnes de la rangée à parts égales.
  const egaliser = (f: Frontiere) => {
    const vue = editeur.view
    const noeud = vue.state.doc.nodeAt(f.rangee)
    if (!noeud) return
    const tr = regler(vue.state, f.rangee, Array.from({ length: noeud.childCount }, () => null))
    if (tr?.docChanged) vue.dispatch(tr)
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
          onDoubleClick={() => egaliser(f)}
          aria-hidden
        />
      ))}
    </>
  )
}
