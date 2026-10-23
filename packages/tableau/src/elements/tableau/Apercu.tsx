import { useEffect, useRef, useState } from 'react'
import { type Element, type Tableau, surLeTableau } from '../../coeur/tableau'
import { FOND_NOTE } from '../note/couleurs'
import { definition } from '../registre'
import { t } from '../../langue'

/** Le survol d'un tableau montre son plan après ce délai, en millisecondes. */
const DELAI_APERCU = 600
/** Au plus tant d'éléments dessinés : au-delà, le plan reste lisible et rapide. */
const MAX_DESSINES = 200

/** La hauteur probable d'un élément, en UG, sans le mesurer : de quoi dessiner un plan. */
function hauteurProbable(e: Element): number {
  const c = e.contenu
  if (c.type === 'image') return (e.largeur * c.hauteurOrigine) / c.largeurOrigine
  if (e.hauteur && 'max' in e.hauteur) return e.hauteur.max
  if (e.hauteur && 'min' in e.hauteur) return e.hauteur.min
  return definition(c.type)?.hauteurParDefaut ?? 6
}

const fondDe = (e: Element) => {
  const c = e.contenu as { couleur?: string }
  if (c.couleur && c.couleur in FOND_NOTE) return FOND_NOTE[c.couleur as keyof typeof FOND_NOTE]
  if (e.contenu.type === 'colonne') return '#e3e6ea'
  if (e.contenu.type === 'image') return '#c9ced6'
  return '#ffffff'
}

/** Le plan d'un tableau : ses éléments posés, en petit, à leur place et dans leur couleur. */
export function PlanTableau({ tableau }: { tableau: Tableau }) {
  const libres = surLeTableau(tableau)
    .filter((e) => !e.parent && definition(e.contenu.type)?.calque !== 'lignes')
    .slice(0, MAX_DESSINES)
  if (libres.length === 0) return <div className="notak-renvoi-apercu-vide">{t('tableau.vide')}</div>
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  const boites = libres.map((e) => {
    const h = hauteurProbable(e)
    ;[x0, y0, x1, y1] = [Math.min(x0, e.x), Math.min(y0, e.y), Math.max(x1, e.x + e.largeur), Math.max(y1, e.y + h)]
    return { e, h }
  })
  const marge = 4
  return (
    <svg viewBox={`${x0 - marge} ${y0 - marge} ${x1 - x0 + 2 * marge} ${y1 - y0 + 2 * marge}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {boites.map(({ e, h }) => (
        <rect key={e.id} x={e.x} y={e.y} width={e.largeur} height={h} rx={0.6} fill={fondDe(e)} stroke="rgb(0 0 0 / 0.12)" strokeWidth={0.4} />
      ))}
    </svg>
  )
}

/**
 * Le plan d'un tableau, au survol de sa carte : il paraît après un instant immobile, et part dès qu'on bouge
 * vers autre chose, qu'on appuie ou qu'on glisse.
 */
export function useApercuAuSurvol() {
  const [vu, setVu] = useState(false)
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(minuteur.current), [])
  const cacher = () => {
    clearTimeout(minuteur.current)
    setVu(false)
  }
  return {
    vu,
    proprietes: {
      onPointerEnter: (e: React.PointerEvent) => {
        if (e.buttons !== 0 || e.pointerType === 'touch') return
        clearTimeout(minuteur.current)
        minuteur.current = setTimeout(() => setVu(true), DELAI_APERCU)
      },
      onPointerLeave: cacher,
      onPointerDown: cacher,
    },
  }
}
