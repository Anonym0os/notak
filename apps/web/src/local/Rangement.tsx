import { Icone } from '@notak/tableau'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { t, tn } from '../langue'
import { usePanneau } from '../panneaux'
import type { EspaceLocal } from './espace'
import { arreterSynchro, choisirDossier, ecouterSynchro, lireEtatSynchro, reprendreSynchro, synchroniserMaintenant } from './synchro'

/**
 * Où sont mes tableaux ? Une pastille dans l'en-tête dit la vérité en deux mots (« Dans ce navigateur », « Copie
 * il y a 3 j »), et son panneau l'explique : rien ne quitte l'appareil, le navigateur peut tout effacer, voici
 * comment garder une copie, et comment travailler à plusieurs en temps réel (une version à soi, ou nous écrire).
 */

export const DEPOT = 'https://github.com/Anonym0os/notak'
const CONTACT = (import.meta.env.VITE_CONTACT as string | undefined)?.trim() || null
const JOUR = 24 * 3600 * 1000
/** Après tant de jours sans copie, la pastille le signale. */
export const COPIE_CONSEILLEE = 7

/** Safari efface ce qu'un site garde au bout de 7 jours sans visite, sauf s'il est installé sur l'écran d'accueil. */
export const safariNonInstalle = () =>
  typeof navigator !== 'undefined' &&
  /^((?!chrome|chromium|crios|fxios|android|edg).)*safari/i.test(navigator.userAgent) &&
  !(typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)

/** L'invitation à installer l'application, quand le navigateur en propose une. */
interface Invitation {
  prompt(): Promise<void>
}
let invitation: Invitation | null = null
const ecouteursInvitation = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    invitation = e as unknown as Invitation
    for (const f of ecouteursInvitation) f()
  })
}
const ecouterInvitation = (f: () => void) => {
  ecouteursInvitation.add(f)
  return () => ecouteursInvitation.delete(f)
}

export function depuisQuand(t0: number | undefined, maintenant = Date.now()): number | null {
  return t0 === undefined ? null : Math.floor((maintenant - t0) / JOUR)
}

export function Rangement({ el, enregistrer, rouvrir, message }: { el: EspaceLocal; enregistrer(): void; rouvrir(): void; message: string | null }) {
  const { ouvert, regler, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  const derniere = useSyncExternalStore(el.index.ecouter, el.index.derniereCopie)
  const installable = useSyncExternalStore(ecouterInvitation, () => invitation !== null)
  const [garde, setGarde] = useState<boolean | null>(null)
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setGarde, () => setGarde(null))
  }, [])

  const jours = depuisQuand(derniere)
  // Safari efface pour de bon après une semaine sans visite ; ailleurs, le navigateur n'efface que si on le lui
  // demande ou faute de place : pas de quoi alarmer à la première visite.
  const fragile = safariNonInstalle()
  // Jamais copié : seulement si le navigateur menace d'effacer. Sinon, au bout d'une semaine sans copie.
  const alerte = jours === null ? fragile : jours >= COPIE_CONSEILLEE
  const etiquette = message ?? (jours === null ? t('local.pastille') : jours === 0 ? t('local.copieAujourdhui') : tn('local.copieIlYa', jours))

  const proteger = async () => setGarde((await navigator.storage?.persist?.()) ?? null)

  return (
    <div className="rangement" ref={ancre}>
      <button type="button" ref={bouton} className="bouton rangement-pastille" data-alerte={alerte || undefined} aria-expanded={ouvert} onClick={basculer}>
        <Icone nom={alerte ? 'attention' : 'dossier'} taille={16} />
        <span>{etiquette}</span>
      </button>
      {ouvert && (
        <div className="app-panneau partage-panneau rangement-panneau" ref={panneau} role="dialog" aria-label={t('local.titre')}>
          <h2>{t('local.titre')}</h2>
          <p>{t('local.ici')}</p>
          <ul className="rangement-faits">
            <li>{t('local.rienNePart')}</li>
            <li>{t('local.efface')}</li>
            {safariNonInstalle() && <li className="rangement-attention">{t('local.safari')}</li>}
          </ul>

          <h3>{t('local.garder')}</h3>
          <div className="rangement-actions">
            <button
              type="button"
              className="bouton bouton-plein"
              onClick={() => {
                regler(false)
                enregistrer()
              }}
            >
              <Icone nom="exporter" taille={16} />
              {t('local.enregistrer')}
            </button>
            <button
              type="button"
              className="bouton"
              onClick={() => {
                regler(false)
                rouvrir()
              }}
            >
              <Icone nom="importer" taille={16} />
              {t('local.rouvrir')}
            </button>
          </div>
          <small className="rangement-note">
            {jours === null ? t('local.jamaisCopie') : jours === 0 ? t('local.copieAujourdhui') : tn('local.copieIlYa', jours)}
            {' · '}
            {t('local.raccourci')}
          </small>
          <div className="rangement-actions">
            {installable && (
              <button type="button" className="bouton" onClick={() => void invitation?.prompt()}>
                {t('local.installer')}
              </button>
            )}
            {garde === false && (
              <button type="button" className="bouton" onClick={() => void proteger()}>
                {t('local.proteger')}
              </button>
            )}
          </div>
          {garde === true && <small className="rangement-note">{t('local.protege')}</small>}

          <Synchro el={el} />

          <h3>{t('local.plusieurs')}</h3>
          <p>{t('local.plusieursTexte')}</p>
          <div className="rangement-actions">
            <a className="bouton" href={DEPOT} target="_blank" rel="noopener noreferrer">
              {t('local.installerSien')}
            </a>
            {CONTACT && (
              <a className="bouton" href={`mailto:${CONTACT}?subject=${encodeURIComponent('Notak')}`}>
                {t('local.ecrire')}
              </a>
            )}
          </div>
          <small className="rangement-note">
            <a href="/a-propos">{t('local.aPropos')}</a> · <a href={DEPOT} target="_blank" rel="noopener noreferrer">{t('local.code')}</a>
          </small>
        </div>
      )}
    </div>
  )
}

