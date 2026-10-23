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
import { entreeRelier } from '../ligne/raccourci'
import { enOperations } from './raccourcis'
import { t } from '../../langue'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { type NomIcone, Icone } from '../../icones'
import { useMenu } from '../../menuUnique'

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

export const OutilArrangement: OutilCommun = ({ elements, contexte }) => {
  // Deux menus, un seul ouvert à la fois, et aucun quand un autre outil ouvre le sien.
  const aligner_ = useMenu<HTMLDivElement>()
  const repartir_ = useMenu<HTMLDivElement>()
  const items = disposables(elements, contexte)
  const peutAligner = items.length >= MIN_ALIGNER
  const peutRepartir = items.length >= MIN_REPARTIR

  const appliquer = (pas: ReturnType<typeof enOperations>) => {
    contexte.magasin.faire(pas)
    aligner_[1](false)
    repartir_[1](false)
  }

  return (
    <>
      {peutAligner && (
        <OutilAvecMenu menu={aligner_} classeAncre="notak-arrangement" icone="alignerGauche" libelle={t('arrangement.aligner')}>
          <span className="notak-arrangement-menu" role="menu">
            {SENS.map((s) => (
              <button key={s.sens} type="button" role="menuitem" title={s.libelle} aria-label={s.libelle} onClick={() => appliquer(enOperations(aligner(items, s.sens), contexte.magasin.lire().elements))}>
                <Icone nom={s.icone} />
              </button>
            ))}
          </span>
        </OutilAvecMenu>
      )}
      {peutRepartir && (
        <OutilAvecMenu menu={repartir_} classeAncre="notak-arrangement" icone="repartirH" libelle={t('arrangement.repartir')}>
          <span className="notak-arrangement-menu" role="menu">
            {AXES.map((a) => (
              <button key={a.axe} type="button" role="menuitem" title={a.libelle} aria-label={a.libelle} onClick={() => appliquer(enOperations(repartir(items, a.axe), contexte.magasin.lire().elements))}>
                <Icone nom={a.icone} />
              </button>
            ))}
          </span>
        </OutilAvecMenu>
      )}
      {entreeRelier.visible(elements, contexte) && (
        <BoutonOutil icone="relier" titre={t('menu.relier')} libelle={t('arrangement.relier')} onClick={() => entreeRelier.faire(elements, contexte)} />
      )}
    </>
  )
}
