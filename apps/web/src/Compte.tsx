import { useEffect, useState } from 'react'
import { type Moi, type TableauAccessible, listerTableaux } from './api'

/** Le menu au nom de la personne connectée, avec les tableaux que d'autres lui partagent. */
export function Compte({ moi, deconnexion, ouvrir }: { moi: Moi; deconnexion(): void; ouvrir(id: string): void }) {
  const [ouvert, setOuvert] = useState(false)
  const [partages, setPartages] = useState<TableauAccessible[] | null>(null)
  useEffect(() => {
    if (!ouvert) return
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.compte') && setOuvert(false)
    document.addEventListener('pointerdown', hors)
    // La liste se relit à chaque ouverture : un partage peut arriver à tout moment.
    let vivant = true
    listerTableaux().then(
      (t) => vivant && setPartages(t.filter((x) => x.role !== 'proprietaire')),
      () => vivant && setPartages([]),
    )
    return () => {
      vivant = false
      document.removeEventListener('pointerdown', hors)
    }
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
          {partages && partages.length > 0 && (
            <>
              <small className="compte-rubrique">Partagés avec moi</small>
              {partages.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOuvert(false)
                    ouvrir(t.id)
                  }}
                >
                  {t.titre || 'Sans titre'}
                  {t.role === 'lecture' && <small> · lecture</small>}
                </button>
              ))}
            </>
          )}
          <button type="button" role="menuitem" onClick={deconnexion}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
