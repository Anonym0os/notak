import { COULEURS_NOTE, type CouleurNote, type Element, type Etiquette, type Id, type Operation, type Reactions, annoter, nouvelId } from '../../coeur/tableau'
import type { TypeElement } from '../types'
import { FOND_NOTE, SEUIL_SOMBRE, contraste } from '../note/couleurs'
import { langue, t, tn } from '../../langue'

// ---- Étiquettes ----

/** Le plus long nom qu'on donne à une étiquette. */
export const NOM_ETIQUETTE_MAX = 30

/** Un mot entier parmi ceux-ci (`\b` ne sait pas où finit un mot accentué). */
const mot = (alternatives: string) => new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'u')

/** Les mots de couleur que reconnaît un nom d'étiquette, en français et en anglais (« Urgent rouge », « blue »). */
const MOTS_COULEUR: [RegExp, CouleurNote][] = [
  [mot('gr[ae]y|gris'), 'gris'],
  [mot('cyan|turquoise'), 'cyan'],
  [mot('green|vert'), 'vert'],
  [mot('brown|brun|marron'), 'brun'],
  [mot('yellow|jaune'), 'jaune'],
  [mot('orange'), 'orange'],
  [mot('red|rouge'), 'rouge'],
  [mot('pink|rose'), 'rose'],
  [mot('purple|violet|mauve'), 'violet'],
  [mot('deep ?blue|bleu ?nuit|bleu ?fonc[ée]'), 'bleu_nuit'],
  [mot('blue|bleu'), 'bleu'],
]

const MOTS_POSITIFS = mot('ok|done|fait|fini|termin[ée]e?|valid[ée]e?|approuv[ée]e?|good|great|bien|super|success|win|yes|oui|ready|pr[êe]te?')
const MOTS_NEGATIFS = mot('urgent|bug|bloqu[ée]e?|blocked|erreur|error|probl[èe]me|problem|issue|critique|critical|danger|risque|risk|stop|refus[ée]e?|rejected|late|retard|no|non|pas')

/**
 * La couleur d'une étiquette neuve, choisie d'après son nom : un mot de couleur (« rouge », « blue »), sinon le sens
 * du mot (le positif tire vers le vert, le négatif vers le rouge), sinon une couleur de la palette au hasard.
 */
export function couleurPourNom(nom: string, hasard: () => number = Math.random): CouleurNote {
  const bas = nom.toLocaleLowerCase('fr')
  for (const [motif, couleur] of MOTS_COULEUR) if (motif.test(bas)) return couleur
  if (MOTS_POSITIFS.test(bas)) return 'vert'
  if (MOTS_NEGATIFS.test(bas)) return 'rouge'
  return COULEURS_NOTE[Math.min(COULEURS_NOTE.length - 1, Math.floor(hasard() * COULEURS_NOTE.length))]!
}

/** Une étiquette neuve, de la couleur que dit son nom ; un nom vide ou déjà pris n'en fait pas. */
export function nouvelleEtiquette(existantes: readonly Etiquette[], nom: string, hasard?: () => number): Etiquette | null {
  const propre = nom.trim().slice(0, NOM_ETIQUETTE_MAX)
  if (!propre) return null
  if (existantes.some((e) => e.nom.toLocaleLowerCase('fr') === propre.toLocaleLowerCase('fr'))) return null
  return { id: nouvelId(), nom: propre, couleur: couleurPourNom(propre, hasard) }
}

/** L'étiquette de ce nom (sans égard à la casse), si elle existe. */
export const etiquetteNommee = (liste: readonly Etiquette[], nom: string): Etiquette | undefined =>
  liste.find((e) => e.nom.toLocaleLowerCase('fr') === nom.trim().toLocaleLowerCase('fr'))

/** Le fond d'une couleur de note en `#rrggbb` (blanc pour `transparent`). */
const hexDe = (couleur: CouleurNote): string => FOND_NOTE[couleur as keyof typeof FOND_NOTE] ?? '#ffffff'

