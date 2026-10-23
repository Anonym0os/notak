import { useSyncExternalStore } from 'react'
import type { Id, PassageCellule } from '../../coeur/tableau'
import type { Plage } from './grille'

/**
 * L'état de la table qui n'est pas dans le tableau : quelles cellules sont choisies, laquelle s'écrit. Il vit ici,
 * par id d'élément, et non dans le composant : la barre d'outils (`OutilsTable`) le lit pour savoir quels outils
 * montrer, et la table, la barre et le menu du clic droit le changent. Rien n'est posé sur `window`.
 */

export interface Cellule {
  l: number
  c: number
}

/** Une référence qu'un clic vient d'insérer dans la formule : on peut encore la remplacer ou l'étendre. */
export interface CitationEnCours {
  debut: number
  fin: number
  ancre: Cellule
}

export interface EditionCellule {
  l: number
  c: number
  texte: string
  /** Le texte d'avant l'édition : Échap le rend. */
  depart: string
  /** Où est le curseur dans le texte. */
  curseur: number
  /** Monte quand le curseur est posé par le programme (citation, autocomplétion) : le champ le reprend. */
  maj: number
  /** La suggestion de l'autocomplétion qui est en surbrillance. */
  suggestion: number
  citation: CitationEnCours | null
  /** Le texte vient du calendrier : c'est un jour précis, on garde le format de la cellule. */
  depuisCalendrier: boolean
  /** « Avec l'heure », demandé au calendrier ; absent : celui que dit le format de la cellule. */
  avecHeure?: boolean
  /**
   * Les passages du texte riche (gras, lien, couleur…) quand la cellule s'écrit dans l'éditeur riche ; absent : elle
   * s'écrit dans le champ simple (une formule, un nombre, une date).
   */
  passages?: PassageCellule[]
  /** La sélection dans le texte riche, en décalages (`de` ≤ `a`). */
  selection?: { de: number; a: number }
}

export interface EtatTable {
  plages: readonly Plage[]
  /** Le coin fixe de la dernière plage (la cellule « active »), pour étendre avec Maj. */
  ancre: Cellule | null
  /** Le coin mobile de la dernière plage. */
  tete: Cellule | null
  edition: EditionCellule | null
  /** Un fond qu'on regarde au survol dans la barre d'outils, sans l'avoir choisi. `null` : aucun fond. */
  apercuFond: string | null | undefined
}

const VIDE: EtatTable = { plages: [], ancre: null, tete: null, edition: null, apercuFond: undefined }

const etats = new Map<Id, EtatTable>()
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((f) => f())
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

export const lireEtat = (id: Id): EtatTable => etats.get(id) ?? VIDE

/** Change une partie de l'état d'une table, et prévient ceux qui la lisent. */
export function poserEtat(id: Id, partiel: Partial<EtatTable> | ((e: EtatTable) => Partial<EtatTable>)) {
  const avant = lireEtat(id)
  const suite = { ...avant, ...(typeof partiel === 'function' ? partiel(avant) : partiel) }
  if (suite.plages.length === 0 && !suite.edition && suite.apercuFond === undefined) etats.delete(id)
  else etats.set(id, suite)
  prevenir()
}

/** Change l'édition en cours ; `undefined` : rien à changer, personne n'est prévenu. */
export function majEdition(id: Id, f: (e: EditionCellule) => EditionCellule | undefined) {
  const e = lireEtat(id).edition
  const suite = e && f(e)
  if (suite && suite !== e) poserEtat(id, { edition: suite })
}

/** La table n'a plus rien de choisi (elle n'est plus choisie, ou elle a disparu). */
export function oublierEtat(id: Id) {
  enAttente.delete(id)
  if (etats.delete(id)) prevenir()
}

export const useEtatTable = (id: Id): EtatTable => useSyncExternalStore(ecouter, () => lireEtat(id), () => VIDE)

/* ───────────── Le focus : la table le tient sur un nœud à elle tant que des cellules sont choisies ───────────── */

const noeuds = new Map<Id, HTMLElement>()
/** Les tables à qui l'on a rendu le clavier avant que leur nœud n'existe (la première cellule vient d'être choisie). */
const enAttente = new Set<Id>()

/** Le nœud qui reçoit le clavier de la table `id` (monté tant que des cellules sont choisies). */
export function enregistrerNoeud(id: Id, noeud: HTMLElement | null) {
  if (!noeud) return void noeuds.delete(id)
  noeuds.set(id, noeud)
  if (enAttente.delete(id)) noeud.focus({ preventScroll: true })
}

/** Rend le clavier à la table : à appeler après un geste de la barre d'outils ou d'un menu. */
export function focaliser(id: Id) {
  const n = noeuds.get(id)
  if (n) n.focus({ preventScroll: true })
  else enAttente.add(id)
}

/** Rend le focus à la toile (Échap) : le nœud de la table est dans la toile. */
export function rendreALaToile(id: Id) {
  noeuds.get(id)?.closest<HTMLElement>('.notak-toile')?.focus({ preventScroll: true })
}

/* ───────────── Ce qu'on copie, ce qu'on coupe ───────────── */

/** La dernière copie faite dans une table : d'où elle vient (pour décaler les formules collées), et si c'était un « couper ». */
export interface DerniereCopie {
  id: Id
  texte: string
  origine: Cellule
  /** Les valeurs calculées des cellules copiées (une formule donne son résultat) : « coller les valeurs ». */
  valeurs: string[][]
  coupe: Plage | null
}

let derniere: DerniereCopie | null = null
export const retenirCopie = (c: DerniereCopie | null) => {
  derniere = c
}
export const derniereCopie = () => derniere

/* ───────────── Le titre : l'outil « Titre » le fait écrire dès qu'il paraît ───────────── */

const titresAEcrire = new Set<Id>()
export const demanderTitre = (id: Id) => void titresAEcrire.add(id)
/** Vrai une seule fois après `demanderTitre` : le champ du titre qui vient de naître prend le focus. */
export const prendreDemandeTitre = (id: Id) => titresAEcrire.delete(id)
