/**
 * Signaler un bug d'un geste, dans l'app d'iPhone et d'iPad : secouer l'appareil, ou faire une capture d'écran. La
 * coque les entend (`AppareilPlugin.swift`, événement `signaler`) et la page les relaie par un événement de la fenêtre,
 * que la fenêtre de signalement écoute (`Signaler.tsx`, édition serveur seulement : ailleurs, personne ne l'entend).
 *
 * Ce module reste léger : le démarrage mobile (`ios/demarrage.ts`) le charge dans les deux éditions.
 */

export type Geste = 'secousse' | 'capture'

export const EVENEMENT_SIGNALER = 'notak:signaler'

const GESTES: readonly Geste[] = ['secousse', 'capture']

/** Ce que la coque envoie (`{ par }`), ramené à un geste connu ; `null` pour le reste. */
export function gesteDe(donnees: unknown): Geste | null {
  const par = donnees && typeof donnees === 'object' ? (donnees as { par?: unknown }).par : null
  return GESTES.includes(par as Geste) ? (par as Geste) : null
}

export function relayerGeste(fenetre: Pick<Window, 'dispatchEvent'>, donnees: unknown): void {
  const geste = gesteDe(donnees)
  if (geste) fenetre.dispatchEvent(new CustomEvent<Geste>(EVENEMENT_SIGNALER, { detail: geste }))
}

/**
 * Secouer, c'est aussi « Annuler la saisie » d'iOS quand on écrit : pendant qu'un champ ou un texte a le focus, la
 * secousse lui reste. Une capture d'écran, elle, ouvre toujours.
 */
export function gesteRetenu(geste: Geste, actif: Element | null): boolean {
  if (geste === 'capture') return true
  if (!actif || !('matches' in actif)) return true
  return !((actif as HTMLElement).isContentEditable || actif.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
}
