import { lireReglages, themeEffectif, useHabillages, useSystemeSombre } from '@notak/tableau'
import { t } from './langue'
import { type FormEvent, useState } from 'react'
import { type Instance, type Moi, seConnecter, sInscrire } from './api'

/**
 * L'écran d'entrée : se connecter, ou créer un compte quand le serveur l'accepte. Il porte déjà le nom de l'instance
 * et son thème (celui qu'elle impose, sinon celui choisi sur cet appareil, sinon celui qu'elle propose).
 */
export function EcranConnexion({ instance, surConnexion }: { instance: Instance; surConnexion(moi: Moi): void }) {
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  useHabillages({ fournis: instance.habillages, ...(instance.impose ? { impose: instance.impose } : {}), ...(instance.parDefaut ? { parDefaut: instance.parDefaut } : {}) }, reglages.habillage, theme)
  const ouvertes = instance.inscriptions === 'ouvertes'
  const [inscription, setInscription] = useState(false)
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!adresse.includes('@')) return setErreur(t('connexion.adresseInvalide'))
    if (inscription && !nom.trim()) return setErreur(t('connexion.nomRequis'))
    if (inscription && motDePasse.length < 8) return setErreur(t('connexion.mdpCourt'))
    setErreur(null)
    setEnvoi(true)
    try {
      surConnexion(inscription ? await sInscrire(adresse, motDePasse, nom.trim()) : await seConnecter(adresse, motDePasse))
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
      setEnvoi(false)
    }
  }

  const basculer = () => {
    setInscription((i) => !i)
    setErreur(null)
  }

  return (
    <main className="connexion">
      <form className="connexion-carte" onSubmit={valider} noValidate>
        <h1>{instance.nom}</h1>
        {inscription && (
          <label>
            {t('connexion.nom')}
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" autoFocus />
          </label>
        )}
        <label>
          {t('connexion.adresse')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus={!inscription}
          />
        </label>
        <label>
          {t('connexion.mdp')}
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete={inscription ? 'new-password' : 'current-password'}
          />
        </label>
        {erreur && (
          <p className="connexion-erreur" role="alert">
            {erreur}
          </p>
        )}
        <button type="submit" className="bouton bouton-plein" disabled={envoi}>
          {inscription ? t('connexion.creer') : t('connexion.seConnecter')}
        </button>
        {ouvertes ? (
          <button type="button" className="bouton-lien" onClick={basculer}>
            {inscription ? t('connexion.dejaCompte') : t('connexion.creer')}
          </button>
        ) : (
          <p className="connexion-note">{t('connexion.fermees')}</p>
        )}
      </form>
    </main>
  )
}
