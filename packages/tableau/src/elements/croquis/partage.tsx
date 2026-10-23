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

/**
 * Le volet de la palette, comme Milanote : cinq colonnes de pastilles de 24 × 20 px, puis (si le tableau en propose)
 * ses couleurs suggérées sous un filet, puis « Couleur personnalisée… ».
 */
export function VoletCouleur({ couleur, choisir, suggerees }: { couleur: string; choisir(c: string): void; suggerees?: readonly string[] }) {
  const pastille = (c: string) => (
    <button key={c} type="button" className="notak-croquis-pastille" style={{ background: c }} aria-label={c} aria-pressed={couleur.toLowerCase() === c.toLowerCase()} onClick={() => choisir(c)} />
  )
  return (
    <div className="notak-croquis-volet notak-croquis-couleurs" role="group" aria-label={t('couleur.titre')}>
      <div className="notak-croquis-grille">{COULEURS_TRAIT.map(pastille)}</div>
      {suggerees && suggerees.length > 0 && (
        <>
          <hr />
          <div className="notak-croquis-grille">{suggerees.slice(0, 10).map(pastille)}</div>
        </>
      )}
      <label className="notak-croquis-libre" title={t('croquis.couleurLibre')}>
        <span className="notak-croquis-roue" aria-hidden="true" />
        <span>{t('croquis.couleurPerso')}</span>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(couleur) ? couleur : '#000000'} aria-label={t('croquis.couleurLibre')} onChange={(e) => choisir(e.target.value)} />
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

/** Noir ou blanc, selon ce qui se lit le mieux sur `couleur` (luminance relative). */
function contourSur(couleur: string): string {
  const n = Number.parseInt(/^#[0-9a-f]{6}$/i.test(couleur) ? couleur.slice(1) : '000000', 16)
  const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return l > 0.55 ? 'black' : 'white'
}

/** Le petit crayon du curseur (19 px, pointe en bas à gauche), rempli de la couleur du trait et cerné de noir ou de blanc selon le contraste. */
export function curseurCrayon(couleur: string): string {
  const remplissage = encodeURIComponent(couleur)
  const contour = contourSur(couleur)
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='19' height='19' viewBox='0 0 24 24'%3E%3Cpath d='M3 21l1-5L16 4l4 4L8 20z' fill='${remplissage}' stroke='${contour}' stroke-width='1.8' stroke-linejoin='round'/%3E%3Cpath d='M3 21l1-5 4 4z' fill='${contour}'/%3E%3C/svg%3E") 1 17, crosshair`
}

/** Le curseur de la gomme : un bloc incliné dont le coin bas gauche sert de pointe. */
export const CURSEUR_GOMME =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M8.5 21.5 3 16l9-9 7 7-5.5 5.5z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M8 12l7 7' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E") 8 21, default`
