import { type ReactNode, useState } from 'react'
import {
  type AxeRepartition,
  MIN_ALIGNER,
  MIN_REPARTIR,
  type SensAlignement,
  aligner,
  repartir,
} from '../../coeur/arrangement'
import type { OutilCommun } from '../types'
import { disposables } from './disposables'
import { enOperations } from './raccourcis'
import { t } from '../../langue'

/** Un pictogramme 16×16 : un repère (trait plein) et deux barres. `d` dessine les barres. */
const Icone = ({ children }: { children: ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
)

const SENS: { sens: SensAlignement; libelle: string; icone: ReactNode }[] = [
  { sens: 'gauche', get libelle() { return t('arrangement.gauche') }, icone: <Icone><rect x="1" y="1" width="1.5" height="14" /><rect x="4" y="3" width="10" height="3.5" rx="1" /><rect x="4" y="9.5" width="6" height="3.5" rx="1" /></Icone> },
  { sens: 'centre-horizontal', get libelle() { return t('arrangement.centre') }, icone: <Icone><rect x="7.25" y="1" width="1.5" height="14" /><rect x="2" y="3" width="12" height="3.5" rx="1" /><rect x="4" y="9.5" width="8" height="3.5" rx="1" /></Icone> },
  { sens: 'droite', get libelle() { return t('arrangement.droite') }, icone: <Icone><rect x="13.5" y="1" width="1.5" height="14" /><rect x="2" y="3" width="10" height="3.5" rx="1" /><rect x="6" y="9.5" width="6" height="3.5" rx="1" /></Icone> },
  { sens: 'haut', get libelle() { return t('arrangement.haut') }, icone: <Icone><rect x="1" y="1" width="14" height="1.5" /><rect x="3" y="4" width="3.5" height="10" rx="1" /><rect x="9.5" y="4" width="3.5" height="6" rx="1" /></Icone> },
  { sens: 'centre-vertical', get libelle() { return t('arrangement.milieu') }, icone: <Icone><rect x="1" y="7.25" width="14" height="1.5" /><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="4" width="3.5" height="8" rx="1" /></Icone> },
  { sens: 'bas', get libelle() { return t('arrangement.bas') }, icone: <Icone><rect x="1" y="13.5" width="14" height="1.5" /><rect x="3" y="2" width="3.5" height="10" rx="1" /><rect x="9.5" y="6" width="3.5" height="6" rx="1" /></Icone> },
]

const AXES: { axe: AxeRepartition; libelle: string; icone: ReactNode }[] = [
  { axe: 'horizontal', get libelle() { return t('arrangement.horizontal') }, icone: <Icone><rect x="1" y="2" width="1.5" height="12" /><rect x="13.5" y="2" width="1.5" height="12" /><rect x="6" y="4" width="4" height="8" rx="1" /></Icone> },
  { axe: 'vertical', get libelle() { return t('arrangement.vertical') }, icone: <Icone><rect x="2" y="1" width="12" height="1.5" /><rect x="2" y="13.5" width="12" height="1.5" /><rect x="4" y="6" width="8" height="4" rx="1" /></Icone> },
]

type Ouvert = 'aligner' | 'repartir' | null

export const OutilArrangement: OutilCommun = ({ elements, contexte }) => {
  const [ouvert, setOuvert] = useState<Ouvert>(null)
  const items = disposables(elements, contexte)
  const peutAligner = items.length >= MIN_ALIGNER
  const peutRepartir = items.length >= MIN_REPARTIR

  const appliquer = (pas: ReturnType<typeof enOperations>) => {
    contexte.magasin.faire(pas)
    setOuvert(null)
  }
  const bascule = (v: Exclude<Ouvert, null>) => setOuvert(ouvert === v ? null : v)

  return (
    <>
      {peutAligner && (
        <span className="notak-arrangement">
          <button type="button" aria-expanded={ouvert === 'aligner'} onClick={() => bascule('aligner')}>
            {t('arrangement.aligner')}
          </button>
          {ouvert === 'aligner' && (
            <span className="notak-arrangement-menu" role="menu">
              {SENS.map((s) => (
                <button key={s.sens} type="button" role="menuitem" title={s.libelle} aria-label={s.libelle} onClick={() => appliquer(enOperations(aligner(items, s.sens)))}>
                  {s.icone}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
      {peutRepartir && (
        <span className="notak-arrangement">
          <button type="button" aria-expanded={ouvert === 'repartir'} onClick={() => bascule('repartir')}>
            {t('arrangement.repartir')}
          </button>
          {ouvert === 'repartir' && (
            <span className="notak-arrangement-menu" role="menu">
              {AXES.map((a) => (
                <button key={a.axe} type="button" role="menuitem" title={a.libelle} aria-label={a.libelle} onClick={() => appliquer(enOperations(repartir(items, a.axe)))}>
                  {a.icone}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </>
  )
}
