import { PanneauEtiquettes } from './Etiquettes'
import { useContexteRetenu, useFiltre } from './etat'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { Infobulle } from '../../Infobulle'
import { useMenu } from '../../menuUnique'

/**
 * Le bouton de la barre de gauche : gérer les étiquettes du tableau et le filtrer, sans rien avoir choisi.
 * Il n'apparaît qu'une fois la toile connue (au premier élément dessiné).
 */
export function BoutonEtiquettes() {
  const contexte = useContexteRetenu()
  const filtre = useFiltre()
  const [ouvert, setOuvert, ancre] = useMenu()
  if (!contexte) return null
  return (
    <div className="notak-outil-place" ref={ancre}>
      <Infobulle libelle={t('etiquettes.filtre')} cote="droite" contenu>
        <button type="button" className="notak-outil" aria-expanded={ouvert} aria-label={t('etiquettes.titre')} onClick={() => setOuvert(!ouvert)}>
          <span className="notak-outil-icone"><Icone nom="etiquette" /></span>
          <span className="notak-outil-libelle">{t('etiquettes.titre')}{filtre.size > 0 ? ` (${filtre.size})` : ''}</span>
        </button>
      </Infobulle>
      {ouvert && (
        <div className="notak-tiroir notak-decor-tiroir">
          <PanneauEtiquettes elements={[]} contexte={contexte} />
        </div>
      )}
    </div>
  )
}
