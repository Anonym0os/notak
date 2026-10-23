import { type KeyboardEvent, useRef } from 'react'
import { Icone } from './icones'
import { t } from './langue'
import type { ModeleTableau } from './modeles/construire'

/** Les modèles que le panneau propose d'emblée, dans cet ordre : le premier porte la mention « le plus utilisé ». */
export const MODELES_PROPOSES = ['planning', 'humeur', 'lecture', 'reunion', 'idees'] as const

/** Les modèles du panneau, pris dans le catalogue de la langue. */
export const modelesProposes = (catalogue: readonly ModeleTableau[]): ModeleTableau[] =>
  MODELES_PROPOSES.flatMap((id) => catalogue.find((m) => m.id === id) ?? [])

/** Ce que dit le bouton principal : « Continuer » tant que le tableau reste vide, « Utiliser le modèle » sinon. */
export const libelleContinuer = (choisi: string | null): string => (choisi === null ? t('modele.continuer') : t('modele.utiliserCe'))

/**
 * Le choix d'un modèle à l'ouverture d'un tableau vide : un panneau sombre en bas à droite de la toile, sans fenêtre.
 * « Tableau vide » est choisi d'emblée ; choisir un modèle le montre dans la toile (l'aperçu est celui de l'espace),
 * « Continuer » l'écrit. Les flèches changent de ligne, Échap ferme.
 */
export function PanneauModeles({
  modeles,
  choisi,
  surChoix,
  garder,
  surGarder,
  continuer,
  plus,
  fermer,
  signal,
}: {
  modeles: readonly ModeleTableau[]
  /** L'identifiant du modèle choisi, `null` : tableau vide. */
  choisi: string | null
  surChoix(id: string | null): void
  garder: boolean
  surGarder(garder: boolean): void
  continuer(): void
  plus(): void
  fermer(): void
  /** Change à chaque clic dans la toile voilée : le bouton principal clignote pour dire « utilisez-le ». */
  signal: number
}) {
  const liste = useRef<HTMLUListElement>(null)
  const ids: (string | null)[] = [null, ...modeles.map((m) => m.id)]
  const touche = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      return fermer()
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const rang = ids.indexOf(choisi) + (e.key === 'ArrowDown' ? 1 : -1)
    surChoix(ids[Math.max(0, Math.min(ids.length - 1, rang))]!)
  }
  return (
    <aside className="notak-choix-modele" aria-label={t('modele.panneau')} onKeyDown={touche} onPointerDown={(e) => e.stopPropagation()}>
      <div className="notak-choix-modele-tete">
        <strong>{t('modele.panneau')}</strong>
        <button type="button" aria-label={t('modele.fermerPanneau')} onClick={fermer}>
          <Icone nom="fermer" taille={16} />
        </button>
      </div>
      <div className="notak-choix-modele-corps">
        <ul ref={liste} role="listbox" aria-label={t('modele.liste')}>
          <li>
            <button type="button" role="option" aria-selected={choisi === null} data-vide onClick={() => surChoix(null)}>
              {t('modele.vide')}
            </button>
          </li>
          {modeles.map((m, i) => (
            <li key={m.id}>
              <button type="button" role="option" aria-selected={choisi === m.id} onClick={() => surChoix(m.id)}>
                {m.titre}
                {i === 0 && <span className="notak-choix-modele-badge">{t('modele.top')}</span>}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="notak-choix-modele-plus" onClick={plus}>
              {t('modele.plus')}
              <Icone nom="chevronDroite" taille={14} />
            </button>
          </li>
        </ul>
      </div>
      <div className="notak-choix-modele-pied">
        <button key={signal} type="button" className="notak-choix-modele-continuer" data-clignote={signal > 0 || undefined} onClick={continuer}>
          {libelleContinuer(choisi)}
        </button>
        <label data-desactive={choisi === null || undefined}>
          <input type="checkbox" checked={garder && choisi !== null} disabled={choisi === null} onChange={(e) => surGarder(e.currentTarget.checked)} />
          {t('modele.garder')}
        </label>
      </div>
    </aside>
  )
}
