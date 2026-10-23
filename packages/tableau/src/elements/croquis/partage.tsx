import { COULEURS_TRAIT, EPAISSEURS_TRAIT } from './trace'
import { t } from '../../langue'

/**
 * Ce que la barre du croquis et celle du dessin libre ont en commun : l'allure d'une épaisseur, la palette de couleurs
 * et la liste des épaisseurs (chacune dans son volet), et le crayon du curseur.
 */

/** L'allure d'une épaisseur, pour son bouton : une barre plus ou moins grasse. */
export function BarreEpaisseur({ i }: { i: number }) {
  const e = [1.5, 3, 5, 9][i] ?? 3
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
      <line x1="3" y1="9" x2="19" y2="9" stroke="currentColor" strokeWidth={e} strokeLinecap="round" />
    </svg>
  )
}

/** Le volet de la palette : les couleurs du croquis, et un choix libre. */
export function VoletCouleur({ couleur, choisir }: { couleur: string; choisir(c: string): void }) {
  return (
    <div className="notak-croquis-volet notak-croquis-couleurs" role="group" aria-label={t('couleur.titre')}>
      {COULEURS_TRAIT.map((c) => (
        <button key={c} type="button" className="notak-croquis-pastille" style={{ background: c }} aria-label={c} aria-pressed={couleur === c} onClick={() => choisir(c)} />
      ))}
      <label className="notak-croquis-libre" title={t('croquis.couleurLibre')}>
        <input type="color" value={couleur} aria-label={t('croquis.couleurLibre')} onChange={(e) => choisir(e.target.value)} />
      </label>
    </div>
  )
}

/** Le volet des épaisseurs. */
export function VoletEpaisseur({ epaisseur, choisir }: { epaisseur: number; choisir(i: number): void }) {
  return (
    <div className="notak-croquis-volet" role="group" aria-label={t('croquis.epaisseur')}>
      {EPAISSEURS_TRAIT.map((e, i) => (
        <button key={e.px} type="button" title={`${e.libelle} (${i + 1})`} aria-label={e.libelle} aria-pressed={epaisseur === i} onClick={() => choisir(i)}>
          <BarreEpaisseur i={i} />
        </button>
      ))}
    </div>
  )
}

/** Le crayon du curseur (pointe en bas à gauche), rempli de la couleur du trait. */
export function curseurCrayon(couleur: string): string {
  const remplissage = encodeURIComponent(couleur)
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 21l1-5L16 4l4 4L8 20z' fill='${remplissage}' stroke='black' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M3 21l1-5 4 4z' fill='black'/%3E%3C/svg%3E") 3 21, crosshair`
}
