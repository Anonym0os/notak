import type { ReactNode } from 'react'

/** Le filet entre deux blocs ou deux groupes de lignes. */
export function Separateur({ className }: { className?: string | undefined }) {
  return <hr className={['notak-filet', className].filter(Boolean).join(' ')} />
}

/**
 * Une ligne de réglage : le libellé à gauche, le contrôle à droite. `aide` est l'infobulle de toute la ligne ; `vertical`
 * pose une petite légende au-dessus d'un contrôle de toute la largeur.
 */
export function LigneReglage({
  libelle,
  aide,
  inactif,
  vertical,
  className,
  children,
}: {
  libelle?: string | undefined
  aide?: string | undefined
  inactif?: boolean | undefined
  vertical?: boolean | undefined
  className?: string | undefined
  children?: ReactNode
}) {
  return (
    <div className={['notak-reglage', className].filter(Boolean).join(' ')} title={aide} data-inactif={inactif ? '' : undefined} data-vertical={vertical ? '' : undefined}>
      {libelle && (
        <span className="notak-reglage-libelle" title={libelle}>
          {libelle}
        </span>
      )}
      {children}
    </div>
  )
}
