import { lireReglages, themeEffectif, useSystemeSombre } from '@notak/tableau'
import { useEffect, useState } from 'react'
import { type InvitationRecue, type Moi, accepterInvitationTableau, lireInvitation } from './api'
import { langue, t } from './langue'
import { Marque } from './PageApp'

// L'invitation à un tableau, ouverte par son lien (`/invitation#<jeton>`). Le jeton voyage après `#` : il ne part
// jamais vers le serveur avec la page, ni dans un référent. On le garde le temps de la session, pour qu'il survive à
// une connexion par un fournisseur (qui repasse par une autre page), et on le retire de l'adresse aussitôt lu.
// L'accepter est un geste : on voit ce qu'on accepte, et pour quel compte.

const CLE = 'notak:invitation'
const JETON = /^[A-Za-z0-9_-]{40,64}$/

/** Le jeton de l'invitation en cours : lu sur l'adresse, sinon celui gardé pour la session. */
export function jetonInvitation(): string | null {
  if (location.pathname === '/invitation') {
    const lu = location.hash.slice(1)
    if (JETON.test(lu)) {
      try {
        sessionStorage.setItem(CLE, lu)
      } catch {
        // la session ne garde rien : le jeton vaut pour cette page
      }
      history.replaceState(null, '', '/invitation')
      return lu
    }
  }
  try {
    const garde = sessionStorage.getItem(CLE)
    return garde && JETON.test(garde) ? garde : null
  } catch {
    return null
  }
}

export function oublierInvitation(): void {
  try {
    sessionStorage.removeItem(CLE)
  } catch {
    // rien à oublier
  }
}

/** L'invitation lue par son jeton : en chargement, lue, ou le message de son refus (introuvable, expirée). */
export function useInvitation(jeton: string): InvitationRecue | string | null {
  const [lue, setLue] = useState<InvitationRecue | string | null>(null)
  useEffect(() => {
    let vivant = true
    lireInvitation(jeton).then(
      (i) => vivant && setLue(i),
      (x: Error) => vivant && setLue(x.message),
    )
    return () => {
      vivant = false
    }
  }, [jeton])
  return lue
}

/** Ce que propose l'invitation, en deux lignes : qui invite, sur quoi, pour quoi faire, jusqu'à quand. */
export function ApercuInvitation({ invitation }: { invitation: InvitationRecue | string | null }) {
  if (invitation === null) return <span className="notak-roue" aria-hidden />
  if (typeof invitation === 'string') return <p className="connexion-erreur">{invitation}</p>
  const titre = invitation.titre || t('commun.sansTitre')
  return (
    <div className="invitation-apercu">
      <p className="invitation-titre">{invitation.par ? t('invitation.titre', { par: invitation.par, titre }) : t('invitation.titreSansPar', { titre })}</p>
      <p className="connexion-aide">
        {t('invitation.role', { droit: t(`invitation.droit.${invitation.role}`) })}
        {invitation.expire !== null &&
          ` ${t('invitation.fin', { date: new Intl.DateTimeFormat(langue(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(invitation.expire)) })}`}
      </p>
    </div>
  )
}

/** Connecté, on accepte l'invitation pour ce compte, puis la toile s'ouvre. */
export function PageInvitation({ jeton, moi }: { jeton: string; moi: Moi }) {
  const invitation = useInvitation(jeton)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const accepter = () => {
    setEnvoi(true)
    setErreur(null)
    accepterInvitationTableau(jeton).then(
      (tableau) => {
        oublierInvitation()
        location.replace(`/t/${encodeURIComponent(tableau)}`)
      },
      (x: Error) => {
        setEnvoi(false)
        setErreur(x.message)
      },
    )
  }
  const plusRien = typeof invitation === 'string'
  const [reglages] = useState(lireReglages)
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  return (
    <div className="notak-espace" data-theme={theme}>
      <main className="connexion">
        <div className="connexion-carte">
          <Marque />
          <h1>Notak</h1>
          <ApercuInvitation invitation={invitation} />
          {invitation && !plusRien && (
            <>
              <p className="connexion-note">
                {invitation.email === moi.email ? t('invitation.adresse', { email: invitation.email }) : t('invitation.autreCompte', { email: moi.email })}
              </p>
              {erreur && (
                <p className="connexion-erreur" role="alert">
                  {erreur}
                </p>
              )}
              <button type="button" className="bouton bouton-plein" disabled={envoi} onClick={accepter}>
                {envoi ? t('invitation.acceptation') : t('invitation.accepter')}
              </button>
            </>
          )}
          <button
            type="button"
            className="bouton-lien"
            onClick={() => {
              oublierInvitation()
              location.replace('/')
            }}
          >
            {t('invitation.mesToiles')}
          </button>
        </div>
      </main>
    </div>
  )
}
