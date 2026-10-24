import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { t } from '../langue'
import { type Cote, blocA, deplacer } from './gestes'
import { CLE_CHOIX, blocsChoisis, choisir, parcours } from './selection'

/**
 * La poignée (docs/NOTION.md § 6 et § 8) : au survol d'un bloc, `+` et `⋮⋮` dans sa marge gauche. `+` ajoute un bloc
 * dessous et y ouvre le menu « / » ; `⋮⋮` se tire pour déplacer le bloc (⌥ le copie), ou se clique pour son menu.
 * Tirer un rectangle depuis la marge choisit les blocs qu'il touche (§ 7).
 */

interface Survol {
  id: string
  pos: number
  /** Le haut de la première ligne et la gauche du bloc, dans le repère de la zone. */
  haut: number
  gauche: number
}

interface Depot {
  id: string
  cote: Cote
  haut: number
  gauche: number
  largeur: number
}

interface Props {
  editeur: Editor
  /** La zone qui défile et porte la poignée (`position: relative`). */
  zone: RefObject<HTMLElement | null>
  /** Ouvre le menu de la poignée sur les blocs choisis. */
  ouvrirMenu(): void
}

/** Les blocs qu'on ne saisit pas par la poignée : la rangée et la colonne, que leurs blocs remplissent. */
const SANS_POIGNEE = new Set(['colonnes', 'colonne'])

/** Le bloc sous un point de l'écran : son id, sa position et son élément. */
function blocSous(editeur: Editor, x: number, y: number): { id: string; pos: number; dom: HTMLElement } | null {
  const vue = editeur.view
  const cible = document.elementFromPoint(x, y)
  let el = cible instanceof Element ? cible.closest<HTMLElement>('[data-bloc]') : null
  if (!el || !vue.dom.contains(el)) {
    // À côté du texte (la marge de la poignée) : le bloc à cette hauteur.
    const r = vue.dom.getBoundingClientRect()
    const dedans = document.elementFromPoint(Math.min(Math.max(x, r.left + 8), r.right - 8), y)
    el = dedans instanceof Element ? dedans.closest<HTMLElement>('[data-bloc]') : null
    if (!el || !vue.dom.contains(el)) return null
  }
  let pos: number
  try {
    pos = vue.posAtDOM(el, 0)
  } catch {
    return null
  }
  const ou = blocA(vue.state.doc.resolve(Math.min(pos, vue.state.doc.content.size)))
  if (ou === null) return null
  const noeud = vue.state.doc.nodeAt(ou)
  if (!noeud?.attrs.id || SANS_POIGNEE.has(noeud.type.name)) return null
  const dom = vue.nodeDOM(ou)
  return dom instanceof HTMLElement ? { id: noeud.attrs.id as string, pos: ou, dom } : null
}

/** La hauteur de la première ligne d'un bloc, pour y centrer la poignée. */
function premiereLigne(dom: HTMLElement): number {
  const style = getComputedStyle(dom)
  const ligne = Number.parseFloat(style.lineHeight)
  return Number.isFinite(ligne) ? ligne : 24
}

