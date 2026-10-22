import type { Ligne } from '../../coeur/tableau'
import { FOND_NOTE } from '../note/couleurs'

export const GRIS_LIGNE = '#4b5360'
export const LIBELLE_MAX = 400

/** La couleur d'un trait : celle de la palette des notes, gris foncé par défaut. */
export const couleurDeLigne = (c: Ligne): string =>
  c.couleur && c.couleur !== 'transparent' ? FOND_NOTE[c.couleur] : GRIS_LIGNE
