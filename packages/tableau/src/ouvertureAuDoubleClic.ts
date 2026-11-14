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

/**
 * Le double-clic de ce type ouvre-t-il autre chose que l'écriture de son texte ? Une image, un fichier, un lien, un
 * nuancier (`ecritSurPlace`), un croquis ou un document (`ouvreAuDoubleClic`), une toile (`ouvrir` sans édition) : oui.
 * Une note, un texte, des tâches, une colonne : non, ouvrir, c'est écrire.
 */
export const ouvreAutreChose = (def: Pick<TypeElement, 'ecritSurPlace' | 'ouvreAuDoubleClic' | 'ouvrir' | 'editable'> | undefined): boolean =>
  !!def && (!!def.ecritSurPlace || !!def.ouvreAuDoubleClic || (!!def.ouvrir && !def.editable))

/**
 * Au doigt, le second toucher d'un double toucher tombe sur un champ de l'élément (sa légende, son titre, le champ
 * qu'un premier toucher vient d'ouvrir) ; ce champ arrête l'appui, la toile ne le verrait pas. Doit-elle ouvrir
 * l'élément dès l'appui ? Dans l'écriture de la toile, comme le double-clic (`ouvreMalgreEdition`). Ailleurs, pour un
 * élément qui ouvre autre chose que son texte : sur une légende ou un titre affichés, oui ; dans un champ de saisie,
 * seulement s'il n'était pas sous le premier toucher (ce double toucher l'a ouvert). Sous le premier toucher déjà, le
 * curseur y était : le double toucher y choisit un mot.
 */
export function doubleToucherOuvre(
  def: Pick<TypeElement, 'ecritSurPlace' | 'ouvreAuDoubleClic' | 'ouvrir' | 'editable'> | undefined,
  { enEdition, cible, champAvant, appuisDepuis }: { enEdition: boolean; cible: EventTarget | null; champAvant: Element | null; appuisDepuis: number },
): boolean {
  if (enEdition) return ouvreMalgreEdition(def, cible, appuisDepuis)
  const champ = champSous(cible)
  if (!champ || !ouvreAutreChose(def)) return false
  const saisie = champ.matches('input, textarea, [contenteditable=""], [contenteditable="true"]')
  return !saisie || champ !== champAvant
}
