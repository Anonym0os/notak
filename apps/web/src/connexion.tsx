import { Icone, lireReglages, themeEffectif, useHabillages, useSystemeSombre } from '@notak/tableau'
import { t } from './langue'
import { Marque } from './PageApp'
import { estServeurDansApp } from './bureau'
import { ConnexionParCode } from './serveur/ConnexionParCode'
import { FichierEnAttente } from './serveur/FichierEnAttente'
import { LigneServeur } from './serveur/LigneServeur'
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
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
/** Les bornes du serveur (`apps/serveur/src/auth.ts`) : le champ les tient, la personne n'a pas à les découvrir par un refus. */
const MDP_MIN = 8
const MDP_MAX = 200
const NOM_MAX = 80
const ADRESSE_MAX = 254

/**
 * L'erreur qu'un fournisseur a renvoyée en revenant (`?error=…`), et l'adresse nettoyée de ce qui ne sert plus : le
 * reste de la requête demeure (le code que la page « Autoriser l'app de bureau » attend, par exemple).
 */
function erreurDeRetour(): string | null {
  const p = new URLSearchParams(location.search)
  const erreur = p.get('error')
  if (erreur) {
    p.delete('error')
    p.delete('error_description')
    history.replaceState(null, '', location.pathname + (p.size ? `?${p}` : ''))
  }
  return erreur ? t('connexion.fournisseurRefuse') : null
}

/** Une adresse plausible : quelque chose, une arobase, un domaine avec un point. Le serveur juge du reste. */
export const adressePlausible = (adresse: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)

/**
 * L'écran d'entrée : se connecter, créer un compte quand le serveur l'accepte, ou retrouver l'accès par un nouveau mot
 * de passe. Il porte déjà le nom de l'instance et son thème (celui qu'elle impose, sinon celui choisi sur cet
 * appareil, sinon celui qu'elle propose).
 *
 * Ce qui aide sans se voir : les champs que remplissent les gestionnaires de mots de passe (`autocomplete`), le mot de
 * passe qu'on peut afficher, les majuscules verrouillées signalées, la règle du mot de passe dite avant le refus, un
 * bouton qui dit qu'il travaille, et après « trop d'essais », combien attendre.
 */
