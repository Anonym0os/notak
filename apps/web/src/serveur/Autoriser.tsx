import { Icone } from '@notak/tableau'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { type DemandeBureau, ErreurApi, type Moi, lireDemandeBureau, ouvrirCodeBureau, repondreCodeBureau, sessionEncoreValide, signalerSessionFinie } from '../api'
import { langue, t } from '../langue'
import { PageApp } from '../PageApp'
import { CLIENT_BUREAU, FIN_FEUILLE_IOS, RETOUR_APP_IOS, codePlausible, epeler, grouperCode, navigateurIos, normaliserCode, ouverteParLApp } from './appareil'

/** Les refus du serveur qui disent que ce code-là ne se traite pas, quoi qu'on retente. */
const CODES_DEFINITIFS = new Set(['invalid_request', 'expired_token', 'access_denied'])

type Etat =
  | { type: 'saisie'; erreur: string | null }
  | { type: 'charge' }
  | { type: 'pret'; demande: DemandeBureau | null; envoi: 'autoriser' | 'refuser' | null; erreur: string | null }
  | { type: 'fait'; autorise: boolean }
  | { type: 'impossible'; message: string }

/** Le code que l'adresse porte (`?user_code=`), tel qu'on le lit : l'adresse est ce que n'importe qui peut écrire. */
function codeDeLAdresse(): string | null {
  const brut = new URLSearchParams(location.search).get('user_code')
  return brut === null ? null : normaliserCode(brut.slice(0, 64))
}

/** D'où et quand : « 26 oct. 2026, 14:03 (il y a 2 minutes) ». */
export function quandEnMots(quand: number, maintenant: number): string {
  const l = langue()
  const date = new Intl.DateTimeFormat(l, { dateStyle: 'medium', timeStyle: 'short' }).format(quand)
  const minutes = Math.round((maintenant - quand) / 60_000)
  const relatif = minutes < 1 ? t('serveur.autoriser.alInstant') : minutes < 90 ? new Intl.RelativeTimeFormat(l, { numeric: 'auto' }).format(-minutes, 'minute') : null
  return relatif ? `${date} (${relatif})` : date
}

/** Ouvre le code pour ce compte, puis lit d'où l'app l'a demandé : ce que la personne doit voir avant de décider. */
async function charger(code: string): Promise<Etat> {
  try {
    const { statut, client } = await ouvrirCodeBureau(code)
    if (statut !== 'pending') return { type: 'impossible', message: t('serveur.autoriser.dejaFait') }
    if (client === null) {
      // Un code que le serveur ne confie pas à ce compte : un autre l'a pris en main, ou la session vient de finir.
      if (!(await sessionEncoreValide())) return { type: 'charge' }
      return { type: 'impossible', message: t('erreur.appareil_autre_compte') }
    }
    if (client !== CLIENT_BUREAU) return { type: 'impossible', message: t('erreur.appareil_inconnu') }
    return { type: 'pret', demande: await lireDemandeBureau(code), envoi: null, erreur: null }
  } catch (x) {
    return { type: 'impossible', message: x instanceof Error ? x.message : t('commun.echec') }
  }
}

/**
 * La page où l'on confirme la connexion d'une app Notak, de bureau ou d'iPhone : le code à comparer avec celui de
 * l'app, d'où et quand elle l'a demandé, et un avertissement quand ce n'est pas du réseau où l'on est. « Autoriser »
 * donne à l'app une session sur ce compte ; sans geste ici, rien ne se passe, et le code s'éteint au bout de dix
 * minutes. Sur un iPhone ou un iPad, l'accord donné, un bouton ramène dans l'app ; ouverte par l'app dans sa feuille
 * de connexion (`retour=app`), la page y renvoie d'elle-même (`renvoyer`), et la feuille se ferme.
 */