/** Le texte d'une pastille : sombre sur un fond clair, blanc sur un fond sombre. */
export const texteEtiquette = (couleur: CouleurNote): string => (contraste(hexDe(couleur), SEUIL_SOMBRE) < contraste(hexDe(couleur), '#ffffff') ? '#ffffff' : '#1f2430')

/**
 * Le contour d'une pastille qui se confond avec son fond (la carte qui la porte) : un trait noir à 30 % si elle est
 * claire, blanc à 30 % si elle est sombre. Rien quand elle se détache assez.
 */
export function contourEtiquette(couleur: CouleurNote, fondCarte: string): 'clair' | 'sombre' | undefined {
  if (contraste(hexDe(couleur), fondCarte) >= 1.25) return undefined
  return texteEtiquette(couleur) === '#ffffff' ? 'sombre' : 'clair'
}

export const renommerEtiquette = (liste: readonly Etiquette[], id: Id, nom: string): Etiquette[] => {
  const propre = nom.trim().slice(0, NOM_ETIQUETTE_MAX)
  if (!propre) return [...liste]
  return liste.map((e) => (e.id === id ? { ...e, nom: propre } : e))
}

export const colorerEtiquette = (liste: readonly Etiquette[], id: Id, couleur: CouleurNote): Etiquette[] =>
  liste.map((e) => (e.id === id ? { ...e, couleur } : e))

/**
 * Retire une étiquette du tableau, et des éléments qui la portent (un seul pas : l'annuler les lui rend).
 */
export function supprimerEtiquette(liste: readonly Etiquette[], elements: readonly Element[], id: Id): { etiquettes: Etiquette[]; elements: Element[] } {
  return {
    etiquettes: liste.filter((e) => e.id !== id),
    elements: elements.filter((e) => e.etiquettes?.includes(id)),
  }
}

/** Pose ou retire une étiquette de la liste d'un élément. */
export const basculerEtiquette = (actuelles: readonly Id[] | undefined, id: Id): Id[] =>
  actuelles?.includes(id) ? actuelles.filter((x) => x !== id) : [...(actuelles ?? []), id]

/** Cette étiquette sur ces éléments : tous, certains ou aucun. */
export function etatEtiquette(elements: readonly Element[], id: Id): 'tous' | 'certains' | 'aucun' {
  const n = elements.filter((e) => e.etiquettes?.includes(id)).length
  return n === 0 ? 'aucun' : n === elements.length ? 'tous' : 'certains'
}

/** Les étiquettes d'un élément qui existent encore, dans l'ordre où on les a posées. */
export const etiquettesDe = (e: Element, liste: readonly Etiquette[] | undefined): Etiquette[] =>
  (e.etiquettes ?? []).flatMap((id) => (liste ?? []).find((t) => t.id === id) ?? [])

/** Vrai si l'élément passe le filtre : sans filtre tout passe, sinon il faut au moins une des étiquettes voulues. */
export const passeLeFiltre = (e: Element, filtre: ReadonlySet<Id>): boolean => filtre.size === 0 || (e.etiquettes ?? []).some((id) => filtre.has(id))

// ---- Réactions ----

/** Les émojis qu'on propose. */
export const EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '✅', '🙏', '🔥'] as const

/** La réaction d'une personne : posée si elle n'y était pas, retirée si elle y était. */
export function basculerReaction(reactions: Reactions | undefined, emoji: string, personne: string): Reactions {
  const gens = reactions?.[emoji] ?? []
  const apres = gens.includes(personne) ? gens.filter((p) => p !== personne) : [...gens, personne]
  const { [emoji]: _, ...autres } = reactions ?? {}
  return apres.length > 0 ? { ...autres, [emoji]: apres } : autres
}

/**
 * Réagir avec cet émoji sur plusieurs éléments : si je l'ai déjà posé sur l'un d'eux, on ne fait que le retirer de ceux
 * qui l'ont ; sinon on le pose sur tous.
 */
export function reagirSurPlusieurs(elements: readonly Element[], emoji: string, personne: string): Operation[] {
  const retirer = elements.some((e) => e.reactions?.[emoji]?.includes(personne))
  return pasPour(elements, (e) => {
    const a = e.reactions?.[emoji]?.includes(personne) ?? false
    return a === retirer ? annoter(e, { reactions: basculerReaction(e.reactions, emoji, personne) }) : null
  })
}

