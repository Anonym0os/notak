import { t } from './langue'
import { type FormEvent, useEffect, useState } from 'react'
import {
  type Fournisseur,
  type Moi,
  connexionFournisseur,
  demanderReinitialisation,
  jetonReinitialisation,
  moyensConnexion,
  reinitialiser,
  seConnecter,
  sInscrire,
} from './api'

type Mode = 'connexion' | 'inscription' | 'oubli' | 'nouveau'

const NOMS_FOURNISSEURS: Record<Fournisseur, string> = { google: 'Google', microsoft: 'Microsoft', github: 'GitHub' }

/** L'erreur qu'un fournisseur a renvoyée en revenant (`?error=…`), et l'adresse nettoyée de ce qui ne sert plus. */
function erreurDeRetour(): string | null {
  const p = new URLSearchParams(location.search)
  const erreur = p.get('error')
  if (erreur) history.replaceState(null, '', location.pathname)
  return erreur ? t('connexion.fournisseurRefuse') : null
}

/** L'écran d'entrée : se connecter, créer un compte, ou retrouver l'accès par un nouveau mot de passe. */
export function EcranConnexion({ surConnexion }: { surConnexion(moi: Moi): void }) {
  const [jeton] = useState(jetonReinitialisation)
  const [mode, setMode] = useState<Mode>(jeton ? 'nouveau' : 'connexion')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState<string | null>(erreurDeRetour)
  const [avis, setAvis] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [courriel, setCourriel] = useState(false)

  useEffect(() => {
    void moyensConnexion().then((m) => {
      setFournisseurs(m.fournisseurs)
      setCourriel(m.courriel)
    })
  }, [])

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    const adresse = email.trim().toLowerCase()
    if (mode !== 'nouveau' && !adresse.includes('@')) return setErreur(t('connexion.adresseInvalide'))
    if (mode === 'inscription' && !nom.trim()) return setErreur(t('connexion.nomRequis'))
    if ((mode === 'inscription' || mode === 'nouveau') && motDePasse.length < 8) return setErreur(t('connexion.mdpCourt'))
    setErreur(null)
    setEnvoi(true)
    try {
      if (mode === 'oubli') {
        await demanderReinitialisation(adresse)
        setAvis(t('connexion.lienEnvoye'))
        setMode('connexion')
      } else if (mode === 'nouveau') {
        await reinitialiser(jeton!, motDePasse)
        history.replaceState(null, '', '/')
        setAvis(t('connexion.mdpChange'))
        setMotDePasse('')
        setMode('connexion')
      } else {
        surConnexion(mode === 'inscription' ? await sInscrire(adresse, motDePasse, nom.trim()) : await seConnecter(adresse, motDePasse))
        return
      }
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
    }
    setEnvoi(false)
  }

  const passerA = (m: Mode) => {
    setMode(m)
    setErreur(null)
    setAvis(null)
  }

  const avecFournisseur = async (f: Fournisseur) => {
    setErreur(null)
    try {
      await connexionFournisseur(f)
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
    }
  }

  const titreBouton = {
    connexion: t('connexion.seConnecter'),
    inscription: t('connexion.creer'),
    oubli: t('connexion.envoyerLien'),
    nouveau: t('connexion.changerMdp'),
  }[mode]

  return (
    <main className="connexion">
      <form className="connexion-carte" onSubmit={valider} noValidate>
        <h1>Notak</h1>
        {mode === 'oubli' && <p className="connexion-aide">{t(courriel ? 'connexion.oubliAide' : 'connexion.oubliSansCourriel')}</p>}
        {mode === 'inscription' && (
          <label>
            {t('connexion.nom')}
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" autoFocus />
          </label>
        )}
        {mode !== 'nouveau' && (
          <label>
            {t('connexion.adresse')}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus={mode !== 'inscription'} />
          </label>
        )}
        {mode !== 'oubli' && (
          <label>
            {mode === 'nouveau' ? t('connexion.nouveauMdp') : t('connexion.mdp')}
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
              autoFocus={mode === 'nouveau'}
            />
          </label>
        )}
        {erreur && (
          <p className="connexion-erreur" role="alert">
            {erreur}
          </p>
        )}
        {avis && (
          <p className="connexion-avis" role="status">
            {avis}
          </p>
        )}
        <button type="submit" className="bouton bouton-plein" disabled={envoi}>
          {titreBouton}
        </button>
        {mode === 'connexion' && fournisseurs.length > 0 && (
          <div className="connexion-fournisseurs">
            <span className="connexion-ou">{t('connexion.ou')}</span>
            {fournisseurs.map((f) => (
              <button key={f} type="button" className="bouton" onClick={() => void avecFournisseur(f)}>
                {t('connexion.avec', { fournisseur: NOMS_FOURNISSEURS[f] })}
              </button>
            ))}
          </div>
        )}
        {mode === 'connexion' && (
          <button type="button" className="bouton-lien" onClick={() => passerA('oubli')}>
            {t('connexion.oubli')}
          </button>
        )}
        <button type="button" className="bouton-lien" onClick={() => passerA(mode === 'connexion' ? 'inscription' : 'connexion')}>
          {mode === 'connexion' ? t('connexion.creer') : t('connexion.dejaCompte')}
        </button>
      </form>
    </main>
  )
}