export function Poignee({ editeur, zone, ouvrirMenu }: Props) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const [depot, setDepot] = useState<Depot | null>(null)
  const [rectangle, setRectangle] = useState<{ x: number; y: number; l: number; h: number } | null>(null)
  const tire = useRef(false)

  // Le survol : la poignée suit le bloc sous la souris ; une frappe la cache jusqu'au prochain mouvement.
  useEffect(() => {
    const z = zone.current
    if (!z) return
    const bouger = (e: PointerEvent) => {
      if (tire.current || e.buttons) return
      const b = blocSous(editeur, e.clientX, e.clientY)
      if (!b) return setSurvol((s) => (s && (e.target as Element).closest?.('.notak-blocs-poignee') ? s : null))
      const rz = z.getBoundingClientRect()
      const rb = b.dom.getBoundingClientRect()
      const ligne = premiereLigne(b.dom)
      setSurvol({ id: b.id, pos: b.pos, haut: rb.top - rz.top + z.scrollTop + Math.max(0, (ligne - 24) / 2), gauche: rb.left - rz.left })
    }
    const taper = () => setSurvol(null)
    z.addEventListener('pointermove', bouger)
    z.addEventListener('pointerleave', taper)
    editeur.view.dom.addEventListener('keydown', taper)
    return () => {
      z.removeEventListener('pointermove', bouger)
      z.removeEventListener('pointerleave', taper)
      editeur.view.dom.removeEventListener('keydown', taper)
    }
  }, [editeur, zone])

  // Le rectangle : il part de la marge (hors du texte) et choisit les blocs qu'il touche.
  useEffect(() => {
    const z = zone.current
    if (!z) return
    const bas = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest('.notak-blocs-poignee, .ProseMirror > *, .notak-note-marge')) return
      // L'éditeur ne voit pas cet appui : sa propre sélection à la souris ne doit pas se mêler au rectangle.
      e.preventDefault()
      const rz = z.getBoundingClientRect()
      const x0 = e.clientX
      const y0 = e.clientY
      let bouge = false
      const bouger = (m: PointerEvent) => {
        if (!bouge && Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return
        bouge = true
        m.preventDefault()
        const gauche = Math.min(x0, m.clientX)
        const haut = Math.min(y0, m.clientY)
        const l = Math.abs(m.clientX - x0)
        const h = Math.abs(m.clientY - y0)
        setRectangle({ x: gauche - rz.left, y: haut - rz.top + z.scrollTop, l, h })
        // Les blocs touchés, dans l'ordre de lecture : du premier au dernier.
        const touches = new Set<string>()
        for (const el of editeur.view.dom.querySelectorAll<HTMLElement>('[data-bloc]')) {
          const r = el.getBoundingClientRect()
          if (r.right < gauche || r.left > gauche + l || r.bottom < haut || r.top > haut + h) continue
          const ou = blocA(editeur.state.doc.resolve(Math.min(editeur.view.posAtDOM(el, 0), editeur.state.doc.content.size)))
          const id = ou === null ? null : (editeur.state.doc.nodeAt(ou)?.attrs.id as string | null)
          if (id) touches.add(id)
        }
        const ordre = parcours(editeur.state.doc)
          .map((b) => b.id!)
          .filter((id) => touches.has(id))
        const vue = editeur.view
        if (ordre.length) vue.dispatch(choisir(vue.state, { ancre: ordre[0]!, tete: ordre[ordre.length - 1]! }))
        else if (CLE_CHOIX.getState(vue.state)) vue.dispatch(vue.state.tr.setMeta(CLE_CHOIX, null))
      }
      const haut = () => {
        window.removeEventListener('pointermove', bouger, true)
        window.removeEventListener('pointerup', haut, true)
        setRectangle(null)
        const vue = editeur.view
        if (!bouge) {
          // Un simple appui dans la marge : le curseur va au texte le plus proche, à cette hauteur.
          const r = vue.dom.getBoundingClientRect()
          const ou = vue.posAtCoords({ left: Math.min(Math.max(x0, r.left + 1), r.right - 1), top: y0 })
          if (ou) vue.dispatch(vue.state.tr.setSelection(TextSelection.near(vue.state.doc.resolve(ou.pos))))
        }
        vue.focus()
      }
      window.addEventListener('pointermove', bouger, true)
      window.addEventListener('pointerup', haut, true)
    }
    z.addEventListener('pointerdown', bas)
    return () => z.removeEventListener('pointerdown', bas)
  }, [editeur, zone])

  // Le glisser de la poignée.
  const tirer = (e: React.PointerEvent, s: Survol) => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX
    const y0 = e.clientY
    const vue = editeur.view
    // Le bloc fait partie des blocs choisis : on les tire tous ; sinon lui seul.
    const choisis = blocsChoisis(vue.state)
    const ids = choisis.includes(s.id) ? choisis : [s.id]
    let bouge = false
    let ici: Depot | null = null
    const bouger = (m: PointerEvent) => {
      if (!bouge && Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return
      if (!bouge) {
        bouge = true
        tire.current = true
        if (!choisis.includes(s.id)) vue.dispatch(choisir(vue.state, { ancre: s.id, tete: s.id }))
      }
      const z = zone.current
      const b = blocSous(editeur, m.clientX, m.clientY)
      if (!z || !b || ids.includes(b.id)) {
        ici = null
        return setDepot(null)
      }
      const rz = z.getBoundingClientRect()
      const rb = b.dom.getBoundingClientRect()
      const cote: Cote = m.clientY < rb.top + rb.height / 2 ? 'dessus' : 'dessous'
      ici = { id: b.id, cote, haut: (cote === 'dessus' ? rb.top : rb.bottom) - rz.top + z.scrollTop, gauche: rb.left - rz.left, largeur: rb.width }
      setDepot(ici)
    }
    const lacher = (u: PointerEvent) => {
      window.removeEventListener('pointermove', bouger, true)
      window.removeEventListener('pointerup', lacher, true)
      tire.current = false
      setDepot(null)
      if (!bouge) {
        // Un clic : le bloc est choisi et son menu s'ouvre.
        vue.dispatch(choisir(vue.state, { ancre: s.id, tete: s.id }))
        ouvrirMenu()
        return
      }
      const tr = ici ? deplacer(vue.state, ids, ici.id, ici.cote, u.altKey) : null
      // Les blocs déplacés restent choisis ; une copie laisse le texte.
      if (tr) vue.dispatch(choisir(vue.state, u.altKey ? null : { ancre: ids[0]!, tete: ids[ids.length - 1]! }, tr))
      vue.focus()
    }
    window.addEventListener('pointermove', bouger, true)
    window.addEventListener('pointerup', lacher, true)
  }

  // `+` : un bloc vide dessous (⌥ : dessus), où `/` ouvre aussitôt le menu.
  const ajouter = (e: React.MouseEvent, s: Survol) => {
    const vue = editeur.view
    const noeud = vue.state.doc.nodeAt(s.pos)
    if (!noeud) return
    const ou = e.altKey ? s.pos : s.pos + noeud.nodeSize
    const $ou = vue.state.doc.resolve(ou)
    if (!$ou.parent.canReplaceWith($ou.index(), $ou.index(), vue.state.schema.nodes.paragraph!)) return
    const tr = vue.state.tr.insert(ou, vue.state.schema.nodes.paragraph!.create())
    vue.dispatch(tr.setSelection(TextSelection.create(tr.doc, ou + 1)).scrollIntoView())
    vue.focus()
    editeur.commands.insertContent('/')
  }

  return (
    <>
      {survol && !depot && (
        <div className="notak-blocs-poignee" style={{ top: survol.haut, left: survol.gauche }} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="notak-blocs-poignee-plus" title={t('blocs.ajouter')} aria-label={t('blocs.ajouter')} onMouseDown={(e) => e.preventDefault()} onClick={(e) => ajouter(e, survol)}>
            +
          </button>
          <button type="button" className="notak-blocs-poignee-tenir" title={t('blocs.poignee')} aria-label={t('blocs.poignee')} onPointerDown={(e) => tirer(e, survol)}>
            ⋮⋮
          </button>
        </div>
      )}
      {depot && <div className="notak-blocs-depot" style={{ top: depot.haut - 2, left: depot.gauche, width: depot.largeur }} aria-hidden />}
      {rectangle && <div className="notak-blocs-rectangle" style={{ left: rectangle.x, top: rectangle.y, width: rectangle.l, height: rectangle.h }} aria-hidden />}
    </>
  )
}
