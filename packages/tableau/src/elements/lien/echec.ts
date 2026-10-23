import type { CauseEchec } from '../../coeur/tableau'
import { t } from '../../langue'

const CAUSES: readonly CauseEchec[] = ['introuvable', 'refuse', 'injoignable', 'delai', 'interdit', 'illisible']

/** La cause portée par l'erreur d'un chercheur d'aperçu (`new Error(message, { cause })`), si c'en est une. */
export function lireCause(erreur: unknown): CauseEchec | undefined {
  const cause = erreur instanceof Error ? erreur.cause : undefined
  return typeof cause === 'string' && (CAUSES as readonly string[]).includes(cause) ? (cause as CauseEchec) : undefined
}

/** Ce que la carte dit d'un aperçu manqué. Sans cause connue, un message qui ne promet rien. */
export function messageEchec(cause: CauseEchec | undefined): string {
  switch (cause) {
    case 'introuvable':
      return t('lien.echec.introuvable')
    case 'refuse':
      return t('lien.echec.refuse')
    case 'injoignable':
      return t('lien.echec.injoignable')
    case 'delai':
      return t('lien.echec.delai')
    case 'interdit':
      return t('lien.echec.interdit')
    case 'illisible':
      return t('lien.echec.illisible')
    default:
      return t('lien.echec.defaut')
  }
}
