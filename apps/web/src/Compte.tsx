import { useEffect, useState } from 'react'
import type { Moi } from './api'

/** Le menu au nom de la personne connectée. */
export function Compte({ moi, deconnexion }: { moi: Moi; deconnexion(): void }) {
  const [ouvert, setOuvert] = useState(false)
  useEffect(() => {
    if (!ouvert) return
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.compte') && setOuvert(false)
    document.addEventListener('pointerdown', hors)
    return () => document.removeEventListener('pointerdown', hors)
  }, [ouvert])
  return (
    <div className="compte">
      <button type="button" className="bouton compte-nom" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <span className="compte-pastille" style={{ background: moi.couleur }} aria-hidden>
          {[...moi.nom.trim()][0]?.toLocaleUpperCase('fr') ?? '?'}
        </span>
        {moi.nom}
      </button>
      {ouvert && (
        <div className="compte-menu" role="menu">
          <small>{moi.email}</small>
          <button type="button" role="menuitem" onClick={deconnexion}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
