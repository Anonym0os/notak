import type { CauseEchec } from '../../coeur/tableau'

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
      return 'Page introuvable : l’adresse n’existe plus ou comporte une faute.'
    case 'refuse':
      return 'Le site refuse qu’on lise sa page.'
    case 'injoignable':
      return 'Site injoignable : vérifiez l’adresse.'
    case 'delai':
      return 'Le site a mis trop de temps à répondre.'
    case 'interdit':
      return 'Cette adresse ne peut pas être lue ici.'
    case 'illisible':
      return 'La page n’a rien d’affichable.'
    default:
      return 'Aperçu indisponible.'
  }
}
