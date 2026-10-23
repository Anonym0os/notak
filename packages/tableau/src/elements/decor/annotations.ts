import { COULEURS_NOTE, type CouleurNote, type Element, type Etiquette, type Id, type Operation, type Reactions, nouvelId } from '../../coeur/tableau'
import type { TypeElement } from '../types'
import { langue, t } from '../../langue'

// ---- Étiquettes ----

/** Le plus long nom qu'on donne à une étiquette. */
export const NOM_ETIQUETTE_MAX = 30

/** Une étiquette neuve : la couleur suivante de la palette, celle qui sert le moins. */
export function nouvelleEtiquette(existantes: readonly Etiquette[], nom: string): Etiquette | null {
  const propre = nom.trim().slice(0, NOM_ETIQUETTE_MAX)
  if (!propre) return null
  if (existantes.some((e) => e.nom.toLocaleLowerCase('fr') === propre.toLocaleLowerCase('fr'))) return null
  const usage = new Map<CouleurNote, number>(COULEURS_NOTE.map((c) => [c, 0]))
  for (const e of existantes) usage.set(e.couleur, (usage.get(e.couleur) ?? 0) + 1)
  const couleur = COULEURS_NOTE.reduce((a, b) => (usage.get(b)! < usage.get(a)! ? b : a))
  return { id: nouvelId(), nom: propre, couleur }
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

/** Les étiquettes d'un élément qui existent encore, dans l'ordre où le tableau les range. */
export const etiquettesDe = (e: Element, liste: readonly Etiquette[] | undefined): Etiquette[] =>
  (liste ?? []).filter((t) => e.etiquettes?.includes(t.id))

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
