import { useEffect, useRef, useState } from 'react'
import { pourcentage } from './vueZoom'

/** La pastille disparaît quand plus rien n'a changé pendant ce temps, en millisecondes. */
export const DELAI_PASTILLE_ZOOM = 1000

/**
 * Le zoom en cours, dit au centre du bas de la toile : une pastille blanche qui paraît à chaque changement
 * d'échelle, s'efface une seconde après le dernier, et ramène à 100 % d'un clic.
 */
export function PastilleZoom({ echelle, remettre }: { echelle: number; remettre(): void }) {
  const [visible, setVisible] = useState(false)
  const avant = useRef(echelle)
  useEffect(() => {
    if (avant.current === echelle) return
    avant.current = echelle
    setVisible(true)
    const minuteur = setTimeout(() => setVisible(false), DELAI_PASTILLE_ZOOM)
    return () => clearTimeout(minuteur)
  }, [echelle])
  return (
    <button type="button" className="notak-zoom-pastille" data-visible={visible || undefined} tabIndex={-1} aria-hidden={!visible} onPointerDown={(e) => e.stopPropagation()} onClick={remettre}>
      {pourcentage(echelle)} %
    </button>
  )
}
