import { useState } from 'react'
import { decalerMois, initialesDesJours, lundiEnPremier, nomDuMois, semaines } from './mois'
import { t } from '../../langue'
import { Icone } from '../../icones'

/**
 * Le calendrier mensuel du choix d'échéance : on passe d'un mois à l'autre (pas d'un an), six semaines fixes, les
 * jours des mois voisins masqués. Aujourd'hui est cerclé, le jour choisi est en gras et cerclé ; les jours passés
 * sont grisés. Cliquer le jour déjà choisi efface la date.
 */
export function Calendrier({ valeur, aujourdhui, choisir }: { valeur: string | null; aujourdhui: string; choisir(jour: string | null): void }) {
  const depart = (valeur ?? aujourdhui).split('-').map(Number) as [number, number, number]
  const [vu, setVu] = useState({ annee: depart[0], mois: depart[1] - 1 })
  const lundi = lundiEnPremier()
  const aller = (n: number) => setVu((v) => decalerMois(v.annee, v.mois, n))
  return (
    <div className="notak-cal">
      <div className="notak-cal-tete">
        <button type="button" className="notak-cal-fleche" aria-label={t('taches.moisPrecedent')} onClick={() => aller(-1)}>
          <Icone nom="gauche" taille={16} />
        </button>
        <strong className="notak-cal-mois" aria-live="polite">
          {nomDuMois(vu.annee, vu.mois)}
        </strong>
        <button type="button" className="notak-cal-fleche" aria-label={t('taches.moisSuivant')} onClick={() => aller(1)}>
          <Icone nom="droite" taille={16} />
        </button>
      </div>
      <div className="notak-cal-grille" role="grid">
        {initialesDesJours(lundi).map((j, i) => (
          <span key={i} className="notak-cal-initiale" aria-hidden>
            {j}
          </span>
        ))}
        {semaines(vu.annee, vu.mois, lundi).flat().map((jour, i) =>
          jour === null ? (
            <span key={i} className="notak-cal-vide" />
          ) : (
            <button
              key={i}
              type="button"
              className="notak-cal-jour"
              aria-pressed={jour === valeur}
              data-aujourdhui={jour === aujourdhui ? '' : undefined}
              data-passe={jour < aujourdhui ? '' : undefined}
              // Un jour passé ne se choisit plus ; s'il est déjà choisi, on peut encore l'effacer.
              disabled={jour < aujourdhui && jour !== valeur}
              onClick={() => choisir(jour === valeur ? null : jour)}
            >
              {Number(jour.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
