import { reglerRubriqueBureau } from '@notak/tableau'
import { useId, useState } from 'react'
import { type Ouvrir, estPageServeur, joindreServeur, reglerOuverture, revenirIci } from '../bureau'
import { t } from '../langue'
import { SectionMiseAJour } from '../MiseAJour'
import { type Echec, echecDe, hoteDe, texteErreur } from './acces'
import { ouvrirDialogueAcces, relireAcces, useAcces } from './etat'

/**
 * La rubrique « App de bureau » des réglages (⌘,), dans les deux éditions : où s'ouvre Notak au démarrage, le serveur
 * mémorisé et de quoi y aller ou en changer, puis les mises à jour. Où Notak s'ouvre se choisit sur la page des toiles
 * d'ici ; sur celle d'un serveur, il se lit sans se changer, comme la recherche automatique des mises à jour. Aller sur
 * un serveur ou en revenir n'y change rien.
 */

/** Ce qui est en cours : la fenêtre va changer de page, et on le dit. */
type Geste = 'connexion' | 'local' | 'acces'

export function ReglagesBureau() {
  const { acces, charge } = useAcces()
  const identifiant = useId()
  const surServeur = estPageServeur()
  const retenu = acces?.serveur ?? null
  const hote = retenu ? hoteDe(retenu) : ''
  const [geste, setGeste] = useState<Geste | null>(null)
  const [echec, setEchec] = useState<Echec | null>(null)

  /** Une demande à la coque ; réussie, la fenêtre change de page : les boutons restent pris jusque-là. */
  const agir = async (quoi: Geste, travail: () => Promise<unknown>) => {
    if (geste) return
    setGeste(quoi)
    setEchec(null)
    try {
      await travail()
    } catch (e) {
      setEchec(echecDe(e))
      setGeste(null)
    }
  }

  const choisirOuverture = async (ouvrir: Ouvrir) => {
    setEchec(null)
    try {
      await reglerOuverture(ouvrir)
    } catch (e) {
      setEchec(echecDe(e))
    }
    void relireAcces()
  }

  const attente =
    geste === 'connexion' ? t('bureau.porte.connexion', { hote }) : geste === 'local' ? t('bureau.reglages.retourLocal') : geste === 'acces' ? t('bureau.reglages.retourAcces') : ''
  // Pris, mais pas `disabled` : le bouton qu'on vient d'activer garde le curseur, et le lecteur d'écran sa place.
  const pris = geste !== null || undefined
  const idAide = `${identifiant}-aide`

  return (
    <div className="bureau-reglages">
      <section aria-labelledby={`${identifiant}-serveur`}>
        <h3 id={`${identifiant}-serveur`}>{t('bureau.reglages.serveur')}</h3>
        {charge && surServeur && retenu && <p>{t('bureau.reglages.visite', { hote })}</p>}
        {charge && retenu && (
          <fieldset className="bureau-ouverture" disabled={surServeur} aria-describedby={surServeur ? idAide : undefined}>
            <legend>{t('bureau.reglages.demarrage')}</legend>
            <label className="rangement-choix">
              <input type="radio" name={`${identifiant}-ouvrir`} checked={acces?.ouvrir !== 'serveur'} onChange={() => void choisirOuverture('local')} />
              {t('bureau.reglages.demarrageLocal')}
            </label>
            <label className="rangement-choix">
              <input type="radio" name={`${identifiant}-ouvrir`} checked={acces?.ouvrir === 'serveur'} onChange={() => void choisirOuverture('serveur')} />
              {t('bureau.reglages.demarrageServeur', { hote })}
            </label>
          </fieldset>
        )}
        {charge && !retenu && <p>{t('bureau.reglages.ouvreLocal')}</p>}
        {surServeur && retenu && (
          <small id={idAide} className="rangement-note">
            {t('bureau.reglages.demarrageAide')}
          </small>
        )}
        <div className="rangement-actions">
          {surServeur ? (
            <>
              <button type="button" className="bouton" aria-disabled={pris} onClick={() => void agir('acces', () => revenirIci('acces'))}>
                {t('bureau.reglages.changer')}
              </button>
              <button type="button" className="bouton" aria-disabled={pris} onClick={() => void agir('local', () => revenirIci('local'))}>
                {t('bureau.acces.local')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="bouton"
                aria-disabled={pris}
                onClick={() => {
                  if (!geste) void ouvrirDialogueAcces()
                }}
              >
                {t('bureau.serveur.seConnecter')}
              </button>
              {retenu && (
                <button type="button" className="bouton" aria-disabled={pris} onClick={() => void agir('connexion', () => joindreServeur(retenu, true))}>
                  {t('bureau.serveur.revenir', { hote })}
                </button>
              )}
            </>
          )}
        </div>
        <small className="rangement-note" role="status">
          {attente}
        </small>
        {echec && (
          <p className="bureau-reglages-erreur" role="alert">
            {texteErreur(echec, hote)}
          </p>
        )}
      </section>
      <section>
        <SectionMiseAJour />
      </section>
    </div>
  )
}

/** Donne aux réglages de quoi dessiner la rubrique « App de bureau » (`main.tsx`, dans l'app de bureau seulement). */
export function brancherReglagesBureau() {
  reglerRubriqueBureau(() => <ReglagesBureau />)
}
