import type { MouseEvent } from 'react'
import { t } from './langue'
import { type Moi } from './api'
import { adressePhoto } from './fichiers'
import { PastillePersonne } from '@notak/tableau'
import { usePanneau } from './panneaux'
import { surLien } from './chemin'
import { LigneMenu } from './LigneMenu'
import { estPageServeur, revenirIci } from './bureau'
import { annoncerBureau } from './serveur/annonces'

/** Le raccourci de la bibliothèque, partout dans l'édition serveur (⌥⌘O). */
export const RACCOURCI_BIBLIOTHEQUE = '⌥⌘O'

/**
 * Le menu au nom de la personne connectée. Ses toiles, cartes et documents, récents, favoris et partagés compris,
 * sont dans la bibliothèque, une page à part.
 */
export function Compte({ moi, deconnexion, aide }: { moi: Moi; deconnexion(): void; aide(): void }) {
  const { ouvert, regler, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  const photo = moi.photo ? adressePhoto(moi.photo) : undefined
  const aller = (chemin: string) => (e: MouseEvent) => {
    regler(false)
    surLien(e, chemin)
  }
  // Dans l'app de bureau : quitter ce serveur pour en choisir un autre, ou pour les toiles de cet ordinateur.
  const quitter = (ecran: 'acces' | 'local') => () => {
    regler(false)
    revenirIci(ecran).catch(() => annoncerBureau(t('serveur.retourImpossible')))
  }
  return (
    <div className="compte" ref={ancre}>
      <button type="button" ref={bouton} className="bouton bouton-nu compte-nom" aria-expanded={ouvert} aria-label={moi.nom} title={moi.nom} onClick={basculer}>
        <PastillePersonne className="compte-pastille" nom={moi.nom} couleur={moi.couleur} adresse={photo} titre="" />
      </button>
      {ouvert && (
        <div className="app-panneau app-menu compte-menu" ref={panneau} role="menu" aria-label={moi.nom}>
          <div className="compte-tete">
            <PastillePersonne className="compte-pastille" nom={moi.nom} couleur={moi.couleur} adresse={photo} titre="" />
            <span className="app-menu-texte">
              <span>{moi.nom}</span>
              <small>{moi.email}</small>
            </span>
          </div>
          <div className="app-menu-sep" />
          <LigneMenu icone="tableau" libelle={t('compte.bibliotheque')} detail={t('compte.bibliotheque.detail')} touche={RACCOURCI_BIBLIOTHEQUE} href="/" onClick={aller('/')} />
          <LigneMenu icone="equipe" libelle={t('compte.espaces')} detail={t('compte.espaces.detail')} href="/espace" onClick={aller('/espace')} />
          <LigneMenu icone="envoyer" libelle={t('compte.envoyer')} detail={t('compte.envoyer.detail')} href="/envoyer" onClick={aller('/envoyer')} />
          <LigneMenu
            icone="aide"
            libelle={t('compte.aide')}
            detail={t('compte.raccourcis')}
            onClick={() => {
              regler(false)
              aide()
            }}
          />
          {estPageServeur() && (
            <>
              <div className="app-menu-sep" />
              <LigneMenu icone="convertir" libelle={t('serveur.compte.changerServeur')} detail={location.host} onClick={quitter('acces')} />
              <LigneMenu icone="ordinateur" libelle={t('serveur.compte.toilesLocales')} detail={t('serveur.compte.toilesLocales.detail')} onClick={quitter('local')} />
            </>
          )}
          <div className="app-menu-sep" />
          <LigneMenu icone="deconnexion" libelle={t('compte.deconnexion')} onClick={deconnexion} />
        </div>
      )}
    </div>
  )
}
