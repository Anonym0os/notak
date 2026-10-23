import { useEffect, useState } from 'react'
import { PastillePersonne } from '@notak/tableau'
import { type Moi, type TableauAccessible, listerFavoris, listerRecents, listerTableaux } from './api'
import { adressePhoto } from './fichiers'

/** Le menu au nom de la personne connectée, avec les tableaux que d'autres lui partagent. */
export function Compte({ moi, deconnexion, ouvrir, aide }: { moi: Moi; deconnexion(): void; ouvrir(id: string): void; aide(): void }) {
  const [ouvert, setOuvert] = useState(false)
  const [partages, setPartages] = useState<TableauAccessible[] | null>(null)
  const [favoris, setFavoris] = useState<TableauAccessible[]>([])
  const [recents, setRecents] = useState<TableauAccessible[]>([])
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
    listerFavoris().then((l) => vivant && setFavoris(l), () => {})
    listerRecents().then((l) => vivant && setRecents(l), () => {})
    return () => {
      vivant = false
      document.removeEventListener('pointerdown', hors)
    }
  }, [ouvert])
  const aller = (id: string) => {
    setOuvert(false)
    ouvrir(id)
  }
  return (
    <div className="compte">
      <button type="button" className="bouton compte-nom" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <PastillePersonne className="compte-pastille" nom={moi.nom} couleur={moi.couleur} adresse={moi.photo ? adressePhoto(moi.photo) : undefined} titre="" />
        {moi.nom}
      </button>
      {ouvert && (
        <div className="compte-menu" role="menu">
          <small>{moi.email}</small>
          <Rubrique titre="Favoris" tableaux={favoris} ouvrir={aller} />
          <Rubrique titre="Récents" tableaux={recents} ouvrir={aller} />
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOuvert(false)
              aide()
            }}
          >
            Aide <small>· raccourcis</small>
          </button>
          <button type="button" role="menuitem" onClick={deconnexion}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}

/** Une liste de tableaux dans le menu du compte ; rien si elle est vide. */
function Rubrique({ titre, tableaux, ouvrir }: { titre: string; tableaux: TableauAccessible[]; ouvrir(id: string): void }) {
  if (tableaux.length === 0) return null
  return (
    <>
      <small className="compte-rubrique">{titre}</small>
      {tableaux.map((t) => (
        <button key={t.id} type="button" role="menuitem" onClick={() => ouvrir(t.id)}>
          {t.titre || 'Sans titre'}
          {t.role === 'lecture' && <small> · lecture</small>}
        </button>
      ))}
    </>
  )
}
