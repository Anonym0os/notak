import { type HTMLAttributes, type ReactNode, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { type AncreFigee, suivreDefilement, defilement } from './menuAncre'
import { placerBulle } from './bullePosition'

/**
 * Un panneau posé à la place de la bulle (docs/NOTION.md § 4.2) : sa place est calculée une fois, sur la fin de la
 * sélection mesurée à l'apparition, et ne suit plus rien, sauf le défilement de la page.
 */

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** La fin de la sélection, mesurée quand la bulle est apparue. */
  ancre: AncreFigee
  /** Un nœud de l'éditeur : le défilement de la page se compte depuis lui. */
  racine: Element
  hote?: HTMLElement | null
  children: ReactNode
}

export function BulleFixe({ ancre, racine, hote, className, children, style, ...reste }: Props) {
  const noeud = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const poser = () => {
      const div = noeud.current
      if (!div) return
      const fin = suivreDefilement(ancre.boite, ancre.defil, defilement(racine))
      const { left, top } = placerBulle(fin, { largeur: div.offsetWidth, hauteur: div.offsetHeight }, { largeur: window.innerWidth, hauteur: window.innerHeight })
      div.style.left = `${left}px`
      div.style.top = `${top}px`
    }
    poser()
    window.addEventListener('scroll', poser, true)
    window.addEventListener('resize', poser)
    return () => {
      window.removeEventListener('scroll', poser, true)
      window.removeEventListener('resize', poser)
    }
  }, [ancre, racine])
  return createPortal(
    <div ref={noeud} className={className} style={{ position: 'fixed', top: 0, left: 0, ...style }} {...reste}>
      {children}
    </div>,
    hote ?? document.body,
  )
}
