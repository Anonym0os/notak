import { useEffect, useState } from 'react'
import { type ActiviteTableau, type EvenementActivite, type GroupeActivite, lireActivite } from './api'
import { phraseDuGroupe } from './phrases'
import { t } from './langue'
import { Icone, formaterDate } from '@notak/tableau'
import { usePanneau } from './panneaux'

const RAFRAICHIR_MS = 8000

/** Une date dite comme on la dit : « à l'instant », « il y a 5 min », « il y a 3 h », puis le jour. */
export function quand(instant: number, maintenant = Date.now()): string {
  const s = Math.max(0, (maintenant - instant) / 1000)
  if (s < 60) return t('fil.instant')
  if (s < 3600) return t('fil.minutes', { n: Math.floor(s / 60) })
  if (s < 86_400) return t('fil.heures', { n: Math.floor(s / 3600) })
  return formaterDate(instant, 'court')
}

/**
 * L'activité du tableau ouvert, relue en continu, panneau fermé aussi : ce que les autres viennent de faire se met en
 * valeur sur la toile. `surNouveaux` reçoit ce qui est arrivé depuis.
 */
export function useActivite(tableau: string, moi: string, surNouveaux?: (tableau: string, evenements: EvenementActivite[], moi: string) => void) {
  const [activite, setActivite] = useState<ActiviteTableau | null>(null)
  const [erreur, setErreur] = useState(false)

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

  return { activite, erreur }
}

/** Les groupes de l'activité, du plus récent au plus ancien ; rien, ou une panne, se disent. */
export function ListeActivite({ activite, erreur, moi }: { activite: ActiviteTableau | null; erreur: boolean; moi: string }) {
  return (
    <>
      {((erreur && !activite) || activite?.groupes.length === 0) && (
        <p className="app-panneau-vide">
          <Icone nom="activite" taille={22} trait={1.5} />
          {erreur && !activite ? t('activite.indisponible') : t('activite.rien')}
        </p>
      )}
      <ol className="activite-liste">
        {activite?.groupes.map((g, i) => (
          <Ligne key={`${g.auteur.id}-${g.fin}-${i}`} groupe={g} moi={moi} />
        ))}
      </ol>
    </>
  )
}

/** Le bouton « Activité » et son panneau : ce que chacun a fait sur le tableau ouvert, regroupé. */
export function Activite({
  tableau,
  moi,
  surNouveaux,
}: {
  tableau: string
  moi: string
  surNouveaux?(tableau: string, evenements: EvenementActivite[], moi: string): void
}) {
  const { ouvert, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  const { activite, erreur } = useActivite(tableau, moi, surNouveaux)

  return (
    <div className="activite" ref={ancre}>
      <button type="button" ref={bouton} className="bouton" aria-expanded={ouvert} onClick={basculer}>
        <Icone nom="activite" taille={16} />
        {t('activite.titre')}
      </button>
      {ouvert && (
        <div className="app-panneau activite-panneau" ref={panneau} role="dialog" aria-label={t('activite.titre')}>
          <ListeActivite activite={activite} erreur={erreur} moi={moi} />
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
        {citees.length > 0 && <small className="activite-elements">{citees.map((e) => t('activite.citee', { libelle: e.libelle })).join(', ')}</small>}
        <small>{quand(groupe.fin)}</small>
      </div>
    </li>
  )
}
