import { t } from './langue'
import { type Moi } from './api'
import { adressePhoto } from './fichiers'
import { Icone, PastillePersonne } from '@notak/tableau'
import { usePanneau } from './panneaux'

/** Le raccourci de la bibliothèque, partout dans l'édition serveur (⌥⌘O). */
export const RACCOURCI_BIBLIOTHEQUE = '⌥⌘O'

/**
 * Le menu au nom de la personne connectée. Ses toiles, cartes et documents, récents, favoris et partagés compris,
 * sont dans la bibliothèque, une page à part.
 */
export function Compte({ moi, deconnexion, aide }: { moi: Moi; deconnexion(): void; aide(): void }) {
  const { ouvert, regler, basculer, ancre, bouton, panneau } = usePanneau<HTMLDivElement, HTMLButtonElement>()
  return (
    <div className="compte" ref={ancre}>
      <button type="button" ref={bouton} className="bouton bouton-nu compte-nom" aria-expanded={ouvert} aria-label={moi.nom} title={moi.nom} onClick={basculer}>
        <PastillePersonne className="compte-pastille" nom={moi.nom} couleur={moi.couleur} adresse={moi.photo ? adressePhoto(moi.photo) : undefined} titre="" />
      </button>
      {ouvert && (
        <div className="compte-menu" ref={panneau} role="menu">
          <small>{moi.email}</small>
          <a role="menuitem" className="compte-ligne" href="/bibliotheque" title={`${t('compte.bibliotheque')} (${RACCOURCI_BIBLIOTHEQUE})`}>
            <Icone nom="tableau" taille={16} />
            <span>{t('compte.bibliotheque')} <small>· {t('compte.bibliotheque.detail')}</small></span>
          </a>
          <button
            type="button"
            role="menuitem"
            className="compte-ligne"
            onClick={() => {
              regler(false)
              aide()
            }}
          >
            <Icone nom="aide" taille={16} />
            <span>{t('compte.aide')} <small>· {t('compte.raccourcis')}</small></span>
          </button>
          <a role="menuitem" className="compte-ligne" href="/espace">
            <Icone nom="equipe" taille={16} />
            <span>{t('compte.espaces')} <small>· {t('compte.espaces.detail')}</small></span>
          </a>
          <a role="menuitem" className="compte-ligne" href="/envoyer">
            <Icone nom="envoyer" taille={16} />
            <span>{t('compte.envoyer')} <small>· {t('compte.envoyer.detail')}</small></span>
          </a>
          <button type="button" role="menuitem" className="compte-ligne" onClick={deconnexion}>
            <Icone nom="deconnexion" taille={16} />
            {t('compte.deconnexion')}
          </button>
        </div>
      )}
    </div>
  )
}
