import { useEffect, useMemo, useState } from 'react'
import type { Moi } from '../api'
import { t } from '../langue'
import { COMMANDE_MISE_A_JOUR, GUIDE_MISE_A_JOUR, type VersionDisponible, ecarterVersion, lireMiseAJourServeur, lireNotes, versionEcartee } from './miseAJourServeur'
import { useBandeau } from '../bandeaux'

/**
 * Une nouvelle version de Notak existe : le bandeau des admins du serveur, et d'eux seuls. Il dit les deux versions, montre
 * la commande à lancer sur le serveur (pour l'installation avec l'image publiée et son compose.yaml) et la copie, renvoie aux
 * nouveautés et au guide des autres installations (dans le navigateur) et laisse dire « plus tard » : il se tait pour sept
 * jours, ou jusqu'à la version suivante.
 *
 * Ce n'est pas une région `status` : elle serait relue en entier à chaque copie et à chaque ouverture des notes. Seul le
 * résultat de la copie s'annonce (une région toujours là, dont le texte change), et son échec (une alerte).
 */
export function BandeauAdmin({ moi }: { moi: Moi }) {
  const bandeau = useBandeau<HTMLElement>()
  const [dispo, setDispo] = useState<VersionDisponible | null>(null)
  const [ecartee, setEcartee] = useState(versionEcartee)
  const [copie, setCopie] = useState<'non' | 'oui' | 'echec'>('non')
  const admin = moi.admin === true
  const notes = useMemo(() => (dispo?.notes ? lireNotes(dispo.notes) : []), [dispo])

  useEffect(() => {
    if (!admin) return
    let vivant = true
    void lireMiseAJourServeur().then((d) => vivant && setDispo(d))
    return () => {
      vivant = false
    }
  }, [admin])

  useEffect(() => {
    if (copie !== 'oui') return
    const minuteur = setTimeout(() => setCopie('non'), 2500)
    return () => clearTimeout(minuteur)
  }, [copie])

  if (!admin || !dispo || ecartee === dispo.version) return null

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(COMMANDE_MISE_A_JOUR)
      setCopie('oui')
    } catch {
      // Un presse-papiers refusé (page non sécurisée, webview) : la commande est là, à copier à la main.
      setCopie('echec')
    }
  }
  const plusTard = () => {
    ecarterVersion(dispo.version)
    setEcartee(dispo.version)
  }

  return (
    <aside ref={bandeau} className="bandeau bandeau-admin" aria-label={t('serveur.maj.titre')}>
      <span>{t('serveur.maj.disponible', { version: dispo.version, actuelle: dispo.actuelle })}</span>
      <button type="button" className="bouton bouton-plein" onClick={() => void copier()}>
        {copie === 'oui' ? t('serveur.maj.copiee') : t('serveur.maj.copier')}
      </button>
      {dispo.adresse && (
        <a className="bouton-lien" href={dispo.adresse} target="_blank" rel="noopener noreferrer">
          {t('maj.nouveautes')}
        </a>
      )}
      <button type="button" className="bouton-lien" onClick={plusTard}>
        {t('maj.plusTard')}
      </button>
      <span className="sr-seulement" role="status">
        {copie === 'oui' ? t('serveur.maj.copiee') : ''}
      </span>
      <p className="bandeau-admin-commande">
        {t('serveur.maj.commande')} <code>{COMMANDE_MISE_A_JOUR}</code>
      </p>
      {copie === 'echec' && (
        <p className="bandeau-admin-commande" role="alert">
          {t('serveur.maj.copieEchec')}
        </p>
      )}
      {/* La commande ne vaut que pour l'installation courante : les autres installations ont leur guide. */}
      <p className="bandeau-admin-commande">
        <a href={GUIDE_MISE_A_JOUR} target="_blank" rel="noopener noreferrer">
          {t('serveur.maj.autres')}
        </a>
      </p>
      {notes.length > 0 && (
        <details className="bandeau-admin-notes">
          <summary>{t('serveur.maj.notes')}</summary>
          <div className="bandeau-admin-notes-corps">
            {notes.map((b, i) =>
              b.type === 'liste' ? (
                <ul key={i}>
                  {b.puces.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              ) : (
                <p key={i}>{b.texte}</p>
              ),
            )}
          </div>
        </details>
      )}
    </aside>
  )
}