/** La section « Synchroniser avec un dossier », là où le navigateur sait écrire dans un dossier. */
function Synchro({ el }: { el: EspaceLocal }) {
  const etat = useSyncExternalStore(ecouterSynchro, lireEtatSynchro)
  if (etat.mode === 'indisponible') return null
  return (
    <>
      <h3>
        {t('synchro.titre')} <span className="rangement-experimental">{t('synchro.experimental')}</span>
      </h3>
      {etat.mode === 'aucune' && (
        <>
          <p>{t('synchro.explication')}</p>
          <div className="rangement-actions">
            <button type="button" className="bouton" onClick={() => void choisirDossier(el)}>
              <Icone nom="dossier" taille={16} />
              {t('synchro.choisir')}
            </button>
          </div>
        </>
      )}
      {etat.mode === 'a-reprendre' && (
        <>
          <p>{t('synchro.aReprendre', { nom: etat.nom })}</p>
          <div className="rangement-actions">
            <button type="button" className="bouton bouton-plein" onClick={() => void reprendreSynchro(el)}>
              {t('synchro.reprendre')}
            </button>
            <button type="button" className="bouton" onClick={() => void arreterSynchro()}>
              {t('synchro.arreter')}
            </button>
          </div>
        </>
      )}
      {etat.mode === 'active' && (
        <>
          <p>
            {t('synchro.active', { nom: etat.nom })}
            {' · '}
            {!etat.meneur
              ? t('synchro.autreOnglet')
              : etat.derniere
                ? t('synchro.derniere', { heure: new Date(etat.derniere).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
                : t('synchro.enCours')}
          </p>
          {etat.erreur && <p className="rangement-attention">{etat.erreur}</p>}
          {etat.enAttente && <small className="rangement-note">{t('synchro.enAttente')}</small>}
          {etat.accueilChange && (
            <p className="rangement-attention">
              {t('synchro.accueilChange')}{' '}
              <button type="button" className="bouton-lien" onClick={() => location.assign('/')}>
                {t('synchro.recharger')}
              </button>
            </p>
          )}
          <div className="rangement-actions">
            <button type="button" className="bouton" onClick={synchroniserMaintenant} disabled={!etat.meneur}>
              {t('synchro.maintenant')}
            </button>
            <button type="button" className="bouton" onClick={() => void arreterSynchro()}>
              {t('synchro.arreter')}
            </button>
          </div>
        </>
      )}
    </>
  )
}
