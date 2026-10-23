import { createContext } from 'react'
import { Icone } from './icones'
import { t } from './langue'

/**
 * La barre de gauche pendant l'édition d'un élément qui range ses outils de texte (la note) : la toile monte la barre
 * et prête son emplacement (`cible`) ; l'éditeur y fait un portail de ses outils. `attendue` : la barre de gauche
 * remplace la barre flottante de l'éditeur, même si l'emplacement n'est pas encore monté.
 */
export interface EmplacementEdition {
  attendue: boolean
  cible: HTMLElement | null
}

export const ContexteBarreEdition = createContext<EmplacementEdition>({ attendue: false, cible: null })

interface Panneau {
  nombre: number
  ouverte: boolean
  basculer(): void
}

/**
 * La barre de gauche en édition : un emplacement pour les outils (avec la flèche retour en haut), et la corbeille en
 * bas, comme la barre de création.
 */
export function BarreEdition({ cible, corbeille, nonTries }: { cible(el: HTMLElement | null): void; corbeille: Panneau; nonTries: Panneau }) {
  return (
    <>
      <nav className="notak-barre-outils" data-selection data-edition onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <div className="notak-barre-edition-liste" ref={cible} />
        <div className="notak-barre-ressort" />
        <button
          type="button"
          className="notak-outil"
          data-genre="corbeille"
          data-corbeille
          aria-expanded={corbeille.ouverte}
          title={t('corbeille.titre')}
          onClick={corbeille.basculer}
        >
          <span className="notak-outil-icone"><Icone nom="corbeille" taille={26} /></span>
          <span className="notak-outil-libelle">{t('corbeille.titre')}{corbeille.nombre > 0 ? ` (${corbeille.nombre})` : ''}</span>
        </button>
      </nav>
      <button
        type="button"
        className="notak-non-tries-bouton"
        aria-expanded={nonTries.ouverte}
        title={t('nonTries.titre') + ' (⌘\\)'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={nonTries.basculer}
      >
        <strong>{nonTries.nombre}</strong> {t('nonTries.titre')}
      </button>
    </>
  )
}