export function EcranConnexion({
  instance,
  surConnexion,
  entete,
  email: emailPropose,
  notice,
}: {
  instance: Instance
  surConnexion(moi: Moi): void
  /** Ce qui précède le formulaire : une invitation qu'on vient d'ouvrir, et qu'on acceptera une fois connecté. */
  entete?: ReactNode
  /** L'adresse à proposer (celle de l'invitation) : la créer devient alors le premier geste. */
  email?: string
  /** Ce qu'il faut savoir en arrivant ici : la session a pris fin, ou la page où l'on revient après s'être connecté. */
  notice?: { texte: string; urgent?: boolean }
}) {
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  useHabillages({ fournis: instance.habillages, ...(instance.impose ? { impose: instance.impose } : {}), ...(instance.parDefaut ? { parDefaut: instance.parDefaut } : {}) }, reglages.habillage, theme)
  const ouvertes = instance.inscriptions === 'ouvertes'
  const [jeton] = useState(jetonReinitialisation)
  const [mode, setMode] = useState<Mode>(jeton ? 'nouveau' : emailPropose && ouvertes ? 'inscription' : 'connexion')
  const [email, setEmail] = useState(emailPropose ?? '')
  const [motDePasse, setMotDePasse] = useState('')
  const [nom, setNom] = useState('')
  const [voir, setVoir] = useState(false)
  const [majuscules, setMajuscules] = useState(false)
  const [erreur, setErreur] = useState<string | null>(erreurDeRetour)
  /** Le champ que l'erreur concerne, s'il y en a un : il se marque, et reprend le curseur. */
  const [fautif, setFautif] = useState<'nom' | 'email' | 'mdp' | null>(null)
  const [avis, setAvis] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [courriel, setCourriel] = useState(false)
  const champs = useRef<HTMLFormElement>(null)
  // Dans l'app (ordinateur ou téléphone), la fenêtre ne va pas chez le fournisseur : le navigateur de la personne s'en charge
  // (`serveur/appareil.ts`). Google refuse les vues web intégrées, sur iOS comme ailleurs.
  const enApp = estServeurDansApp()
  const [parCode, setParCode] = useState(false)

  useEffect(() => {
    void moyensConnexion().then((m) => {
      setFournisseurs(m.fournisseurs)
      setCourriel(m.courriel)
    })
  }, [])

  // Le curseur va au premier champ du mode choisi, ou à celui qui pose problème.
  useEffect(() => {
    const cible = fautif ? champs.current?.querySelector<HTMLInputElement>(`[data-champ="${fautif}"]`) : champs.current?.querySelector<HTMLElement>('input, button[type=submit]')
    cible?.focus()
  }, [mode, fautif, parCode])

  const echouer = (message: string, champ: typeof fautif = null) => {
    setErreur(message)
    setFautif(champ)
  }

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    if (envoi) return
    const adresse = email.trim().toLowerCase()
    if (mode === 'inscription' && !nom.trim()) return echouer(t('connexion.nomRequis'), 'nom')
    // Dans l'app, l'adresse du SSO se donne dans le navigateur, pas ici.
    if (mode === 'sso' && enApp) return setParCode(true)
    if (mode !== 'nouveau' && !adressePlausible(adresse)) return echouer(t('connexion.adresseInvalide'), 'email')
    if ((mode === 'inscription' || mode === 'nouveau') && motDePasse.length < MDP_MIN) return echouer(t('connexion.mdpCourt'), 'mdp')
    if (mode === 'connexion' && !motDePasse) return echouer(t('connexion.mdpRequis'), 'mdp')
    setErreur(null)
    setFautif(null)
    setAvis(null)
    setEnvoi(true)
    try {
      if (mode === 'sso') {
        // La page part chez le fournisseur : le bouton reste « Un instant… » jusqu'au départ.
        await connexionSso(adresse)
        return
      } else if (mode === 'oubli') {
        await demanderReinitialisation(adresse)
        // Le lien du courriel s'ouvre dans le navigateur, pas dans cette fenêtre : on le dit avant qu'on le cherche ici.
        setAvis(t('connexion.lienEnvoyeA', { adresse }) + (enApp ? ` ${t('serveur.connexion.lienNavigateur')}` : ''))
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
      // Un mot de passe refusé : on le garde (pour l'afficher et le corriger), et le curseur y revient.
      echouer(x instanceof Error ? x.message : t('commun.echec'), mode === 'connexion' || mode === 'nouveau' ? 'mdp' : null)
    }
    setEnvoi(false)
  }

  const passerA = (m: Mode) => {
    setMode(m)
    setErreur(null)
    setFautif(null)
    setAvis(null)
    setVoir(false)
  }

  const avecFournisseur = async (f: Fournisseur) => {
    if (envoi) return
    if (enApp) return setParCode(true)
    setErreur(null)
    setEnvoi(true)
    try {
      await connexionFournisseur(f)
    } catch (x) {
      setErreur(x instanceof Error ? x.message : t('commun.echec'))
      setEnvoi(false)
    }
  }

  const surTouche = (e: KeyboardEvent<HTMLInputElement>) => setMajuscules(e.getModifierState?.('CapsLock') ?? false)

  const titreBouton = {
    connexion: t('connexion.seConnecter'),
    inscription: t('connexion.creer'),
    oubli: t('connexion.envoyerLien'),
    nouveau: t('connexion.changerMdp'),
    sso: t(enApp ? 'serveur.connexion.continuerNavigateur' : 'connexion.continuerSso'),
  }[mode]
  const nouveauMdp = mode === 'inscription' || mode === 'nouveau'
  // Ce qui décrit chaque champ pour un lecteur d'écran : sa règle, et l'erreur quand elle le concerne.
  const decrit = (champ: NonNullable<typeof fautif>, ...autres: (string | false)[]) =>
    [...autres, fautif === champ && erreur ? 'connexion-erreur' : false].filter(Boolean).join(' ') || undefined

  if (parCode) {
    return (
      <div className="notak-espace" data-theme={theme}>
        <main className="connexion">
          <ConnexionParCode surConnexion={surConnexion} annuler={() => setParCode(false)} />
        </main>
        {enApp && <FichierEnAttente />}
      </div>
    )
  }

  return (
    <div className="notak-espace" data-theme={theme}>
      <main className="connexion">
        <form className="connexion-carte" onSubmit={valider} noValidate ref={champs} aria-busy={envoi}>
          <Marque />
          <h1>{instance.nom}</h1>
          {entete}
          {notice && (
            <p className="connexion-avis connexion-notice" role={notice.urgent ? 'alert' : 'status'}>
              {notice.texte}
            </p>
          )}
          {mode === 'oubli' && <p className="connexion-aide">{t(courriel ? 'connexion.oubliAide' : 'connexion.oubliSansCourriel')}</p>}
          {mode === 'oubli' && enApp && <p className="connexion-aide">{t('serveur.connexion.oubliNavigateur')}</p>}
          {mode === 'sso' && <p className="connexion-aide">{t(enApp ? 'serveur.connexion.ssoNavigateur' : 'connexion.ssoAide')}</p>}
          {mode === 'inscription' && (
            <label>
              {t('connexion.nom')}
              <input
                data-champ="nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                autoComplete="name"
                maxLength={NOM_MAX}
                enterKeyHint="next"
                aria-invalid={fautif === 'nom' || undefined}
                aria-describedby={decrit('nom')}
              />
            </label>
          )}
          {mode !== 'nouveau' && !(mode === 'sso' && enApp) && (
            <label>
              {t('connexion.adresse')}
              <input
                data-champ="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={mode === 'sso' ? 'email' : 'username'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={ADRESSE_MAX}
                enterKeyHint={mode === 'oubli' || mode === 'sso' ? 'send' : 'next'}
                aria-invalid={fautif === 'email' || undefined}
                aria-describedby={decrit('email')}
              />
            </label>
          )}
          {mode !== 'oubli' && mode !== 'sso' && (
            <label>
              {mode === 'nouveau' ? t('connexion.nouveauMdp') : t('connexion.mdp')}
              <span className="connexion-mdp">
                <input
                  data-champ="mdp"
                  type={voir ? 'text' : 'password'}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  onKeyDown={surTouche}
                  onKeyUp={surTouche}
                  onBlur={() => setMajuscules(false)}
                  autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={MDP_MAX}
                  enterKeyHint="go"
                  aria-invalid={fautif === 'mdp' || undefined}
                  aria-describedby={decrit('mdp', nouveauMdp && 'connexion-regle', majuscules && 'connexion-majuscules')}
                />
                <button
                  type="button"
                  className="connexion-voir"
                  aria-pressed={voir}
                  aria-label={voir ? t('connexion.cacherMdp') : t('connexion.voirMdp')}
                  title={voir ? t('connexion.cacherMdp') : t('connexion.voirMdp')}
                  onClick={() => setVoir((v) => !v)}
                >
                  <Icone nom="oeil" taille={16} />
                </button>
              </span>
              {majuscules && (
                <small id="connexion-majuscules" className="connexion-indice" role="status">
                  {t('connexion.majuscules')}
                </small>
              )}
              {nouveauMdp && (
                <small id="connexion-regle" className="connexion-indice">
                  {t('connexion.mdpRegle')}
                </small>
              )}
            </label>
          )}
          {erreur && (
            <p id="connexion-erreur" className="connexion-erreur" role="alert">
              {erreur}
            </p>
          )}
          {avis && (
            <p className="connexion-avis" role="status">
              {avis}
            </p>
          )}
          <button type="submit" className="bouton bouton-plein" disabled={envoi}>
            {envoi ? t('connexion.enCours') : titreBouton}
          </button>
          {/* Dans la fenêtre de l'app, ni extension ni trousseau ne remplissent le formulaire : le navigateur, où ils servent, peut faire la connexion. */}
          {enApp && mode === 'connexion' && (
            <div className="connexion-navigateur">
              <button type="button" className="bouton-lien" disabled={envoi} aria-describedby="connexion-navigateur-aide" onClick={() => setParCode(true)}>
                {t('serveur.connexion.dansNavigateur')}
              </button>
              <small id="connexion-navigateur-aide" className="connexion-indice">
                {t('serveur.connexion.dansNavigateurAide')}
              </small>
            </div>
          )}
          {mode === 'connexion' && (
            <div className="connexion-fournisseurs">
              <span className="connexion-ou">{t('connexion.ou')}</span>
              {fournisseurs.map((f) => (
                <button key={f} type="button" className="bouton" disabled={envoi} onClick={() => void avecFournisseur(f)}>
                  {t('connexion.avec', { fournisseur: NOMS_FOURNISSEURS[f] })}
                </button>
              ))}
              <button type="button" className="bouton" disabled={envoi} onClick={() => passerA('sso')}>
                {t('connexion.sso')}
              </button>
              {enApp && <p className="connexion-note">{t('serveur.connexion.ouvreNavigateur')}</p>}
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
          {enApp && <LigneServeur />}
        </form>
      </main>
      {/* Une copie ouverte pendant la connexion attend : elle se propose une fois connecté. */}
      {enApp && <FichierEnAttente />}
    </div>
  )
}
