import { useState } from 'react'
import { MODELES } from '../../modeles/catalogue'
import type { ModeleTableau } from '../../modeles/construire'
import { Surcouche } from '../surcouche'
import { ApercuModele } from './ApercuModele'

/**
 * Le choix d'un modèle pour un tableau neuf : la liste à gauche, l'aperçu et son résumé à droite.
 * « Tableau vide » ou Échap laissent le tableau comme il est.
 */
export function ChoixModele({ choisir, laisser }: { choisir(m: ModeleTableau): void; laisser(): void }) {
  const [courant, setCourant] = useState<ModeleTableau>(MODELES[0]!)
  const aller = (e: React.KeyboardEvent): boolean => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return false
    const rang = MODELES.indexOf(courant) + (e.key === 'ArrowDown' ? 1 : -1)
    setCourant(MODELES[(rang + MODELES.length) % MODELES.length]!)
    e.preventDefault()
    return true
  }
  return (
    <Surcouche etiquette="Choisir un modèle de tableau" className="notak-modeles-fond" fermer={laisser} surTouche={aller}>
      <div className="notak-modeles">
        <div className="notak-modeles-tete">
          <strong>Un modèle pour ce tableau</strong>
          <button type="button" aria-label="Fermer" onClick={laisser}>
            ×
          </button>
        </div>
        <div className="notak-modeles-corps">
          <ul className="notak-modeles-liste" role="listbox" aria-label="Modèles">
            {MODELES.map((m) => (
              <li key={m.id}>
                <button type="button" role="option" aria-selected={m === courant} onClick={() => setCourant(m)} onDoubleClick={() => choisir(m)}>
                  {m.titre}
                </button>
              </li>
            ))}
          </ul>
          <div className="notak-modeles-detail">
            <ApercuModele modele={courant} />
            <p>{courant.resume}</p>
          </div>
        </div>
        <div className="notak-modeles-pied">
          <button type="button" onClick={laisser}>
            Tableau vide
          </button>
          <button type="button" className="notak-modeles-valider" onClick={() => choisir(courant)}>
            Utiliser « {courant.titre} »
          </button>
        </div>
      </div>
    </Surcouche>
  )
}
