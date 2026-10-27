import { FeuilleBas, Icone } from '@notak/tableau'
import { useState } from 'react'
import { estErreurCoque, joindreServeur, peutJoindreUnServeur } from '../bureau'
import { echecDe, hoteDe, texteErreur, type Echec } from '../bureau/acces'
import { useAcces } from '../bureau/etat'
import { FormulaireAcces } from '../bureau/FormulaireAcces'
import { t } from '../langue'
import './serveurTelephone.css'

/**
 * Dans la bibliothèque de l'app d'un iPhone ou d'un iPad, sous les toiles de l'appareil : « Sur un serveur ». Une ligne
 * ouvre la feuille « Se connecter à un serveur Notak » (le formulaire de l'app de bureau, aux mesures du doigt) ; un
 * serveur déjà retenu s'ouvre d'un toucher, et la feuille sert alors à en changer ou à l'oublier.
 *
 * La coque fait le reste, comme sur un ordinateur (`acces.rs`) : elle vérifie l'adresse, retient le serveur, et emmène
 * la fenêtre sur ses pages, où l'on se connecte et où l'on trouve ses toiles.
 */
export function ServeurTelephone() {
  const { acces } = useAcces()
  const [feuille, setFeuille] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [echec, setEchec] = useState<Echec | null>(null)
  if (!peutJoindreUnServeur()) return null
  const retenu = acces?.serveur ?? null
  const hote = retenu ? hoteDe(retenu) : ''

  const ouvrirRetenu = async () => {
    if (!retenu || occupe) return
    setOccupe(true)
    setEchec(null)
    try {
      // Réussie, la fenêtre part chez le serveur : la ligne reste « Connexion… » jusque-là.
      await joindreServeur(retenu, true)
    } catch (e) {
      setOccupe(false)
      if (!(estErreurCoque(e) && e.code === 'annule')) setEchec(echecDe(e))
    }
  }

  return (
    <section className="biblio-locale-rubrique biblio-serveur" aria-labelledby="biblio-locale-serveur">
      <h2 id="biblio-locale-serveur">{t('telephone.serveur.rubrique')}</h2>
      <div className="biblio-serveur-groupe">
        {retenu && (
          <button type="button" className="biblio-serveur-ligne" aria-busy={occupe || undefined} onClick={() => void ouvrirRetenu()}>
            <Icone nom="tableau" taille={20} />
            <span className="biblio-serveur-texte">
              <span>{t(occupe ? 'bureau.porte.connexion' : 'telephone.serveur.ouvrir', { hote })}</span>
              <small>{t('telephone.serveur.ouvrirDetail')}</small>
            </span>
            {occupe ? <span className="bureau-roue" aria-hidden /> : <Icone nom="chevronDroite" taille={18} />}
          </button>
        )}
        <button type="button" className="biblio-serveur-ligne" disabled={occupe} onClick={() => setFeuille(true)}>
          <Icone nom={retenu ? 'reglages' : 'compte'} taille={20} />
          <span className="biblio-serveur-texte">
            <span>{t(retenu ? 'telephone.serveur.autre' : 'telephone.serveur.connecter')}</span>
            {!retenu && <small>{t('telephone.serveur.connecterDetail')}</small>}
          </span>
          <Icone nom="chevronDroite" taille={18} />
        </button>
      </div>
      {echec && (
        <p className="connexion-erreur" role="alert">
          {texteErreur(echec, hote)}
        </p>
      )}
      {feuille && (
        <FeuilleBas className="biblio-serveur-feuille" fermer={() => setFeuille(false)}>
          <FormulaireAcces mode="dialogue" acces={acces} surLocal={() => setFeuille(false)} />
        </FeuilleBas>
      )}
    </section>
  )
}
