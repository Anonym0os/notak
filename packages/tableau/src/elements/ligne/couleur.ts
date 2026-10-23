import type { Ligne } from '../../coeur/tableau'
import { FOND_NOTE, TEXTE_CLAIR, couleurTexteSur } from '../note/couleurs'

/** La couleur par défaut d'un trait : foncée en thème clair, claire en thème sombre (comme Milanote). */
export const GRIS_LIGNE = '#323b4a'
export const GRIS_LIGNE_SOMBRE = '#cccccc'
export const LIBELLE_MAX = 400

/** La couleur d'un trait : une couleur libre, sinon la palette des notes, sinon le gris du thème. */
export const couleurDeLigne = (c: Ligne, sombre = false): string =>
  c.fond ?? (c.couleur && c.couleur !== 'transparent' ? FOND_NOTE[c.couleur] : sombre ? GRIS_LIGNE_SOMBRE : GRIS_LIGNE)

/** Le libellé s'affiche : activé (non masqué) et non vide. */
export const libelleVisible = (c: Ligne): boolean => !!c.libelle && !c.libelleMasque

/**
 * La couleur du texte d'un libellé : sur le gris de la palette, la couleur de l'interface ; sinon du noir à 76 %
 * ou du blanc à 95 % selon le contraste avec le fond.
 */
export function couleurTexteLibelle(fond: string, sombre: boolean): string {
  if (fond.toLowerCase() === FOND_NOTE.gris) return sombre ? '#f2f3f5' : '#323b4a'
  const clair = couleurTexteSur(fond) === TEXTE_CLAIR
  return clair ? 'rgb(255 255 255 / 0.95)' : 'rgb(0 0 0 / 0.76)'
}
