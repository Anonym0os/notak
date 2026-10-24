import { t } from '../../langue'

/**
 * Les onglets du panneau de côté (docs/XMIND.md § 8) : le format, comme le panneau de Xmind (Style, Présenter,
 * Carte), et les icônes (marqueurs, autocollants, illustrations). Chaque onglet vit dans son fichier.
 */

export const ONGLETS_FORMAT = () =>
  [
    { id: 'style', libelle: t('arbre.ongletStyle') },
    { id: 'presenter', libelle: t('arbre.ongletPresenter') },
    { id: 'carte', libelle: t('arbre.ongletCarte') },
  ] as const

export type OngletIcone = 'marqueurs' | 'autocollants' | 'illustrations'

export const ONGLETS_ICONES = () =>
  [
    { id: 'marqueurs', libelle: t('arbre.ongletMarqueurs') },
    { id: 'autocollants', libelle: t('arbre.ongletAutocollants') },
    { id: 'illustrations', libelle: t('arbre.ongletIllustrations') },
  ] as const

export { OngletCarte } from './OngletCarte'
export { OngletIcones } from './OngletIcones'
export { OngletPresenter } from './OngletPresenter'
export { OngletStyle } from './OngletStyle'
