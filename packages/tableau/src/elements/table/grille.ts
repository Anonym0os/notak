import { type Element, type FormatCellule, type Table, nouvelId } from '../../coeur/tableau'
import { t } from '../../langue'

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

/** Largeur d'une table neuve, en UG, et sa répartition entre les trois colonnes. */
export const LARGEUR_TABLE_DEPART = 34
export const LARGEURS_DEPART = [11.3, 11.3, 11.4]
/** Une colonne ne descend pas sous cette largeur, en UG. */
export const LARGEUR_COLONNE_MIN = 4

export const nouvelleTable = (x: number, y: number): Element<Table> => ({
  id: nouvelId(),
  x,
  y,
  largeur: LARGEUR_TABLE_DEPART,
  contenu: {
    type: 'table',
    cellules: grilleVide(LIGNES_DEPART, COLONNES_DEPART),
    formats: Array.from({ length: LIGNES_DEPART }, (_, i) =>
      Array.from({ length: COLONNES_DEPART }, (): FormatCellule | null => (i === 0 ? { gras: true, fond: 'entete' } : null)),
    ),
    largeurs: [...LARGEURS_DEPART],
  },
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

export function changerCellule(c: Cellules, i: number, j: number, texte: string): string[][]
/** Sur une table entière : le texte de la cellule change, les formats et les largeurs restent. */
export function changerCellule(t: Table, i: number, j: number, texte: string): Table
export function changerCellule(c: Cellules | Table, i: number, j: number, texte: string): string[][] | Table {
  if (!Array.isArray(c)) {
    const t = c as Table
    return { ...t, cellules: changerCellule(t.cellules, i, j, texte) }
  }
  return (c as Cellules).map((l, k) => (k === i ? l.map((v, m) => (m === j ? texte : v)) : [...l]))
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
  return t('table.resume', { entete: entete || t('type.table'), lignes: n, colonnes: nombreColonnes(c.cellules) })
}

/* ───────────── La table entière : cellules, formats et largeurs ensemble ───────────── */

export type Formats = (FormatCellule | null)[][]
/** Réécrit une formule (texte commençant par `=`) après un changement de structure ; branché sur le moteur de formules. */
export type Reecrire = (texte: string) => string

/** Un rectangle de cellules, bornes comprises, `l1 <= l2` et `c1 <= c2` une fois normalisé. */
export interface Plage {
  l1: number
  c1: number
  l2: number
  c2: number
}

export const normaliserPlage = (p: Plage): Plage => ({
  l1: Math.min(p.l1, p.l2),
  c1: Math.min(p.c1, p.c2),
  l2: Math.max(p.l1, p.l2),
  c2: Math.max(p.c1, p.c2),
})

export function dansPlage(p: Plage, l: number, c: number): boolean {
  const n = normaliserPlage(p)
  return l >= n.l1 && l <= n.l2 && c >= n.c1 && c <= n.c2
}

/** Vrai si chaque plage couvre toutes les colonnes de la table (donc des lignes entières). */
export const lignesEntieres = (plages: readonly Plage[], t: Table): boolean => {
  const colonnes = nombreColonnes(t.cellules)
  return plages.length > 0 && plages.every((p) => normaliserPlage(p).c1 <= 0 && normaliserPlage(p).c2 >= colonnes - 1)
}

/** Vrai si chaque plage couvre toutes les lignes de la table (donc des colonnes entières). */
export const colonnesEntieres = (plages: readonly Plage[], t: Table): boolean => {
  const lignes = t.cellules.length
  return plages.length > 0 && plages.every((p) => normaliserPlage(p).l1 <= 0 && normaliserPlage(p).l2 >= lignes - 1)
}

const uniques = (n: number[]) => [...new Set(n)].sort((a, b) => a - b)
/** Les numéros de ligne touchés par les plages, croissants et sans doublon. */
export const lignesDe = (plages: readonly Plage[]): number[] =>
  uniques(plages.flatMap((p) => { const n = normaliserPlage(p); return Array.from({ length: n.l2 - n.l1 + 1 }, (_, k) => n.l1 + k) }))
/** Les numéros de colonne touchés par les plages, croissants et sans doublon. */
export const colonnesDe = (plages: readonly Plage[]): number[] =>
  uniques(plages.flatMap((p) => { const n = normaliserPlage(p); return Array.from({ length: n.c2 - n.c1 + 1 }, (_, k) => n.c1 + k) }))

/** Les cellules des plages (sans doublon, dans la table), dans l'ordre de lecture. */
function cellulesDes(plages: readonly Plage[], t: Table): [number, number][] {
  const lignes = t.cellules.length
  const colonnes = nombreColonnes(t.cellules)
  const vues = new Set<number>()
  const sortie: [number, number][] = []
  for (const brut of plages) {
    const p = normaliserPlage(brut)
    for (let l = Math.max(p.l1, 0); l <= Math.min(p.l2, lignes - 1); l++)
      for (let c = Math.max(p.c1, 0); c <= Math.min(p.c2, colonnes - 1); c++) {
        const cle = l * 1000 + c
        if (vues.has(cle)) continue
        vues.add(cle)
        sortie.push([l, c])
      }
  }
  return sortie
}

const copieFormat = (f: FormatCellule | null | undefined): FormatCellule | null => (f ? { ...f } : null)

/** Un format sans clé muette ; `null` s'il ne reste rien. */
function nettoyer(f: FormatCellule | null | undefined): FormatCellule | null {
  if (!f) return null
  const sortie: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) if (v !== undefined) sortie[k] = v
  return Object.keys(sortie).length ? (sortie as FormatCellule) : null
}

/**
 * Les formats effectifs, de même forme que les cellules. Sans `formats` (table d'avant), la ligne 0 est un en-tête
 * (gras, fond gris) sauf si `sansEntete` est posé.
 */
export function formatsDe(t: Table): Formats {
  const colonnes = nombreColonnes(t.cellules)
  return t.cellules.map((_, i) =>
    Array.from({ length: colonnes }, (_, j): FormatCellule | null => {
      if (t.formats) return copieFormat(t.formats[i]?.[j])
      return i === 0 && !t.sansEntete ? { gras: true, fond: 'entete' } : null
    }),
  )
}

/** Les largeurs effectives des colonnes : sans `largeurs`, partage égal ; si la somme diffère de l'élément, mise à l'échelle. */
export function largeursDe(t: Table, largeurElement: number): number[] {
  const n = nombreColonnes(t.cellules)
  const l = t.largeurs
  if (l && l.length === n && l.every((v) => v > 0)) {
    const somme = l.reduce((a, b) => a + b, 0)
    if (Math.abs(somme - largeurElement) < 1e-6 || !(largeurElement > 0)) return [...l]
    return l.map((v) => (v * largeurElement) / somme)
  }
  return Array.from({ length: n }, () => largeurElement / Math.max(n, 1))
}

const reecrireCellules = (c: string[][], reecrire?: Reecrire): string[][] =>
  c.map((l) => l.map((v) => (reecrire && v.startsWith('=') ? reecrire(v) : v)))

const bornerEntier = (v: number, min: number, max: number) => Math.min(Math.max(Math.trunc(v), min), max)

/** Ce qu'une ligne ou une colonne neuve reprend de ses voisines : le fond, les styles du texte, l'alignement. Jamais le type. */
const STYLES_TEXTE = ['gras', 'italique', 'barre', 'couleur', 'surligne'] as const
type Voisin = FormatCellule | null | undefined

/**
 * La mise en forme d'une cellule neuve, d'après ses deux voisines d'avant (`aa`, `a`) et d'après (`p`, `pp`) : une
 * propriété de la voisine d'avant est reprise si l'avant-avant ou la voisine d'après la partagent ; sinon celle de
 * la voisine d'après si l'après-après la partage. Insérer sous l'en-tête ne recopie donc pas l'en-tête, et insérer
 * dans un bandeau régulier le prolonge. `seule` : la table n'avait qu'une ligne (ou colonne), on reprend la voisine.
 */
export function continuation(aa: Voisin, a: Voisin, p: Voisin, pp: Voisin, seule: boolean): FormatCellule | null {
  const sortie: Record<string, unknown> = {}
  if (seule) {
    for (const v of [a, p]) {
      if (!v) continue
      for (const k of [...STYLES_TEXTE, 'fond', 'alignement'] as const) if (v[k] !== undefined) sortie[k] = v[k]
    }
    return nettoyer(sortie as FormatCellule)
  }
  for (const k of ['fond', 'alignement'] as const) {
    const v = a?.[k]
    if (v !== undefined && (aa?.[k] === v || p?.[k] === v)) sortie[k] = v
    else if (p?.[k] !== undefined && pp?.[k] === p[k]) sortie[k] = p[k]
  }
  for (const k of STYLES_TEXTE) {
    const v = a?.[k]
    if (v !== undefined && (aa?.[k] === v || p?.[k] === v)) sortie[k] = v
    else if (p?.[k] !== undefined && pp?.[k] === p[k]) sortie[k] = p[k]
  }
  return nettoyer(sortie as FormatCellule)
}

/** Une table dont les trois matrices sont recopiées ; `largeurs` est toujours posé. */
function enMatrices(t: Table, largeurElement?: number): { cellules: string[][]; formats: Formats; largeurs: number[] } {
  const colonnes = nombreColonnes(t.cellules)
  const base = largeurElement ?? (t.largeurs ? t.largeurs.reduce((a, b) => a + b, 0) : colonnes * LARGEUR_COLONNE)
  return {
    cellules: t.cellules.map((l) => [...l]),
    formats: formatsDe(t),
    largeurs: largeursDe(t, base),
  }
}

/** `n` lignes vides insérées à l'index `a` (0 : tout en haut, nombre de lignes : à la fin). */
export function insererLignes(t: Table, a: number, n: number, reecrire?: Reecrire): Table {
  const lignes = t.cellules.length
  const nombre = Math.min(Math.max(Math.trunc(n), 0), LIGNES_MAX - lignes)
  if (nombre <= 0) return t
  const place = bornerEntier(a, 0, lignes)
  const m = enMatrices(t)
  const colonnes = nombreColonnes(m.cellules)
  const f = m.formats
  const neuve = Array.from({ length: colonnes }, (_, j) => continuation(f[place - 2]?.[j], f[place - 1]?.[j], f[place]?.[j], f[place + 1]?.[j], lignes === 1))
  const vides = Array.from({ length: nombre }, () => Array<string>(colonnes).fill(''))
  const formats = Array.from({ length: nombre }, () => neuve.map(copieFormat))
  m.cellules.splice(place, 0, ...vides)
  m.formats.splice(place, 0, ...formats)
  return { ...t, cellules: reecrireCellules(m.cellules, reecrire), formats: m.formats }
}

/** Les lignes `a` à `a + n - 1` retirées ; sans effet si la table passerait sous `LIGNES_MIN` lignes. */
export function retirerLignes(t: Table, a: number, n: number, reecrire?: Reecrire): Table {
  const lignes = t.cellules.length
  const debut = bornerEntier(a, 0, lignes)
  const fin = bornerEntier(a + n, debut, lignes)
  if (fin <= debut || lignes - (fin - debut) < LIGNES_MIN) return t
  const m = enMatrices(t)
  m.cellules.splice(debut, fin - debut)
  m.formats.splice(debut, fin - debut)
  return { ...t, cellules: reecrireCellules(m.cellules, reecrire), formats: m.formats }
}

/**
 * `n` colonnes vides de `LARGEUR_COLONNE` UG insérées à l'index `a`. Une colonne neuve reprend, ligne par ligne, ce
 * que ses voisines ont en commun (voir `continuation`). Sans `largeurs`, `largeurElement`
 * (la largeur de l'élément) sert à retrouver les largeurs des colonnes existantes.
 */
export function insererColonnes(t: Table, a: number, n: number, reecrire?: Reecrire, largeurElement?: number): Table {
  const colonnes = nombreColonnes(t.cellules)
  const nombre = Math.min(Math.max(Math.trunc(n), 0), COLONNES_MAX - colonnes)
  if (nombre <= 0) return t
  const place = bornerEntier(a, 0, colonnes)
  const m = enMatrices(t, largeurElement)
  m.cellules = m.cellules.map((l) => [...l.slice(0, place), ...Array<string>(nombre).fill(''), ...l.slice(place)])
  m.formats = m.formats.map((l) => {
    const style = continuation(l[place - 2], l[place - 1], l[place], l[place + 1], colonnes === 1)
    return [...l.slice(0, place), ...Array.from({ length: nombre }, () => copieFormat(style)), ...l.slice(place)]
  })
  m.largeurs.splice(place, 0, ...Array<number>(nombre).fill(LARGEUR_COLONNE))
  return { ...t, cellules: reecrireCellules(m.cellules, reecrire), formats: m.formats, largeurs: m.largeurs }
}

/** Les colonnes `a` à `a + n - 1` retirées (avec leur largeur) ; sans effet s'il n'en resterait pas `COLONNES_MIN`. */
export function retirerColonnes(t: Table, a: number, n: number, reecrire?: Reecrire, largeurElement?: number): Table {
  const colonnes = nombreColonnes(t.cellules)
  const debut = bornerEntier(a, 0, colonnes)
  const fin = bornerEntier(a + n, debut, colonnes)
  if (fin <= debut || colonnes - (fin - debut) < COLONNES_MIN) return t
  const m = enMatrices(t, largeurElement)
  const sans = <T>(l: T[]) => [...l.slice(0, debut), ...l.slice(fin)]
  m.largeurs.splice(debut, fin - debut)
  return {
    ...t,
    cellules: reecrireCellules(m.cellules.map(sans), reecrire),
    formats: m.formats.map(sans),
    largeurs: m.largeurs,
  }
}

/** Le bloc `de` à `de + n - 1` sorti du tableau et remis pour qu'il commence à l'index `vers` du résultat. */
function deplacerBloc<T>(l: readonly T[], de: number, n: number, vers: number): T[] {
  const copie = [...l]
  const bloc = copie.splice(de, n)
  copie.splice(bornerEntier(vers, 0, copie.length), 0, ...bloc)
  return copie
}

/** Les lignes `de` à `de + n - 1` déplacées pour commencer à la ligne `vers` (position dans le résultat). */
export function deplacerLignes(t: Table, de: number, n: number, vers: number, reecrire?: Reecrire): Table {
  const lignes = t.cellules.length
  if (de < 0 || n < 1 || de + n > lignes) return t
  const m = enMatrices(t)
  return {
    ...t,
    cellules: reecrireCellules(deplacerBloc(m.cellules, de, n, vers), reecrire),
    formats: deplacerBloc(m.formats, de, n, vers),
  }
}

/** Les colonnes `de` à `de + n - 1` déplacées pour commencer à la colonne `vers` (position dans le résultat). */
export function deplacerColonnes(t: Table, de: number, n: number, vers: number, reecrire?: Reecrire, largeurElement?: number): Table {
  const colonnes = nombreColonnes(t.cellules)
  if (de < 0 || n < 1 || de + n > colonnes) return t
  const m = enMatrices(t, largeurElement)
  return {
    ...t,
    cellules: reecrireCellules(m.cellules.map((l) => deplacerBloc(l, de, n, vers)), reecrire),
    formats: m.formats.map((l) => deplacerBloc(l, de, n, vers)),
    largeurs: deplacerBloc(m.largeurs, de, n, vers),
  }
}

/** Le texte des cellules de la plage effacé ; les formats restent. */
export function viderPlage(t: Table, plage: Plage): Table {
  const cellules = t.cellules.map((l) => [...l])
  for (const [l, c] of cellulesDes([plage], t)) cellules[l]![c] = ''
  return { ...t, cellules }
}

/** Applique `f` au format de chaque cellule des plages ; `null` ou un objet vide efface la mise en forme. */
export function appliquerFormat(t: Table, plages: readonly Plage[], f: (format: FormatCellule | null) => FormatCellule | null): Table {
  const formats = formatsDe(t)
  for (const [l, c] of cellulesDes(plages, t)) formats[l]![c] = nettoyer(f(copieFormat(formats[l]![c])))
  return { ...t, formats }
}

/** Gras, italique ou barré sur toute la cellule : la première cellule décide (si elle l'a, on l'ôte partout). */
export function basculerStyle(t: Table, plages: readonly Plage[], style: 'gras' | 'italique' | 'barre'): Table {
  const premiere = cellulesDes(plages, t)[0]
  if (!premiere) return t
  const actif = formatsDe(t)[premiere[0]]![premiere[1]]?.[style] === true
  return appliquerFormat(t, plages, (f) => {
    const sortie: FormatCellule = { ...f }
    if (actif) delete sortie[style]
    else sortie[style] = true
    return sortie
  })
}

/* ───────────── Largeurs ───────────── */

const arrondir = (v: number) => Math.round(v * 1000) / 1000

/**
 * Élargit (ou rétrécit, `delta` négatif) les colonnes données : le delta se partage entre elles, aucune ne passe sous
 * `LARGEUR_COLONNE_MIN` et ce qu'une colonne bloquée ne peut pas rendre est repris par les autres.
 */
export function elargirColonnes(largeurs: readonly number[], colonnes: readonly number[], delta: number): number[] {
  const sortie = [...largeurs]
  let actives = uniques(colonnes.filter((c) => c >= 0 && c < sortie.length))
  let reste = delta
  while (actives.length && Math.abs(reste) > 1e-9) {
    const part = reste / actives.length
    const bloquees = actives.filter((c) => sortie[c]! + part < LARGEUR_COLONNE_MIN)
    if (!bloquees.length) {
      for (const c of actives) sortie[c] = arrondir(sortie[c]! + part)
      break
    }
    for (const c of bloquees) {
      reste -= Math.min(0, LARGEUR_COLONNE_MIN - sortie[c]!)
      sortie[c] = Math.max(Math.min(sortie[c]!, LARGEUR_COLONNE_MIN), LARGEUR_COLONNE_MIN)
    }
    actives = actives.filter((c) => !bloquees.includes(c))
  }
  return sortie
}

/** Cale le total sur une UG entière : le reste (positif ou négatif) va sur la colonne `sur`, la dernière par défaut. */
export function calerSurGrille(largeurs: readonly number[], sur = largeurs.length - 1): number[] {
  if (!largeurs.length) return []
  const cible = Math.max(Math.round(largeurs.reduce((a, b) => a + b, 0)), largeurs.length * LARGEUR_COLONNE_MIN)
  const k = bornerEntier(sur, 0, largeurs.length - 1)
  const autres = largeurs.reduce((a, v, i) => (i === k ? a : a + v), 0)
  const sortie = [...largeurs]
  sortie[k] = arrondir(Math.max(cible - autres, LARGEUR_COLONNE_MIN))
  return sortie
}

const colonneVide = (c: string[][], j: number) => c.every((l) => (l[j] ?? '') === '')
const ligneVide = (c: string[][], i: number) => (c[i] ?? []).every((v) => v === '')

/**
 * Ce que fait la poignée du coin de l'élément : elle n'étire pas, elle ajoute des colonnes de `LARGEUR_COLONNE` UG
 * (dès une demi-colonne) et des lignes (dès une demi-ligne de `hauteurLigneUG`), ou retire seulement des colonnes
 * et des lignes vides, à la fin, jamais sous les minimums. Rend la table et ses largeurs.
 */
export function ajusterALaPoignee(
  t: Table,
  largeurs: readonly number[],
  dLargeurUG: number,
  dHauteurUG: number,
  hauteurLigneUG = 3,
  reecrire?: Reecrire,
): { table: Table; largeurs: number[] } {
  let table: Table = { ...t, largeurs: [...largeurs] }
  const dc = Math.floor((dLargeurUG + LARGEUR_COLONNE / 2) / LARGEUR_COLONNE)
  const dl = Math.floor((dHauteurUG + hauteurLigneUG / 2) / hauteurLigneUG)
  if (dc > 0) table = insererColonnes(table, nombreColonnes(table.cellules), dc, reecrire)
  if (dc < 0) {
    for (let k = 0; k < -dc; k++) {
      const dernier = nombreColonnes(table.cellules) - 1
      if (dernier < COLONNES_MIN || !colonneVide(table.cellules, dernier)) break
      table = retirerColonnes(table, dernier, 1, reecrire)
    }
  }
  if (dl > 0) table = insererLignes(table, table.cellules.length, dl, reecrire)
  if (dl < 0) {
    for (let k = 0; k < -dl; k++) {
      const derniere = table.cellules.length - 1
      if (derniere < LIGNES_MIN || !ligneVide(table.cellules, derniere)) break
      table = retirerLignes(table, derniere, 1, reecrire)
    }
  }
  return { table, largeurs: [...(table.largeurs ?? largeurs)] }
}
