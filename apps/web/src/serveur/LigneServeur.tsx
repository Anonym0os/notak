import { useState } from 'react'
import { revenirIci } from '../bureau'
import { t } from '../langue'

/**
 * Sur l'écran de connexion de l'app de bureau : à quel serveur l'on parle, de quoi en changer, et de quoi revenir aux
 * toiles de cet ordinateur sans se connecter à rien. La coque emmène la fenêtre (`revenir_ici`) ; si elle refuse, on le dit.
 */
export function LigneServeur() {
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
  return (
    <div className="connexion-bureau">
      <p className="connexion-serveur">
        <span>{t('serveur.connexion.serveur')}</span> <strong>{location.host}</strong>
        <span aria-hidden> · </span>
        <button type="button" className="bouton-lien" disabled={enCours} onClick={() => void aller('acces')}>
          {t('serveur.connexion.changer')}
        </button>
      </p>
      <button type="button" className="bouton-lien connexion-local" disabled={enCours} onClick={() => void aller('local')}>
        {t('serveur.connexion.local')}
      </button>
      {echec && (
        <p className="connexion-erreur" role="alert">
          {t('serveur.connexion.retourImpossible')}
        </p>
      )}
    </div>
  )
}
