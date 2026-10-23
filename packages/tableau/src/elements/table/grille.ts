import { type Element, type Table, nouvelId } from '../../coeur/tableau'

export const LIGNES_DEPART = 4
export const COLONNES_DEPART = 3
export const LIGNES_MIN = 2
export const COLONNES_MIN = 1
export const LIGNES_MAX = 200
export const COLONNES_MAX = 30
/** Largeur d'une colonne à la création, en UG. */
export const LARGEUR_COLONNE = 12

export type Cellules = readonly (readonly string[])[]

export const grilleVide = (lignes: number, colonnes: number): string[][] =>
  Array.from({ length: lignes }, () => Array.from({ length: colonnes }, () => ''))

export const nouvelleTable = (x: number, y: number): Element<Table> => ({
  id: nouvelId(),
  x,
  y,
  largeur: COLONNES_DEPART * LARGEUR_COLONNE,
  contenu: { type: 'table', cellules: grilleVide(LIGNES_DEPART, COLONNES_DEPART) },
})

export const nombreLignes = (c: Cellules) => c.length
export const nombreColonnes = (c: Cellules) => c[0]?.length ?? 0

/**
 * Une grille rectangulaire d'au moins `LIGNES_MIN` lignes et `COLONNES_MIN` colonnes : les lignes trop courtes
 * sont complétées, ce qui dépasse la plus large des premières lignes est gardé (une table qui vient d'ailleurs).
 */
export function normaliser(c: Cellules): string[][] {
  const colonnes = Math.max(COLONNES_MIN, ...c.map((l) => l.length))
  const lignes = c.map((l) => [...l, ...Array<string>(colonnes - l.length).fill('')])
  while (lignes.length < LIGNES_MIN) lignes.push(Array<string>(colonnes).fill(''))
  return lignes
}

/** La grille avec une ligne vide après la ligne `apres` (-1 : tout en haut). */
export function ajouterLigne(c: Cellules, apres = c.length - 1): string[][] {
  if (c.length >= LIGNES_MAX) return c.map((l) => [...l])
  const place = Math.min(Math.max(apres + 1, 0), c.length)
  const neuve = Array<string>(nombreColonnes(c)).fill('')
  return [...c.slice(0, place).map((l) => [...l]), neuve, ...c.slice(place).map((l) => [...l])]
}

/** La grille sans la ligne `i` ; elle garde au moins `LIGNES_MIN` lignes. */
export function retirerLigne(c: Cellules, i: number): string[][] {
  if (c.length <= LIGNES_MIN || i < 0 || i >= c.length) return c.map((l) => [...l])
  return c.filter((_, k) => k !== i).map((l) => [...l])
}

/** La grille avec une colonne vide après la colonne `apres` (-1 : tout à gauche). */
export function ajouterColonne(c: Cellules, apres = nombreColonnes(c) - 1): string[][] {
  if (nombreColonnes(c) >= COLONNES_MAX) return c.map((l) => [...l])
  const place = Math.min(Math.max(apres + 1, 0), nombreColonnes(c))
  return c.map((l) => [...l.slice(0, place), '', ...l.slice(place)])
}

/** La grille sans la colonne `j` ; elle garde au moins `COLONNES_MIN` colonne. */
export function retirerColonne(c: Cellules, j: number): string[][] {
  if (nombreColonnes(c) <= COLONNES_MIN || j < 0 || j >= nombreColonnes(c)) return c.map((l) => [...l])
  return c.map((l) => l.filter((_, k) => k !== j))
}

export function changerCellule(c: Cellules, i: number, j: number, texte: string): string[][] {
  return c.map((l, k) => (k === i ? l.map((v, m) => (m === j ? texte : v)) : [...l]))
}

/**
 * Où va le focus quand on avance d'une cellule (Tab) ou qu'on recule (Maj+Tab), de gauche à droite puis de haut en bas.
 * Au bout, `null` : il n'y a plus de cellule (Tab en dernier ajoute une ligne).
 */
export function celluleSuivante(c: Cellules, i: number, j: number, recul = false): [number, number] | null {
  const colonnes = nombreColonnes(c)
  const rang = i * colonnes + j + (recul ? -1 : 1)
  if (rang < 0 || rang >= c.length * colonnes) return null
  return [Math.floor(rang / colonnes), rang % colonnes]
}

/** Ce qu'on lit d'une table dans une liste : sa première ligne, puis le nombre de lignes. */
export function resume(c: Table): string {
  const entete = (c.cellules[0] ?? []).filter(Boolean).join(' | ')
  const n = c.cellules.length
  return `${entete || 'Table'} (${n} lignes × ${nombreColonnes(c.cellules)} colonnes)`
}
