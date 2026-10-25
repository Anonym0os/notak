import { lireReglages, themeEffectif, useHabillages, useSystemeSombre } from '@notak/tableau'
import { t } from './langue'
import { Marque } from './PageApp'
import { type FormEvent, useEffect, useState } from 'react'
import {
  type Fournisseur,
  type Instance,
  type Moi,
  connexionFournisseur,
  connexionSso,
  demanderReinitialisation,
  jetonReinitialisation,
  moyensConnexion,
  reinitialiser,
  seConnecter,
  sInscrire,
} from './api'

type Mode = 'connexion' | 'inscription' | 'oubli' | 'nouveau' | 'sso'

const NOMS_FOURNISSEURS: Record<Fournisseur, string> = { google: 'Google', microsoft: 'Microsoft', github: 'GitHub' }

/** L'erreur qu'un fournisseur a renvoyée en revenant (`?error=…`), et l'adresse nettoyée de ce qui ne sert plus. */
function erreurDeRetour(): string | null {
  const p = new URLSearchParams(location.search)
  const erreur = p.get('error')
  if (erreur) history.replaceState(null, '', location.pathname)
  return erreur ? t('connexion.fournisseurRefuse') : null
}

/**
 * L'écran d'entrée : se connecter, créer un compte quand le serveur l'accepte, ou retrouver l'accès par un nouveau mot
 * de passe. Il porte déjà le nom de l'instance et son thème (celui qu'elle impose, sinon celui choisi sur cet
 * appareil, sinon celui qu'elle propose).
 */
export function EcranConnexion({ instance, surConnexion }: { instance: Instance; surConnexion(moi: Moi): void }) {
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  useHabillages({ fournis: instance.habillages, ...(instance.impose ? { impose: instance.impose } : {}), ...(instance.parDefaut ? { parDefaut: instance.parDefaut } : {}) }, reglages.habillage, theme)
  const ouvertes = instance.inscriptions === 'ouvertes'
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
      if (mode === 'sso') {
        await connexionSso(adresse)
        return
      } else if (mode === 'oubli') {
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
    sso: t('connexion.continuerSso'),
  }[mode]

  return (
    <div className="notak-espace" data-theme={theme}>
      <main className="connexion">
        <form className="connexion-carte" onSubmit={valider} noValidate>
          <Marque />
          <h1>{instance.nom}</h1>
          {mode === 'oubli' && <p className="connexion-aide">{t(courriel ? 'connexion.oubliAide' : 'connexion.oubliSansCourriel')}</p>}
          {mode === 'sso' && <p className="connexion-aide">{t('connexion.ssoAide')}</p>}
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
          {mode !== 'oubli' && mode !== 'sso' && (
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
          {mode === 'connexion' && (
            <div className="connexion-fournisseurs">
              <span className="connexion-ou">{t('connexion.ou')}</span>
              {fournisseurs.map((f) => (
                <button key={f} type="button" className="bouton" onClick={() => void avecFournisseur(f)}>
                  {t('connexion.avec', { fournisseur: NOMS_FOURNISSEURS[f] })}
                </button>
              ))}
              <button type="button" className="bouton" onClick={() => passerA('sso')}>
                {t('connexion.sso')}
              </button>
            </div>
          )}
          <div className="connexion-liens">
            {mode === 'connexion' && (
              <button type="button" className="bouton-lien" onClick={() => passerA('oubli')}>
                {t('connexion.oubli')}
              </button>
            )}
            {mode !== 'connexion' ? (
              <button type="button" className="bouton-lien" onClick={() => passerA('connexion')}>
                {t('connexion.dejaCompte')}
              </button>
            ) : ouvertes ? (
              <button type="button" className="bouton-lien" onClick={() => passerA('inscription')}>
                {t('connexion.creer')}
              </button>
            ) : (
              <p className="connexion-note">{t('connexion.fermees')}</p>
            )}
          </div>
        </form>
      </main>
    </div>
  )
}
