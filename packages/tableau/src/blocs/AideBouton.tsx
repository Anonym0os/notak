import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../langue'
import { morceauxAide, placerAide } from './aidePoignee'

/** Les deux lignes de la bulle de chaque bouton de la poignée : les clés de langue. */
export const AIDES = {
  tenir: ['selection.aide.tenir.1', 'selection.aide.tenir.2'],
  plus: ['selection.aide.plus.1', 'selection.aide.plus.2'],
} as const

export type BoutonAide = keyof typeof AIDES

/** La bulle d'aide d'un bouton de la poignée : fixe dans l'hôte des menus, sous le bouton, sans jamais prendre la souris. */
export function AideBouton({ bouton, cle, hote }: { bouton: HTMLElement; cle: BoutonAide; hote: HTMLElement | null }) {
  const noeud = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const div = noeud.current
    if (!div) return
    const p = placerAide(bouton.getBoundingClientRect(), { largeur: div.offsetWidth, hauteur: div.offsetHeight }, { largeur: window.innerWidth, hauteur: window.innerHeight })
    div.style.left = `${p.left}px`
    div.style.top = `${p.top}px`
    div.style.visibility = ''
  })
  return createPortal(
    <div ref={noeud} className="notak-blocs-aide" role="tooltip" style={{ visibility: 'hidden' }}>
      {AIDES[cle].map((k) => (
        <div key={k}>
          {morceauxAide(t(k)).map((m, i) => (m.clair ? <b key={i}>{m.texte}</b> : <span key={i}>{m.texte}</span>))}
        </div>
      ))}
    </div>,
    hote ?? document.body,
  )
}
