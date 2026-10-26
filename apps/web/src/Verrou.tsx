import { t } from './langue'
import { type FormEvent, useEffect, useId, useState } from 'react'
import { deverrouiller, etatVerrou } from './api'
import { Bouton, Dialogue, Icone } from '@notak/tableau'

/**
 * Un tableau protégé par mot de passe se couvre d'un écran qui le demande. Une fois donné, la page se recharge :
 * la synchronisation, refusée jusque-là, repart avec le droit d'ouvrir.
 */
export function VerrouTableau({ tableau, accueil, ouvrir }: { tableau: string; accueil: string; ouvrir(id: string): void }) {
  const [par, setPar] = useState<string | null>(null)
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const formulaire = useId()

  useEffect(() => {
    let vivant = true
    setPar(null)
    setMotDePasse('')
    setErreur(null)
    etatVerrou(tableau).then(
      (e) => vivant && setPar(e.verrouille ? e.par : null),
      () => {},
    )
    return () => {
      vivant = false
    }
  }, [tableau])

  if (par === null) return null
  const valider = async (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    try {
      await deverrouiller(par, motDePasse)
      location.reload()
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
      setEnvoi(false)
    }
  }
  return (
    <Dialogue
      etiquette={t('verrou.titre')}
      titre={
        <span className="verrou-titre">
          <Icone nom="verrou" taille={22} />
          {t('verrou.titre')}
        </span>
      }
      actions={
        <Bouton type="submit" form={formulaire} variante="principal" disabled={envoi || !motDePasse}>
          {t('commun.ouvrir')}
        </Bouton>
      }
    >
      <form id={formulaire} className="verrou-form" onSubmit={valider} noValidate>
        <p className="connexion-aide">{par === tableau ? t('verrou.ceTableau') : t('verrou.auDessus')}</p>
        <label>
          {t('connexion.mdp')}
          <input className="champ" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="off" autoFocus />
        </label>
        {erreur && (
          <p className="connexion-erreur" role="alert">
            {erreur}
          </p>
        )}
        {tableau !== accueil && (
          <button type="button" className="bouton-lien" onClick={() => ouvrir(accueil)}>
            {t('verrou.accueil')}
          </button>
        )}
      </form>
    </Dialogue>
  )
}
