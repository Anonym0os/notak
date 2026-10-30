/**
 * Le double toucher de l'Apple Pencil (sur son flanc) : la coque l'entend (`UIPencilInteraction`,
 * `AppareilPlugin.swift`, événement `crayon`) avec l'action choisie dans Réglages › Apple Pencil, et la page le relaie
 * à la toile par un événement de la fenêtre. La couche de dessin y change d'outil.
 */
import { type ActionDoubleToucher, EVENEMENT_DOUBLE_TOUCHER } from '@notak/tableau'

const ACTIONS: readonly ActionDoubleToucher[] = ['gomme', 'precedent', 'couleurs', 'epaisseur']

/** Ce que la coque envoie, ramené à une action connue ; `null` pour ce que Notak ne fait pas (« Ignorer », un raccourci). */
export function actionDoubleToucher(donnees: unknown): ActionDoubleToucher | null {
  const a = donnees && typeof donnees === 'object' ? (donnees as { action?: unknown }).action : null
  return ACTIONS.includes(a as ActionDoubleToucher) ? (a as ActionDoubleToucher) : null
}

export function relayerDoubleToucher(fenetre: Pick<Window, 'dispatchEvent'>, donnees: unknown): void {
  const action = actionDoubleToucher(donnees)
  if (action) fenetre.dispatchEvent(new CustomEvent(EVENEMENT_DOUBLE_TOUCHER, { detail: action }))
}
