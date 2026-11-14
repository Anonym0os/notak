import { useEffect, useRef, useState } from 'react'
import { Touches } from './communs'
import { auDoigt } from './doigt'
import { Icone } from './icones'
import { t } from './langue'
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

/**
 * Plus aucun élément dans la vue : un petit bouton paraît au centre du bas, à la place de la pastille du zoom (elle
 * monte au-dessus de lui quand elle paraît aussi), et ramène la vue sur tout le contenu, comme « Tout voir ». Au
 * bureau, il dit sa touche, Z ; au doigt, il n'y a pas de clavier à rappeler.
 */
export function BoutonRecentrer({ visible, recentrer }: { visible: boolean; recentrer(): void }) {
  // Les gestes de la toile ne commencent pas sous lui : ni lasso, ni note créée d'un double-clic, ni menu du fond.
  const garder = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <button
      type="button"
      className="notak-recentrer"
      data-visible={visible || undefined}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      title={t('vue.recentrer.aide')}
      onPointerDown={garder}
      onDoubleClick={garder}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={recentrer}
    >
      <Icone nom="menuCentrer" taille={16} />
      <span>{t('vue.recentrer')}</span>
      {!auDoigt() && <Touches touches="Z" />}
    </button>
  )
}
