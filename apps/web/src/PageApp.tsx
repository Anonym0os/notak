import type { ReactNode } from 'react'
import { Icone } from '@notak/tableau'
import { t } from './langue'
import { surLien } from './chemin'

/**
 * Une page de l'application hors de la toile (Envoyer vers Notak, espaces d'équipe) : le retour à la bibliothèque dans un
 * îlot, le titre et sa phrase, puis les cartes de la page, les unes sous les autres.
 */
export function PageApp({ titre, intro, children }: { titre: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="app-page">
      <header className="app-page-tete">
        <a className="notak-ilot app-page-retour" href="/" title={`${t('compte.bibliotheque')} (⌥⌘O)`} onClick={(e) => surLien(e, '/')}>
          <Icone nom="gauche" taille={18} />
          {t('compte.bibliotheque')}
        </a>
      </header>
      <div className="app-page-corps">
        <h1>{titre}</h1>
        {intro && <p className="app-page-intro">{intro}</p>}
        {children}
      </div>
    </main>
  )
}

/** L'icône de Notak, en tête des cartes posées seules (connexion, arrivée d'un partage, note rapide). */
export const Marque = () => <img className="connexion-marque" src="/icones/icone.svg" alt="" width={44} height={44} />
