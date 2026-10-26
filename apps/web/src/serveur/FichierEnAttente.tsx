import { useState } from 'react'
import { useBandeau } from '../bandeaux'
import { revenirIci } from '../bureau'
import { t, tn } from '../langue'
import { useFichiersEnAttente } from './fichiersEnAttente'

/**
 * Une copie a été remise à l'app (un double clic sur un `.notak`, ou les toiles de cet ordinateur confiées au serveur)
 * pendant la connexion, ou quand le serveur ne répond pas : le dialogue de `FichiersOuverts` ne vient qu'une fois connecté,
 * et sans ce mot la personne croirait l'ouverture ratée. Elle attend dans la file de la coque ; ici, on le dit, et un
 * fichier du disque peut s'ouvrir sans attendre, sur cet ordinateur. Rien hors de l'app de bureau.
 */
export function FichierEnAttente() {
  const bandeau = useBandeau<HTMLElement>()
  const file = useFichiersEnAttente()
  const [echec, setEchec] = useState(false)
  if (file.length === 0) return null
  const hote = location.host
  // Les toiles confiées ne s'ouvrent pas ici : elles sont pour ce serveur.
  const fichiers = file.filter((f) => !f.confiee).length
  return (
    <aside ref={bandeau} className="bandeau bandeau-attente" role="status">
      <span>{fichiers > 0 ? tn('serveur.attente.fichier', fichiers, { hote }) : t('serveur.attente.confiee', { hote })}</span>
      {fichiers > 0 && (
        <button
          type="button"
          className="bouton bouton-plein"
          onClick={() => {
            setEchec(false)
            revenirIci('local').catch(() => setEchec(true))
          }}
        >
          {t('serveur.ouverts.ouvrirIci')}
        </button>
      )}
      {echec && (
        <span className="connexion-erreur" role="alert">
          {t('serveur.retourImpossible')}
        </span>
      )}
    </aside>
  )
}
