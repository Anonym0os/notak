import type { TypeElement } from './elements/types'

/**
 * Le double-clic d'un élément qui s'écrit sur place (une image, un fichier, un lien, un nuancier : voir `ecritSurPlace`)
 * l'ouvre, toujours. Avant, un premier clic sur l'élément déjà choisi ouvrait l'écriture de son nom ou de sa légende,
 * et la toile laissait ensuite au champ le double-clic qui tombait dedans : le même geste ouvrait l'élément s'il
 * n'était pas encore choisi, et la légende s'il l'était.
 */

/** Ce qui, sur la carte, s'écrit : un champ marqué par l'élément (son nom, sa légende), ou un champ de saisie. */
const CHAMP = '[data-ecrire], input, textarea, [contenteditable=""], [contenteditable="true"]'

const noeud = (cible: EventTarget | null) => (cible instanceof Element ? cible : null)

/** Le champ d'écriture sous ce nœud, s'il y en a un. */
export const champSous = (cible: EventTarget | null): Element | null => noeud(cible)?.closest(CHAMP) ?? null

/**
 * Choisi, un clic sur l'élément ouvre-t-il son écriture ? Toujours pour une note ou un texte ; pour un élément qui
 * s'écrit sur place, seulement sur un de ses champs (`data-ecrire`) : ailleurs, il reste choisi, et le second clic
 * d'un double-clic l'ouvrira.
 */
export function clicEcrit(def: Pick<TypeElement, 'ecritSurPlace'> | undefined, cible: EventTarget | null): boolean {
  return !def?.ecritSurPlace || !!noeud(cible)?.closest('[data-ecrire]')
}

/**
 * Le double-clic tombe dans l'élément qu'on écrit : l'ouvre-t-il quand même ? Jamais une note ni un texte, où il
 * choisit un mot. Un élément qui s'écrit sur place, oui, sauf dans le champ où le curseur était déjà avant ce
 * double-clic. `appuisDepuis` compte les appuis depuis l'ouverture de l'écriture : au plus un, c'est ce double-clic
 * qui l'a ouverte (son premier clic, sur la légende d'un élément choisi), et c'est l'élément qu'il voulait.
 */
export function ouvreMalgreEdition(def: Pick<TypeElement, 'ecritSurPlace' | 'ouvrir'> | undefined, cible: EventTarget | null, appuisDepuis: number): boolean {
  if (!def?.ecritSurPlace || !def.ouvrir) return false
  return appuisDepuis <= 1 || !champSous(cible)
}