/** Les prénoms que dit l'info-bulle d'une réaction, avant qu'on ne compte « N autres ». */
const PRENOMS_MAX = 6

/**
 * Qui a réagi, dit en une phrase : « Vous, Anna et Marc » (soi d'abord, six prénoms au plus puis « N autres »).
 * `noms` ne contient pas soi ; `moi` dit si l'on y est.
 */
export function quiReagit(noms: readonly string[], moi: boolean): { qui: string; n: number } {
  const prenoms = noms.map((n) => n.trim().split(/\s+/)[0] || t('decor.quelquun'))
  const montres = [...(moi ? [t('decor.vous')] : []), ...prenoms].slice(0, PRENOMS_MAX)
  const autres = prenoms.length + (moi ? 1 : 0) - montres.length
  const liste = autres > 0 ? [...montres, tn('decor.autres', autres)] : montres
  const fin = liste.length > 1 ? liste.pop()! : null
  const qui = fin === null ? liste[0]! : `${liste.join(', ')} ${t('decor.et')} ${fin}`
  return { qui, n: prenoms.length + (moi ? 1 : 0) }
}

/** Ce qu'on affiche sous un élément : chaque émoji, son compte, et si c'est aussi le nôtre. */
export function compterReactions(reactions: Reactions | undefined, personne: string): { emoji: string; n: number; moi: boolean }[] {
  return Object.entries(reactions ?? {})
    .filter(([, gens]) => gens.length > 0)
    .map(([emoji, gens]) => ({ emoji, n: gens.length, moi: gens.includes(personne) }))
}

// ---- Échéance ----

/** Aujourd'hui, `aaaa-mm-jj`, à l'heure locale. */
export function jourDe(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export const ECHEANCE = /^\d{4}-\d{2}-\d{2}$/

/** Où en est une échéance : dépassée, aujourd'hui, dans les trois jours, plus tard. */
export function etatEcheance(echeance: string, maintenant = new Date()): 'passee' | 'aujourdhui' | 'proche' | 'avenir' {
  const auj = jourDe(maintenant)
  if (echeance < auj) return 'passee'
  if (echeance === auj) return 'aujourdhui'
  const limite = new Date(maintenant)
  limite.setDate(limite.getDate() + 3)
  return echeance <= jourDe(limite) ? 'proche' : 'avenir'
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Une échéance dite comme on la dit : « aujourd'hui », « demain », « hier », « 12 oct. ». */
export function libelleEcheance(echeance: string, maintenant = new Date()): string {
  if (!ECHEANCE.test(echeance)) return echeance
  const decale = (n: number) => {
    const d = new Date(maintenant)
    d.setDate(d.getDate() + n)
    return jourDe(d)
  }
  if (echeance === jourDe(maintenant)) return t('decor.aujourdhui')
  if (echeance === decale(1)) return t('decor.demain')
  if (echeance === decale(-1)) return t('fil.hier')
  const [a, m, j] = echeance.split('-').map(Number) as [number, number, number]
  const annee = a === maintenant.getFullYear() ? '' : langue() === 'en' ? `, ${a}` : ` ${a}`
  return langue() === 'en' ? `${MOIS_EN[m - 1]} ${j}${annee}` : `${j} ${MOIS[m - 1]}${annee}`
}

// ---- Mode d'affichage ----

/**
 * Les cartes que le cadre commun replie en pastille. Une colonne se réduit en se repliant (`repliee`, voir `affichage.ts`),
 * un tableau imbriqué est déjà une icône, une ligne n'a pas de corps.
 */
export const peutEtreIcone = (def: TypeElement | undefined): boolean => !!def && !def.accepte && def.type !== 'tableau' && def.calque !== 'lignes'

// ---- Commun à tous ----

/** Les pas qui appliquent un changement d'annotations à chaque élément ; ceux pour qui rien ne change sont écartés. */
export const pasPour = (elements: readonly Element[], changer: (e: Element) => Operation | null): Operation[] =>
  elements.flatMap((e) => {
    const op = changer(e)
    return op ? [op] : []
  })
