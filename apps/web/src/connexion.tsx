import { type FormEvent, useState } from 'react'
import { type Moi, seConnecter, sInscrire } from './api'

/** L'écran d'entrée : se connecter, ou créer un compte. */
export function EcranConnexion({ surConnexion }: { surConnexion(moi: Moi): void }) {
  const [inscription, setInscription] = useState(false)
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (!adresse.includes('@')) return setErreur('Adresse invalide')
    if (inscription && !nom.trim()) return setErreur('Dis-nous ton nom')
    if (inscription && motDePasse.length < 8) return setErreur('8 caractères au moins')
    setErreur(null)
    setEnvoi(true)
    try {
      surConnexion(inscription ? await sInscrire(adresse, motDePasse, nom.trim()) : await seConnecter(adresse, motDePasse))
    } catch (x) {
      setErreur(x instanceof Error ? x.message : 'Échec')
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
        <h1>Notak</h1>
        {inscription && (
          <label>
            Nom
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" autoFocus />
          </label>
        )}
        <label>
          Adresse
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus={!inscription}
          />
        </label>
        <label>
          Mot de passe
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
          {inscription ? 'Créer un compte' : 'Se connecter'}
        </button>
        <button type="button" className="bouton-lien" onClick={basculer}>
          {inscription ? 'J’ai déjà un compte' : 'Créer un compte'}
        </button>
      </form>
    </main>
  )
}
