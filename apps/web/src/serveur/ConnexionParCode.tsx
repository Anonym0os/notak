import { useEffect, useRef, useState } from 'react'
import { type Moi, duree, moi as lireMoi } from '../api'
import { estServeurDansApp, ouvrirDansLeNavigateur } from '../bureau'
import { t } from '../langue'
import { Marque } from '../PageApp'
import { type Appareil, type EtatAppareil, epeler, grouperCode, lancerConnexionParCode } from './appareil'

/**
 * Ouvre la page d'accord dans le navigateur de la personne. Elle s'ouvre après une requête, hors du clic : WebKit
 * refuserait `window.open`. La coque l'ouvre alors elle-même (pages de ce serveur seulement) ; une coque plus ancienne,
 * ou un refus, retombe sur `window.open` (la coque envoie toute nouvelle fenêtre vers le système, `navigation.rs`), et
 * « Rouvrir le navigateur » reste là.
 */
const ouvrirNavigateur = (adresse: string) => {
  const parLaFenetre = () => void window.open(adresse, '_blank', 'noopener')
  if (estServeurDansApp()) void ouvrirDansLeNavigateur(adresse).catch(parLaFenetre)
  else parLaFenetre()
}

/**
 * L'attente de la connexion par le navigateur (app de bureau, fournisseur ou SSO) : le code à comparer, un bouton pour
 * rouvrir le navigateur, l'heure où le code s'éteint. Chaque issue a ses mots, et un geste pour repartir.
 */
export function ConnexionParCode({ surConnexion, annuler }: { surConnexion(moi: Moi): void; annuler(): void }) {
  const [essai, setEssai] = useState(0)
  const [etat, setEtat] = useState<EtatAppareil>({ type: 'demande' })
  const [maintenant, setMaintenant] = useState(Date.now)
  const appareil = useRef<Appareil | null>(null)
  const carte = useRef<HTMLDivElement>(null)
  // Le parent en donne une neuve à chaque rendu : la relecture de la session ne repart pas pour si peu.
  const connecte = useRef(surConnexion)
  useEffect(() => {
    connecte.current = surConnexion
  })

  useEffect(() => {
    setEtat({ type: 'demande' })
    // Un tour d'horloge avant de demander : une application montée deux fois (StrictMode) ne demande qu'un code.
    const depart = setTimeout(() => {
      appareil.current = lancerConnexionParCode({ surEtat: setEtat, ouvrir: ouvrirNavigateur })
    }, 0)
    return () => {
      clearTimeout(depart)
      appareil.current?.annuler()
      appareil.current = null
    }
  }, [essai])

  // Accordé : la session est dans le cookie, la page la relit comme après un mot de passe.
  useEffect(() => {
    if (etat.type !== 'accorde') return
    let vivant = true
    lireMoi().then(
      (m) => {
        if (!vivant) return
        if (m) connecte.current(m)
        else setEtat({ type: 'echec', cause: 'session' })
      },
      () => vivant && setEtat({ type: 'echec', cause: 'reseau' }),
    )
    return () => {
      vivant = false
    }
  }, [etat.type])

  // Le compte à rebours ne tourne que le temps de l'attente.
  const attend = etat.type === 'attente'
  useEffect(() => {
    if (!attend) return
    setMaintenant(Date.now())
    const tic = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(tic)
  }, [attend])

  // Chaque écran nouveau reprend le curseur : le bouton qui continue, que le clavier atteint aussitôt. Le lecteur d'écran
  // n'entend que ce bouton : l'aide et le code, qui le précèdent, lui sont liés (`aria-describedby`).
  useEffect(() => {
    carte.current?.querySelector<HTMLElement>('button')?.focus()
  }, [etat.type])

  const recommencer = () => setEssai((n) => n + 1)
  const hote = location.host
  const occupe = etat.type === 'demande' || etat.type === 'accorde'

  const issue = (() => {
    switch (etat.type) {
      case 'expire':
        return t('serveur.code.expire')
      case 'refuse':
        return t('serveur.code.refuse')
      case 'echec':
        switch (etat.cause) {
          case 'reseau':
            return t('serveur.code.reseau')
          case 'ancien':
            return t('serveur.code.ancien')
          case 'trop_d_essais':
            return etat.attente ? t('erreur.trop_d_essais_dans', { duree: duree(etat.attente) }) : t('erreur.trop_d_essais')
          case 'session':
            return t('serveur.code.session')
          default:
            return t('connexion.fournisseurRefuse')
        }
      default:
        return null
    }
  })()

  return (
    <div className="connexion-carte connexion-code" ref={carte}>
      <Marque />
      <h1>{attend ? t('serveur.code.titre') : issue ? t('serveur.code.titreFin') : t('connexion.enCours')}</h1>
      {etat.type === 'attente' && (
        <>
          <p className="connexion-aide" id="connexion-code-aide">
            {t('serveur.code.aide', { hote })}
          </p>
          <div className="connexion-code-bloc" id="connexion-code-bloc" role="group" aria-labelledby="connexion-code-etiquette">
            <span className="connexion-code-etiquette" id="connexion-code-etiquette">
              {t('serveur.code.etiquette')}
            </span>
            {/* À l'écran en groupes ; au lecteur d'écran, lettre par lettre (sinon « ABCD » se lit comme un mot). */}
            <strong className="connexion-code-valeur" aria-hidden="true">
              {grouperCode(etat.code)}
            </strong>
            <span className="sr-seulement">{epeler(etat.code)}</span>
          </div>
          <p className="connexion-aide">{t('serveur.code.expireDans', { duree: duree(Math.max(0, Math.ceil((etat.expire - maintenant) / 1000))) })}</p>
          <button type="button" className="bouton bouton-plein" aria-describedby="connexion-code-aide connexion-code-bloc" onClick={() => appareil.current?.rouvrir()}>
            {t('serveur.code.rouvrir')}
          </button>
          <p className="connexion-note">{t('serveur.code.siRien')}</p>
          <button type="button" className="bouton-lien" onClick={annuler}>
            {t('commun.annuler')}
          </button>
        </>
      )}
      {occupe && (
        <>
          <p className="connexion-aide" role="status">
            {etat.type === 'demande' ? t('serveur.code.demande', { hote }) : t('serveur.code.accorde')}
          </p>
          <button type="button" className="bouton-lien" onClick={annuler}>
            {t('commun.annuler')}
          </button>
        </>
      )}
      {issue && (
        <>
          <p className="connexion-erreur" role="alert">
            {issue}
          </p>
          <button type="button" className="bouton bouton-plein" onClick={recommencer}>
            {t('serveur.code.recommencer')}
          </button>
          <button type="button" className="bouton-lien" onClick={annuler}>
            {t('serveur.code.retour')}
          </button>
        </>
      )}
    </div>
  )
}
