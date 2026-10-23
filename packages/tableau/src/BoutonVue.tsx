import { useEffect, useRef, useState } from 'react'
import { Icone } from './icones'
import { t } from './langue'
import { bornesCurseur, commandesVue, pourcentage, useEtatVue } from './vueZoom'

/** Le pourcentage reste affiché ce temps après le retour à 100 %, avant que « Vue » revienne, en millisecondes. */
export const DELAI_RETOUR_VUE = 1000

/**
 * Le bouton de vue de l'en-tête : « Vue » à 100 %, le pourcentage dès que le zoom en sort (et une seconde
 * encore après y être revenu). Il ouvre le panneau du zoom : un curseur de 3 à 300 %, et « Tout afficher » qui
 * devient « Revenir à 100 % » quand tout est déjà cadré.
 */
export function BoutonVue() {
  const vue = useEtatVue()
  const echelle = vue?.echelle ?? 1
  const horsCent = pourcentage(echelle) !== 100
  const [ouvert, setOuvert] = useState(false)
  const [pourcent, setPourcent] = useState(false)
  useEffect(() => {
    if (horsCent) return setPourcent(true)
    const minuteur = setTimeout(() => setPourcent(false), DELAI_RETOUR_VUE)
    return () => clearTimeout(minuteur)
  }, [horsCent])

  const ancre = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const hors = (e: PointerEvent) => !ancre.current?.contains(e.target as Node) && setOuvert(false)
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOuvert(false)
    }
    document.addEventListener('pointerdown', hors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('pointerdown', hors)
      document.removeEventListener('keydown', touche)
    }
  }, [ouvert])

  if (!vue) return null
  const montre = pourcent
  return (
    <div className="notak-vue" ref={ancre}>
      <button type="button" className="notak-vue-bouton" aria-expanded={ouvert} aria-haspopup="dialog" onClick={() => setOuvert((o) => !o)}>
        <span className="notak-vue-texte">
          <span data-actif={!montre || undefined}>{t('espace.vue')}</span>
          <span data-actif={montre || undefined} className="notak-vue-pourcent">
            {pourcentage(echelle)}%
          </span>
        </span>
        <Icone nom="chevronBas" taille={16} />
      </button>
      {ouvert && <PanneauVue echelle={echelle} />}
    </div>
  )
}

function PanneauVue({ echelle }: { echelle: number }) {
  // La mesure du contenu coûte : elle se fait à l'ouverture et quand le zoom bouge, pas à chaque rendu de la toile.
  const details = commandesVue()?.details() ?? { min: 0.4, toutAffiche: false }
  const { min, max } = bornesCurseur(details.min)
  const pct = Math.min(max, Math.max(min, pourcentage(echelle)))
  return (
    <div className="notak-vue-panneau" role="dialog" aria-label={t('vue.titre')}>
      <h3>{t('vue.titre')}</h3>
      <p>{t('vue.aide')}</p>
      <div className="notak-vue-curseur">
        <input
          type="range"
          aria-label={t('vue.curseur')}
          min={min}
          max={max}
          step={1}
          value={pct}
          onChange={(e) => commandesVue()?.zoomer(Number(e.currentTarget.value) / 100)}
        />
        <output>{pourcentage(echelle)} %</output>
      </div>
      <button type="button" className="notak-vue-tout" onClick={() => commandesVue()?.tout()}>
        {details.toutAffiche ? t('vue.cent') : t('vue.tout')}
      </button>
    </div>
  )
}
