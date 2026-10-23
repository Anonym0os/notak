import { useCallback, useEffect, useState } from 'react'
import { type ActiviteTableau, type EvenementActivite, type GroupeActivite, lireActivite } from './api'
import { phraseDuGroupe } from './phrases'
import { langue, t } from './langue'

const RAFRAICHIR_MS = 8000

/** Une date dite comme on la dit : « à l'instant », « il y a 5 min », « il y a 3 h », puis le jour. */
export function quand(instant: number, maintenant = Date.now()): string {
  const s = Math.max(0, (maintenant - instant) / 1000)
  if (s < 60) return t('fil.instant')
  if (s < 3600) return t('fil.minutes', { n: Math.floor(s / 60) })
  if (s < 86_400) return t('fil.heures', { n: Math.floor(s / 3600) })
  return new Date(instant).toLocaleDateString(langue() === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Le bouton « Activité » et son panneau : ce que chacun a fait sur le tableau ouvert, regroupé.
 * Tant que le tableau est ouvert, l'activité se relit d'elle-même ; `surNouveaux` reçoit ce qui est arrivé depuis.
 */
export function Activite({
  tableau,
  moi,
  surNouveaux,
}: {
  tableau: string
  moi: string
  surNouveaux?(tableau: string, evenements: EvenementActivite[], moi: string): void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [activite, setActivite] = useState<ActiviteTableau | null>(null)
  const [erreur, setErreur] = useState(false)

  // Relue en continu, panneau fermé aussi : ce que les autres viennent de faire se met en valeur sur la toile.
  useEffect(() => {
    let vivant = true
    let dernier: number | undefined
    setActivite(null)
    setErreur(false)
    const lire = () => {
      if (document.hidden) return
      lireActivite(tableau, dernier).then(
        (a) => {
          if (!vivant) return
          setErreur(false)
          if (dernier === undefined) setActivite(a)
          else if (a.evenements.length > 0) {
            // Du neuf : on relit tout, les groupes en dépendent.
            void lireActivite(tableau).then((t) => vivant && setActivite(t), () => {})
          }
          // La première lecture ne met rien en valeur (ce qui s'est passé avant l'ouverture est de l'histoire),
          // mais elle dit quel tableau est ouvert.
          surNouveaux?.(tableau, dernier === undefined ? [] : a.evenements, moi)
          dernier = a.dernier
        },
        () => vivant && setErreur(true),
      )
    }
    lire()
    const minuteur = setInterval(lire, RAFRAICHIR_MS)
    return () => {
      vivant = false
      clearInterval(minuteur)
    }
  }, [tableau, moi, surNouveaux])

  const fermer = useCallback(() => setOuvert(false), [])
  useEffect(() => {
    if (!ouvert) return
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    const hors = (e: PointerEvent) => !(e.target as HTMLElement).closest('.activite') && fermer()
    document.addEventListener('keydown', touche)
    document.addEventListener('pointerdown', hors)
    return () => {
      document.removeEventListener('keydown', touche)
      document.removeEventListener('pointerdown', hors)
    }
  }, [ouvert, fermer])

  return (
    <div className="activite">
      <button type="button" className="bouton" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        {t('activite.titre')}
      </button>
      {ouvert && (
        <div className="activite-panneau" role="dialog" aria-label={t('activite.titre')}>
          {erreur && !activite && <p className="partage-note">{t('activite.indisponible')}</p>}
          {activite && activite.groupes.length === 0 && <p className="partage-note">{t('activite.rien')}</p>}
          <ol className="activite-liste">
            {activite?.groupes.map((g, i) => (
              <Ligne key={`${g.auteur.id}-${g.fin}-${i}`} groupe={g} moi={moi} />
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function Ligne({ groupe, moi }: { groupe: GroupeActivite; moi: string }) {
  const citees = groupe.elements.filter((e) => e.libelle).slice(0, 3)
  return (
    <li>
      <span className="activite-pastille" style={{ background: groupe.auteur.couleur }} aria-hidden />
      <div className="activite-texte">
        <p>
          <strong>{groupe.auteur.id === moi ? t('activite.vous') : groupe.auteur.nom}</strong> {phraseDuGroupe(groupe, groupe.auteur.id === moi)}
        </p>
        {citees.length > 0 && <small className="activite-elements">{citees.map((e) => `« ${e.libelle} »`).join(', ')}</small>}
        <small>{quand(groupe.fin)}</small>
      </div>
    </li>
  )
}
