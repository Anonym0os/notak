import { reglerRubriqueBureau } from '@notak/tableau'
import { useId, useState } from 'react'
import { estPageServeur, joindreServeur, revenirIci } from '../bureau'
import { t } from '../langue'
import { SectionMiseAJour } from '../MiseAJour'
import { type Echec, echecDe, hoteDe, texteErreur } from './acces'
import { ouvrirDialogueAcces, useAcces } from './etat'

/**
 * La rubrique « App de bureau » des réglages (⌘,), dans les deux éditions : où s'ouvre Notak et de quoi en changer, puis
 * les mises à jour. Sur la page des toiles d'ici, on se connecte à un serveur ou l'on y revient ; sur celle d'un serveur,
 * on en change ou l'on rentre aux toiles d'ici.
 */
export function ReglagesBureau() {
  const { acces, charge } = useAcces()
  const identifiant = useId()
  const surServeur = estPageServeur()
  const retenu = acces?.serveur ?? null
  const hote = retenu ? hoteDe(retenu) : ''
  const [occupe, setOccupe] = useState(false)
  const [echec, setEchec] = useState<Echec | null>(null)

  /** Une demande à la coque ; réussie, la fenêtre change de page : les boutons restent pris jusque-là. */
  const agir = async (travail: () => Promise<unknown>) => {
    if (occupe) return
    setOccupe(true)
    setEchec(null)
    try {
      await travail()
    } catch (e) {
      setEchec(echecDe(e))
      setOccupe(false)
    }
  }

  // Où Notak s'ouvre : sur un serveur, `ouvrir` ne vaut `serveur` que si c'est lui qui est retenu.
  const phrase = !charge
    ? ''
    : surServeur
      ? t(acces?.ouvrir === 'serveur' ? 'bureau.reglages.ouvreServeur' : 'bureau.reglages.visite', { hote })
      : acces?.ouvrir === 'serveur' && retenu
        ? t('bureau.reglages.ouvreServeurPourCetteFois', { hote })
        : `${t('bureau.reglages.ouvreLocal')}${retenu ? ` ${t('bureau.acces.retenu', { hote })}` : ''}`

  return (
    <div className="bureau-reglages">
      <section aria-labelledby={`${identifiant}-acces`}>
        <h3 id={`${identifiant}-acces`}>{t('bureau.reglages.acces')}</h3>
        <p>{phrase}</p>
        <div className="rangement-actions">
          {surServeur ? (
            <>
              <button type="button" className="bouton" disabled={occupe} onClick={() => void agir(() => revenirIci('acces'))}>
                {t('bureau.reglages.changer')}
              </button>
              <button type="button" className="bouton" disabled={occupe} onClick={() => void agir(() => revenirIci('local'))}>
                {t('bureau.acces.local')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="bouton" disabled={occupe} onClick={() => void ouvrirDialogueAcces()}>
                {t('bureau.serveur.seConnecter')}
              </button>
              {retenu && (
                <button type="button" className="bouton" disabled={occupe} onClick={() => void agir(() => joindreServeur(retenu, true))}>
                  {t('bureau.serveur.revenir', { hote })}
                </button>
              )}
            </>
          )}
        </div>
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
