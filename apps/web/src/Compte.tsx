import { type MouseEvent, type ReactNode, useState } from 'react'
import { t } from './langue'
import { type Moi } from './api'
import { adressePhoto } from './fichiers'
import { FeuilleBas, PastillePersonne, enFeuille } from '@notak/tableau'
import { usePanneau } from './panneaux'
import { surLien } from './chemin'
import { LigneMenu } from './LigneMenu'
import { estBureau, estServeurDansApp, revenirIci } from './bureau'
import { surAppareil } from './bureau/acces'
import { annoncerBureau } from './serveur/annonces'

/** Le raccourci de la bibliothèque, partout dans l'édition serveur (⌥⌘O). */
export const RACCOURCI_BIBLIOTHEQUE = '⌥⌘O'

/**
 * Le menu au nom de la personne connectée. Ses toiles, cartes et documents, récents, favoris et partagés compris,
 * sont dans la bibliothèque, une page à part. Au doigt sur un téléphone, il monte du bas en feuille (`enFeuille`) : le
 * compte connecté, le serveur, la déconnexion, à portée de pouce.
 */
export function Compte({ moi, deconnexion, aide }: { moi: Moi; deconnexion(): void; aide(): void }) {
  const { ouvert: enBulle, regler: reglerBulle, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  // La feuille vit dans un portail, hors de l'ancre : le panneau la croirait touchée dehors. Elle a son propre état.
  const [enFeuilleOuverte, setEnFeuilleOuverte] = useState(false)
  const ouvert = enBulle || enFeuilleOuverte
  const regler = (v: boolean) => {
    if (!v) setEnFeuilleOuverte(false)
    reglerBulle(v)
  }
  const photo = moi.photo ? adressePhoto(moi.photo) : undefined
  const aller = (chemin: string) => (e: MouseEvent) => {
    regler(false)
    surLien(e, chemin)
  }
  // Dans l'app (ordinateur ou téléphone) : quitter ce serveur pour en choisir un autre, ou pour les toiles de cet ordinateur.
  const quitter = (ecran: 'acces' | 'local') => () => {
    regler(false)
    revenirIci(ecran).catch(() => annoncerBureau(t('serveur.retourImpossible')))
  }
  return (
    <div className="compte" ref={ancre}>
      <button type="button" ref={bouton} className="bouton bouton-nu compte-nom" aria-expanded={ouvert} aria-label={moi.nom} title={moi.nom} onClick={() => (enFeuille() ? setEnFeuilleOuverte(true) : basculer())}>
        <PastillePersonne taille={24} nom={moi.nom} couleur={moi.couleur} adresse={photo} titre="" />
      </button>
      {ouvert && (
        <Enveloppe feuille={enFeuilleOuverte} fermer={() => regler(false)} panneau={panneau} nom={moi.nom}>
          <div className="compte-tete">
            <PastillePersonne taille={36} nom={moi.nom} couleur={moi.couleur} adresse={photo} titre="" />
            <span className="app-menu-texte">
              <span>{moi.nom}</span>
              <small>{moi.email}</small>
            </span>
          </div>
          <div className="app-menu-sep" />
          <LigneMenu icone="tableau" libelle={t('compte.bibliotheque')} detail={t('compte.bibliotheque.detail')} touche={RACCOURCI_BIBLIOTHEQUE} href="/" onClick={aller('/')} />
          <LigneMenu icone="equipe" libelle={t('compte.espaces')} detail={t('compte.espaces.detail')} href="/espace" onClick={aller('/espace')} />
          <LigneMenu icone="envoyer" libelle={t('compte.envoyer')} detail={t(estBureau() ? 'compte.envoyer.detailBureau' : 'compte.envoyer.detail')} href="/envoyer" onClick={aller('/envoyer')} />
          <LigneMenu
            icone="aide"
            libelle={t('compte.aide')}
            detail={t('compte.raccourcis')}
            onClick={() => {
              regler(false)
              aide()
            }}
          />
          {estServeurDansApp() && (
            <>
              <div className="app-menu-sep" />
              <LigneMenu icone="convertir" libelle={t('serveur.compte.changerServeur')} detail={location.host} onClick={quitter('acces')} />
              <LigneMenu icone="ordinateur" libelle={t(surAppareil() ? 'serveur.compte.toilesLocales.appareil' : 'serveur.compte.toilesLocales')} detail={t('serveur.compte.toilesLocales.detail')} onClick={quitter('local')} />
            </>
          )}
          <div className="app-menu-sep" />
          <LigneMenu icone="deconnexion" libelle={t('compte.deconnexion')} onClick={deconnexion} />
        </Enveloppe>
      )}
    </div>
  )
}

/** Le menu en bulle sous la pastille, ou dans une feuille du bas au téléphone. */
function Enveloppe({ feuille, fermer, panneau, nom, children }: { feuille: boolean; fermer(): void; panneau(el: HTMLElement | null): void; nom: string; children: ReactNode }) {
  if (feuille) {
    return (
      <FeuilleBas fermer={fermer} className="compte-feuille">
        <div className="app-menu compte-menu" role="menu" aria-label={nom}>
          {children}
        </div>
      </FeuilleBas>
    )
  }
  return (
    <div className="app-panneau app-menu compte-menu" ref={panneau} role="menu" aria-label={nom}>
      {children}
    </div>
  )
}
