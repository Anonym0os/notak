import { useEffect, useState } from 'react'
import type { Moi } from '../api'
import { t } from '../langue'
import { COMMANDE_MISE_A_JOUR, type VersionDisponible, ecarterVersion, lireMiseAJourServeur, versionEcartee } from './miseAJourServeur'

/**
 * Une nouvelle version de Notak existe : le bandeau des admins du serveur, et d'eux seuls. Il dit les deux versions, donne
 * la commande à copier, renvoie aux nouveautés (dans le navigateur) et laisse dire « plus tard », jusqu'à la version suivante.
 */
export function BandeauAdmin({ moi }: { moi: Moi }) {
  const [dispo, setDispo] = useState<VersionDisponible | null>(null)
  const [ecartee, setEcartee] = useState(versionEcartee)
  const [copie, setCopie] = useState<'non' | 'oui' | 'echec'>('non')
  const admin = moi.admin === true

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
      // Un presse-papiers refusé (page non sécurisée, webview) : la commande se montre, à copier à la main.
      setCopie('echec')
    }
  }
  const plusTard = () => {
    ecarterVersion(dispo.version)
    setEcartee(dispo.version)
  }

  return (
    <aside className="bandeau bandeau-admin" role="status">
      <span>{t('serveur.maj.disponible', { version: dispo.version, actuelle: dispo.actuelle })}</span>
      <button type="button" className="bouton bouton-plein" title={COMMANDE_MISE_A_JOUR} onClick={() => void copier()}>
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
      {copie === 'echec' && (
        <p className="bandeau-admin-commande">
          {t('serveur.maj.copieEchec')} <code>{COMMANDE_MISE_A_JOUR}</code>
        </p>
      )}
      {dispo.notes && (
        <details className="bandeau-admin-notes">
          <summary>{t('serveur.maj.notes')}</summary>
          <pre>{dispo.notes}</pre>
        </details>
      )}
    </aside>
  )
}
