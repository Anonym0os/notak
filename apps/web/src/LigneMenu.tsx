import type { MouseEvent, ReactNode } from 'react'
import { Icone, type NomIcone } from '@notak/tableau'

/** Une rangée de menu : l'icône pâle, le libellé sur une ligne, son détail dessous, et sa touche au bout. */
export function LigneMenu({
  icone,
  libelle,
  detail,
  touche,
  href,
  onClick,
}: {
  icone: NomIcone
  libelle: ReactNode
  detail?: ReactNode
  touche?: string
  href?: string
  onClick?(e: MouseEvent): void
}) {
  const contenu = (
    <>
      <Icone nom={icone} taille={18} />
      <span className="app-menu-texte">
        <span>{libelle}</span>
        {detail && <small>{detail}</small>}
      </span>
      {touche && <kbd>{touche}</kbd>}
    </>
  )
  return href ? (
    <a role="menuitem" className="app-menu-ligne" href={href} onClick={onClick}>
      {contenu}
    </a>
  ) : (
    <button type="button" role="menuitem" className="app-menu-ligne" onClick={onClick}>
      {contenu}
    </button>
  )
}
