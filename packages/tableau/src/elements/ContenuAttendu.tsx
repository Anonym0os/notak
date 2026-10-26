import { Icone, type NomIcone } from '../icones'
import { t } from '../langue'
import './externe.css'

/** Le bouton ne lance ni glissé ni sélection sur la carte qui le porte. */
const garder = (e: React.SyntheticEvent) => e.stopPropagation()

/**
 * La place d'un contenu d'un autre site qui attend l'accord (`contenuExterne.ts`) : d'où il viendrait, et « Afficher »,
 * qui le charge pour cet élément seulement. Le bouton se prend au clavier ; sa vocalisation nomme les hôtes.
 */
export function ContenuAttendu({ hotes, afficher, icone }: { hotes: readonly string[]; afficher(): void; icone?: NomIcone }) {
  const d = hotes.join(', ')
  return (
    <div className="notak-externe">
      {icone && <Icone nom={icone} taille={20} />}
      <span className="notak-externe-texte" title={d}>
        {t('externe.de', { hote: d })}
      </span>
      <button
        type="button"
        className="notak-externe-bouton"
        aria-label={t('externe.afficherDe', { hotes: d })}
        title={t('externe.afficherDe', { hotes: d })}
        onPointerDown={garder}
        onDoubleClick={garder}
        onClick={(e) => {
          e.stopPropagation()
          afficher()
        }}
      >
        {t('externe.afficher')}
      </button>
    </div>
  )
}