export function PageAutoriser({ moi, renvoyer = (adresse) => location.assign(adresse) }: { moi: Moi; renvoyer?: (adresse: string) => void }) {
  const [code, setCode] = useState(codeDeLAdresse)
  const [etat, setEtat] = useState<Etat>(() =>
    code === null ? { type: 'saisie', erreur: null } : codePlausible(code) ? { type: 'charge' } : { type: 'impossible', message: t('erreur.appareil_inconnu') },
  )
  const [saisi, setSaisi] = useState('')
  const [maintenant] = useState(Date.now)
  const [ios] = useState(() => navigateurIos())
  const carte = useRef<HTMLElement>(null)

  useEffect(() => {
    if (code === null || !codePlausible(code)) return
    let vivant = true
    setEtat({ type: 'charge' })
    void charger(code).then((e) => vivant && setEtat(e))
    return () => {
      vivant = false
    }
  }, [code])

  // Chaque écran nouveau reprend le curseur sur sa carte : un lecteur d'écran la lit, et rien n'est à un Entrée d'autoriser.
  useEffect(() => {
    carte.current?.focus()
  }, [etat.type])

  const valider = (e: FormEvent) => {
    e.preventDefault()
    const c = normaliserCode(saisi)
    if (!codePlausible(c)) return setEtat({ type: 'saisie', erreur: t('serveur.autoriser.codeMalForme') })
    // Le code reste dans l'adresse : une connexion qui s'interrompt (session finie) revient ici avec lui.
    history.replaceState(null, '', `${location.pathname}?user_code=${encodeURIComponent(c)}`)
    setCode(c)
  }

  const repondre = async (autoriser: boolean) => {
    if (etat.type !== 'pret' || etat.envoi || !code) return
    setEtat({ ...etat, envoi: autoriser ? 'autoriser' : 'refuser', erreur: null })
    try {
      await repondreCodeBureau(code, autoriser)
      setEtat({ type: 'fait', autorise: autoriser })
      if (autoriser && ouverteParLApp()) renvoyer(FIN_FEUILLE_IOS)
    } catch (x) {
      const erreur = x instanceof ErreurApi ? x : null
      // Plus de session : on revient à l'écran de connexion, avec ce code toujours dans l'adresse.
      if (erreur?.statut === 401) return signalerSessionFinie()
      if (erreur?.code && CODES_DEFINITIFS.has(erreur.code)) return setEtat({ type: 'impossible', message: erreur.message })
      setEtat({ ...etat, envoi: null, erreur: x instanceof Error ? x.message : t('commun.echec') })
    }
  }

  // Une demande d'ailleurs, ou dont on ignore l'origine : c'est « Refuser » qui prend la place du bouton principal.
  const suspecte = etat.type === 'pret' && (!etat.demande || etat.demande.ip !== etat.demande.ipActuelle)

  const envoi = etat.type === 'pret' ? etat.envoi : null
  const autoriser = (
    <button key="autoriser" type="button" className={suspecte ? 'bouton' : 'bouton bouton-plein'} disabled={envoi !== null} onClick={() => void repondre(true)}>
      {envoi === 'autoriser' ? t('connexion.enCours') : t('serveur.autoriser.autoriser')}
    </button>
  )
  const refuser = (
    <button key="refuser" type="button" className={suspecte ? 'bouton bouton-plein' : 'bouton'} disabled={envoi !== null} onClick={() => void repondre(false)}>
      {envoi === 'refuser' ? t('connexion.enCours') : t('serveur.autoriser.refuser')}
    </button>
  )

  return (
    <PageApp titre={t('serveur.autoriser.titre')} intro={etat.type === 'pret' ? t('serveur.autoriser.intro', { nom: moi.nom, email: moi.email }) : undefined}>
      {etat.type === 'saisie' && (
        <section className="app-carte autoriser-carte" ref={carte} tabIndex={-1} aria-labelledby="autoriser-saisie">
          <h2 id="autoriser-saisie">{t('serveur.autoriser.saisieTitre')}</h2>
          <label htmlFor="autoriser-champ">{t('serveur.autoriser.saisieChamp')}</label>
          <form className="app-form" onSubmit={valider} noValidate>
            <input
              id="autoriser-champ"
              className="champ autoriser-champ"
              value={saisi}
              onChange={(e) => setSaisi(e.target.value)}
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={etat.erreur ? true : undefined}
              aria-describedby={etat.erreur ? 'autoriser-erreur' : undefined}
            />
            <button type="submit" className="bouton bouton-plein">
              {t('serveur.autoriser.continuer')}
            </button>
          </form>
          {etat.erreur && (
            <p id="autoriser-erreur" className="connexion-erreur" role="alert">
              {etat.erreur}
            </p>
          )}
        </section>
      )}

      {etat.type === 'charge' && (
        <section className="app-carte autoriser-carte" ref={carte} tabIndex={-1} aria-label={t('serveur.autoriser.titre')}>
          <p role="status">{t('connexion.enCours')}</p>
        </section>
      )}

      {etat.type === 'pret' && code && (
        <section className="app-carte autoriser-carte" ref={carte} tabIndex={-1} aria-labelledby="autoriser-comparer" aria-busy={etat.envoi !== null}>
          <h2 id="autoriser-comparer">{t('serveur.autoriser.comparer')}</h2>
          {/* À l'écran en groupes ; au lecteur d'écran, lettre par lettre (sinon « ABCD » se lit comme un mot). */}
          <p className="autoriser-code" aria-hidden="true">
            {grouperCode(code)}
          </p>
          <p className="sr-seulement">{epeler(code)}</p>
          <dl className="autoriser-faits">
            {etat.demande ? (
              <>
                <div>
                  <dt>{t('serveur.autoriser.depuis')}</dt>
                  <dd>{etat.demande.ip}</dd>
                </div>
                <div>
                  <dt>{t('serveur.autoriser.quand')}</dt>
                  <dd>{quandEnMots(etat.demande.quand, maintenant)}</dd>
                </div>
                <div>
                  <dt>{t('serveur.autoriser.cettePage')}</dt>
                  <dd>{etat.demande.ipActuelle}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>{t('serveur.autoriser.depuis')}</dt>
                <dd>{t('serveur.autoriser.inconnue')}</dd>
              </div>
            )}
          </dl>
          {!etat.demande && (
            <p className="autoriser-alerte" role="alert">
              <Icone nom="attention" taille={18} />
              <span>{t('serveur.autoriser.origineInconnue')}</span>
            </p>
          )}
          {etat.demande && etat.demande.ip !== etat.demande.ipActuelle && (
            <p className="autoriser-alerte" role="alert">
              <Icone nom="attention" taille={18} />
              <span>{t('serveur.autoriser.autreReseau')}</span>
            </p>
          )}
          <p className="autoriser-aide">{t('serveur.autoriser.seulement')}</p>
          {etat.erreur && (
            <p className="connexion-erreur" role="alert">
              {etat.erreur}
            </p>
          )}
          {/* L'ordre du clavier et de la lecture suit l'emphase : quand la demande est suspecte, « Refuser » vient avant « Autoriser ». */}
          <div className="autoriser-actions">
            {suspecte ? [refuser, autoriser] : [autoriser, refuser]}
          </div>
        </section>
      )}

      {etat.type === 'fait' && (
        <section className="app-carte autoriser-carte" ref={carte} tabIndex={-1} role="status" aria-labelledby="autoriser-fait">
          <h2 id="autoriser-fait">{etat.autorise ? t('serveur.autoriser.fait') : t('serveur.autoriser.refusee')}</h2>
          <p>{etat.autorise ? t('serveur.autoriser.faitAide') : t('serveur.autoriser.refuseeAide')}</p>
          {/* Safari ne revient pas seul dans l'app qui l'a ouvert : `notak://` la ramène au premier plan. */}
          {etat.autorise && ios && (
            <div className="autoriser-actions">
              <a className="bouton bouton-plein" href={RETOUR_APP_IOS}>
                {t('serveur.autoriser.revenir')}
              </a>
            </div>
          )}
        </section>
      )}

      {etat.type === 'impossible' && (
        <section className="app-carte autoriser-carte" ref={carte} tabIndex={-1} aria-labelledby="autoriser-impossible">
          <h2 id="autoriser-impossible">{t('serveur.autoriser.impossible')}</h2>
          <p className="connexion-erreur" role="alert">
            {etat.message}
          </p>
          <p>{t('serveur.autoriser.relancer')}</p>
        </section>
      )}
    </PageApp>
  )
}
