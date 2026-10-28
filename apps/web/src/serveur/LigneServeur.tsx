import { useState } from 'react'
import { revenirIci } from '../bureau'
import { t } from '../langue'
import { surAppareil } from '../bureau/acces'

/**
 * Sur l'écran de connexion de l'app de bureau : à quel serveur l'on parle, de quoi en changer, et de quoi ouvrir les
 * toiles de cet ordinateur sans se connecter à rien (pour cette fois : le démarrage de Notak ne change pas). La coque
 * emmène la fenêtre (`revenir_ici`) ; si elle refuse, on le dit. Les deux gestes se montrent cliquables : des liens, dans
 * la couleur d'accent et soulignés.
 */
export function LigneServeur({ localEnBouton = false }: { localEnBouton?: boolean }) {
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState(false)
  async function aller(ecran: 'acces' | 'local') {
    setEnCours(true)
    setEchec(false)
    try {
      await revenirIci(ecran)
    } catch {
      setEchec(true)
    }
    // La coque emmène la fenêtre : ce qui reste ici ne sert que si elle ne l'a pas fait.
    setEnCours(false)
  }
  const local = t(surAppareil() ? 'serveur.connexion.local.appareil' : 'serveur.connexion.local')
  return (
    <div className="connexion-bureau">
      {/* Quand le serveur ne répond pas, les toiles d'ici sont la vraie sortie : un bouton, au-dessus du reste. */}
      {localEnBouton && (
        <button type="button" className="bouton connexion-local-bouton" disabled={enCours} onClick={() => void aller('local')}>
          {local}
        </button>
      )}
      <p className="connexion-serveur">
        <span>{t('serveur.connexion.serveur')}</span> <strong>{location.host}</strong>
        <span aria-hidden> · </span>
        <button type="button" className="bouton-lien" disabled={enCours} onClick={() => void aller('acces')}>
          {t('serveur.connexion.changer')}
        </button>
      </p>
      {!localEnBouton && (
        <button type="button" className="bouton-lien connexion-local" disabled={enCours} onClick={() => void aller('local')}>
          {local}
        </button>
      )}
      {echec && (
        <p className="connexion-erreur" role="alert">
          {t('serveur.retourImpossible')}
        </p>
      )}
    </div>
  )
}
