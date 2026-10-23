import { useState } from 'react'
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
import { type NomIcone, Icone } from '../../icones'

const SENS: { sens: SensAlignement; libelle: string; icone: NomIcone }[] = [
  { sens: 'gauche', get libelle() { return t('arrangement.gauche') }, icone: 'alignerGauche' },
  { sens: 'centre-horizontal', get libelle() { return t('arrangement.centre') }, icone: 'alignerCentreH' },
  { sens: 'droite', get libelle() { return t('arrangement.droite') }, icone: 'alignerDroite' },
  { sens: 'haut', get libelle() { return t('arrangement.haut') }, icone: 'alignerHaut' },
  { sens: 'centre-vertical', get libelle() { return t('arrangement.milieu') }, icone: 'alignerCentreV' },
  { sens: 'bas', get libelle() { return t('arrangement.bas') }, icone: 'alignerBas' },
]

const AXES: { axe: AxeRepartition; libelle: string; icone: NomIcone }[] = [
  { axe: 'horizontal', get libelle() { return t('arrangement.horizontal') }, icone: 'repartirH' },
  { axe: 'vertical', get libelle() { return t('arrangement.vertical') }, icone: 'repartirV' },
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
                  <Icone nom={s.icone} />
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
                  <Icone nom={a.icone} />
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </>
  )
}
