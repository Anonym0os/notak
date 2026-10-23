import { useState } from 'react'
import { t, useLangue } from '../../langue'
import { modelesDe } from '../../modeles/langues'
import type { ModeleTableau } from '../../modeles/construire'
import { Surcouche } from '../surcouche'
import { ApercuModele } from './ApercuModele'

/**
 * Le choix d'un modèle pour un tableau neuf : la liste à gauche, l'aperçu et son résumé à droite.
 * « Tableau vide » ou Échap laissent le tableau comme il est.
 */
export function ChoixModele({ choisir, laisser }: { choisir(m: ModeleTableau): void; laisser(): void }) {
  // Le catalogue suit la langue ; le modèle choisi se retient par son identifiant, pour survivre à un changement de langue.
  const MODELES = modelesDe(useLangue())
  const [choisi, setChoisi] = useState(MODELES[0]!.id)
  const courant = MODELES.find((m) => m.id === choisi) ?? MODELES[0]!
  const setCourant = (m: ModeleTableau) => setChoisi(m.id)
  const aller = (e: React.KeyboardEvent): boolean => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return false
    const rang = MODELES.indexOf(courant) + (e.key === 'ArrowDown' ? 1 : -1)
    setCourant(MODELES[(rang + MODELES.length) % MODELES.length]!)
    e.preventDefault()
    return true
  }
  return (
    <Surcouche etiquette={t('modele.choisir')} className="notak-modeles-fond" fermer={laisser} surTouche={aller}>
      <div className="notak-modeles">
        <div className="notak-modeles-tete">
          <strong>{t('modele.titre')}</strong>
          <button type="button" aria-label={t('commun.fermer')} onClick={laisser}>
            ×
          </button>
        </div>
        <div className="notak-modeles-corps">
          <ul className="notak-modeles-liste" role="listbox" aria-label={t('modele.liste')}>
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
            {t('modele.vide')}
          </button>
          <button type="button" className="notak-modeles-valider" onClick={() => choisir(courant)}>
            {t('modele.utiliser', { titre: courant.titre })}
          </button>
        </div>
      </div>
    </Surcouche>
  )
}
