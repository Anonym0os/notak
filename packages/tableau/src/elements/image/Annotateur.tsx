import { useEffect, useRef } from 'react'
import type { Element, Image, Trait } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { type Point2, CRAYON_PX, GOMME_PX, ajouterPoint, avecTraits, cheminTrait, couleurSure, epaisseurPour, gommer, versImage } from './annotation'
import { annoter, useAnnotation } from './modeAnnotation'
import { largeurEntiereAffichee } from './tailles'

/** Les traits d'une image, en SVG par-dessus elle : l'espace du dessin est celui des pixels de l'image d'origine. */
export function Traits({ contenu, traits, style }: { contenu: Image; traits: readonly Trait[]; style: React.CSSProperties }) {
  return (
    <svg
      className="notak-traits"
      viewBox={`0 0 ${contenu.largeurOrigine} ${contenu.hauteurOrigine}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={style}
    >
      {traits.map((t, i) => (
        <path
          key={i}
          d={cheminTrait(t, contenu)}
          fill="none"
          stroke={couleurSure(t.couleur)}
          strokeWidth={t.epaisseur * contenu.largeurOrigine}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

type Geste = { outil: 'crayon'; points: Point2[]; trait: Omit<Trait, 'points'> } | { outil: 'gomme'; restants: Trait[]; touche: boolean }

/**
 * La couche qui prend le crayon ou la gomme au-dessus de l'image. Un tracé fait un pas d'historique ; passer la
 * gomme sur plusieurs traits aussi. `brouillon` montre le dessin pendant le geste (`null` : rien en cours). Échap sort.
 */
export function Annotateur({
  element,
  contexte,
  brouillon,
}: {
  element: Element<Image>
  contexte: ContexteToile
  brouillon(traits: Trait[] | null): void
}) {
  const { outil, couleur } = useAnnotation()
  const boite = useRef<HTMLDivElement>(null)
  const geste = useRef<Geste | null>(null)

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      annoter(null)
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])

  const actuel = (): Image => (contexte.magasin.lire().elements.find((e) => e.id === element.id)?.contenu as Image | undefined) ?? element.contenu
  const point = (e: React.PointerEvent): { p: Point2; largeurPx: number } | null => {
    const r = boite.current?.getBoundingClientRect()
    if (!r || r.width === 0 || r.height === 0) return null
    return { p: versImage((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, actuel()), largeurPx: r.width }
  }

  const descendre = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const vise = point(e)
    if (!vise) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const c = actuel()
    if (outil === 'crayon') {
      const largeurImage = largeurEntiereAffichee(c, vise.largeurPx)
      geste.current = { outil: 'crayon', points: [vise.p], trait: { couleur, epaisseur: epaisseurPour(CRAYON_PX, largeurImage) } }
      brouillon([...(c.traits ?? []), { ...geste.current.trait, points: [vise.p] }])
    } else {
      geste.current = { outil: 'gomme', restants: [...(c.traits ?? [])], touche: false }
      passerLaGomme(vise.p, vise.largeurPx, c)
    }
  }

  const passerLaGomme = (p: Point2, largeurPx: number, c: Image) => {
    const g = geste.current
    if (g?.outil !== 'gomme') return
    const apres = gommer(g.restants, p, GOMME_PX / largeurEntiereAffichee(c, largeurPx), c)
    if (apres.length === g.restants.length) return
    g.restants = apres
    g.touche = true
    brouillon(apres)
  }

  const bouger = (e: React.PointerEvent) => {
    const g = geste.current
    if (!g) return
    const vise = point(e)
    if (!vise) return
    const c = actuel()
    if (g.outil === 'crayon') {
      const points = ajouterPoint(g.points, vise.p, c)
      if (points === g.points) return
      g.points = points
      brouillon([...(c.traits ?? []), { ...g.trait, points }])
    } else {
      passerLaGomme(vise.p, vise.largeurPx, c)
    }
  }

  const finir = () => {
    const g = geste.current
    geste.current = null
    if (!g) return
    const c = actuel()
    const traits = g.outil === 'crayon' ? [...(c.traits ?? []), { ...g.trait, points: g.points }] : g.touche ? g.restants : null
    brouillon(null)
    if (traits) contexte.magasin.faire([{ type: 'contenu', id: element.id, avant: c, apres: avecTraits(c, traits) }])
  }

  return (
    <div
      ref={boite}
      className="notak-annotation"
      data-outil={outil}
      onPointerDown={descendre}
      onPointerMove={bouger}
      onPointerUp={finir}
      onPointerCancel={finir}
    />
  )
}
