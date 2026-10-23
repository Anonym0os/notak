import { type Element, type FormatCellule, type PassageCellule, type Table, type TypeCellule, nouvelId } from '../../coeur/tableau'
import { textesAffiches } from './affichage'
import type { Cellule } from './etat'
import { deduireType, peutPrendreType, saisir, type Regional } from './formats'
import {
  type OperationStructure,
  citerReferences,
  dateVersSerie,
  decalerFormule,
  fermerParentheses,
  translaterFormule,
  typeDuResultat,
} from './formules'
import {
  type Plage,
  appliquerFormat,
  basculerStyle,
  changerCellule,
  colonnesDe,
  colonnesEntieres,
  dansPlage,
  deplacerColonnes,
  deplacerLignes,
  formatsDe,
  insererColonnes,
  insererLignes,
  lignesDe,
  lignesEntieres,
  nombreColonnes,
  normaliserPlage,
  retirerColonnes,
  retirerLignes,
  viderPlage,
  LIGNES_MIN,
  COLONNES_MIN,
  LIGNES_MAX,
  COLONNES_MAX,
  LARGEUR_COLONNE,
  grilleVide,
} from './grille'
import { type DonneesCollage, coller, recopier, versHtml, versTexte } from './pressePapiers'
import { avecRiche, peutEtreRiche, richeDe } from './riche'

/**
 * Les gestes de la table sur une sélection, tous purs : une table et des plages en entrée, une table (et la
 * sélection qui en découle) en sortie. `null` : le geste n'a pas lieu (au bord, sur plusieurs plages…).
 * Les formules sont réécrites par le moteur à chaque changement de structure.
 */

export interface Issue {
  table: Table
  plages?: Plage[]
  ancre?: Cellule
  tete?: Cellule
}

const plageSeule = (p: Plage): Pick<Issue, 'plages' | 'ancre' | 'tete'> => {
  const n = normaliserPlage(p)
  return { plages: [n], ancre: { l: n.l1, c: n.c1 }, tete: { l: n.l2, c: n.c2 } }
}

export const plageEntre = (a: Cellule, b: Cellule): Plage => normaliserPlage({ l1: a.l, c1: a.c, l2: b.l, c2: b.c })
export const plageDe = (c: Cellule): Plage => ({ l1: c.l, c1: c.c, l2: c.l, c2: c.c })

/** Les cellules des plages, sans doublon, dans l'ordre de lecture, dans la table. */
export function cellulesDe(plages: readonly Plage[], t: Table): [number, number][] {
  const lignes = t.cellules.length
  const colonnes = nombreColonnes(t.cellules)
  const sortie: [number, number][] = []
  for (let l = 0; l < lignes; l++) for (let c = 0; c < colonnes; c++) if (plages.some((p) => dansPlage(p, l, c))) sortie.push([l, c])
  return sortie
}

/** Les plages ramenées dans la table (après un retrait, un collage) ; vides si plus rien n'y est. */
export function bornerPlages(plages: readonly Plage[], t: Table): Plage[] {
  const [l, c] = [t.cellules.length - 1, nombreColonnes(t.cellules) - 1]
  return plages.flatMap((p) => {
    const n = normaliserPlage(p)
    if (n.l1 > l || n.c1 > c) return []
    return [{ l1: n.l1, c1: n.c1, l2: Math.min(n.l2, l), c2: Math.min(n.c2, c) }]
  })
}

const reecrire = (op: OperationStructure) => (texte: string) => decalerFormule(texte, op)

/* ───────────── Structure : insérer, retirer, déplacer ───────────── */

export const memeTable = (a: Table, b: Table) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * Ajoute autant de lignes que la sélection en couvre, au-dessus ou au-dessous. Une seule plage. Des colonnes
 * entières choisies : une seule ligne, tout en haut ou tout en bas, sur ces colonnes.
 */
export function insererAutourLignes(t: Table, largeur: number, plages: readonly Plage[], cote: 'dessus' | 'dessous'): Issue | null {
  if (plages.length !== 1) return null
  const p = normaliserPlage(plages[0]!)
  const auBord = colonnesEntieres(plages, t) && !lignesEntieres(plages, t)
  const n = auBord ? 1 : p.l2 - p.l1 + 1
  const a = auBord ? (cote === 'dessus' ? 0 : t.cellules.length) : cote === 'dessus' ? p.l1 : p.l2 + 1
  const table = insererLignes(t, a, n, reecrire({ genre: 'insererLignes', a, n }))
  if (table === t) return null
  void largeur
  return { table, ...plageSeule({ l1: a, l2: a + n - 1, c1: p.c1, c2: p.c2 }) }
}

/**
 * Ajoute autant de colonnes que la sélection en couvre, à gauche ou à droite. Une seule plage. Des lignes entières
 * choisies : une seule colonne, tout à gauche ou tout à droite, sur ces lignes.
 */
export function insererAutourColonnes(t: Table, largeur: number, plages: readonly Plage[], cote: 'gauche' | 'droite'): Issue | null {
  if (plages.length !== 1) return null
  const p = normaliserPlage(plages[0]!)
  const auBord = lignesEntieres(plages, t) && !colonnesEntieres(plages, t)
  const n = auBord ? 1 : p.c2 - p.c1 + 1
  const a = auBord ? (cote === 'gauche' ? 0 : nombreColonnes(t.cellules)) : cote === 'gauche' ? p.c1 : p.c2 + 1
  const table = insererColonnes(t, a, n, reecrire({ genre: 'insererColonnes', a, n }), largeur)
  if (table === t) return null
  return { table, ...plageSeule({ l1: p.l1, l2: p.l2, c1: a, c2: a + n - 1 }) }
}

/** Les suites d'indices consécutifs : [1, 2, 4] donne [[1, 2], [4]]. */
function suites(indices: readonly number[]): [number, number][] {
  const sortie: [number, number][] = []
  for (const i of indices) {
    const derniere = sortie[sortie.length - 1]
    if (derniere && derniere[1] === i - 1) derniere[1] = i
    else sortie.push([i, i])
  }
  return sortie
}

export function retirerLesLignes(t: Table, plages: readonly Plage[]): Issue | null {
  const lignes = lignesDe(plages)
  if (!lignes.length || t.cellules.length - lignes.length < LIGNES_MIN) return null
  let table = t
  for (const [a, b] of suites(lignes).reverse()) {
    const n = b - a + 1
    table = retirerLignes(table, a, n, reecrire({ genre: 'retirerLignes', a, n }))
  }
  if (table === t) return null
  const colonne = Math.min(normaliserPlage(plages[0]!).c1, nombreColonnes(table.cellules) - 1)
  const l = Math.min(lignes[0]!, table.cellules.length - 1)
  return { table, ...plageSeule({ l1: l, l2: l, c1: colonne, c2: colonne }) }
}

export function retirerLesColonnes(t: Table, largeur: number, plages: readonly Plage[]): Issue | null {
  const colonnes = colonnesDe(plages)
  if (!colonnes.length || nombreColonnes(t.cellules) - colonnes.length < COLONNES_MIN) return null
  let table = t
  for (const [a, b] of suites(colonnes).reverse()) {
    const n = b - a + 1
    table = retirerColonnes(table, a, n, reecrire({ genre: 'retirerColonnes', a, n }), largeur)
    largeur = table.largeurs ? table.largeurs.reduce((x, y) => x + y, 0) : largeur
  }
  if (table === t) return null
  const l = Math.min(normaliserPlage(plages[0]!).l1, table.cellules.length - 1)
  const c = Math.min(colonnes[0]!, nombreColonnes(table.cellules) - 1)
  return { table, ...plageSeule({ l1: l, l2: l, c1: c, c2: c }) }
}

/** Cmd+Retour arrière : les colonnes si la sélection est faite de colonnes entières, sinon les lignes. */
export function retirerSelection(t: Table, largeur: number, plages: readonly Plage[]): Issue | null {
  if (plages.length === 0) return null
  return colonnesEntieres(plages, t) && !lignesEntieres(plages, t) ? retirerLesColonnes(t, largeur, plages) : retirerLesLignes(t, plages)
}

/** Cmd+Entrée : une ligne dessous, ou une colonne à droite si la sélection est faite de colonnes entières. */
export function insererApres(t: Table, largeur: number, plages: readonly Plage[]): Issue | null {
  if (colonnesEntieres(plages, t) && !lignesEntieres(plages, t)) return insererAutourColonnes(t, largeur, plages, 'droite')
  return insererAutourLignes(t, largeur, plages, 'dessous')
}

/** Déplace le bloc de lignes `de` à `de + n - 1` pour qu'il commence à la ligne `vers` du résultat. */
export function deplacerLesLignes(t: Table, de: number, n: number, vers: number): Issue | null {
  if (vers === de || vers < 0 || vers + n > t.cellules.length) return null
  const table = deplacerLignes(t, de, n, vers, reecrire({ genre: 'deplacerLignes', de, n, vers }))
  if (table === t) return null
  return { table, ...plageSeule({ l1: vers, l2: vers + n - 1, c1: 0, c2: nombreColonnes(t.cellules) - 1 }) }
}

export function deplacerLesColonnes(t: Table, largeur: number, de: number, n: number, vers: number): Issue | null {
  if (vers === de || vers < 0 || vers + n > nombreColonnes(t.cellules)) return null
  const table = deplacerColonnes(t, de, n, vers, reecrire({ genre: 'deplacerColonnes', de, n, vers }), largeur)
  if (table === t) return null
  return { table, ...plageSeule({ l1: 0, l2: t.cellules.length - 1, c1: vers, c2: vers + n - 1 }) }
}

/** Les lignes entières de la première plage (les autres n'y sont pour rien) un cran plus haut ou plus bas. */
export function glisserLignes(t: Table, plages: readonly Plage[], sens: -1 | 1): Issue | null {
  const premiere = plages.slice(0, 1)
  if (!premiere.length || !lignesEntieres(premiere, t)) return null
  const p = normaliserPlage(premiere[0]!)
  return deplacerLesLignes(t, p.l1, p.l2 - p.l1 + 1, p.l1 + sens)
}

export function glisserColonnes(t: Table, largeur: number, plages: readonly Plage[], sens: -1 | 1): Issue | null {
  const premiere = plages.slice(0, 1)
  if (!premiere.length || !colonnesEntieres(premiere, t)) return null
  const p = normaliserPlage(premiere[0]!)
  return deplacerLesColonnes(t, largeur, p.c1, p.c2 - p.c1 + 1, p.c1 + sens)
}

/**
 * Où va un bloc qu'on lâche à la frontière `frontiere` (0 : avant le premier, `total` : après le dernier) ?
 * Le `vers` du moteur est une position dans le résultat ; `null` si le bloc ne bougerait pas.
 */
export function versDeFrontiere(de: number, n: number, frontiere: number): number | null {
  if (frontiere >= de && frontiere <= de + n) return null
  return frontiere < de ? frontiere : frontiere - n
}

/* ───────────── Droits du menu ───────────── */

export interface Droits {
  lignes: number
  colonnes: number
  plusieurs: boolean
  lignesEntieres: boolean
  colonnesEntieres: boolean
  insererLignes: boolean
  insererColonnes: boolean
  afficherLignes: boolean
  afficherColonnes: boolean
  deplacerLignes: boolean
  deplacerColonnes: boolean
  lignesHaut: boolean
  lignesBas: boolean
  colonnesGauche: boolean
  colonnesDroite: boolean
  retirerLignes: boolean
  retirerColonnes: boolean
}

export function droitsDe(t: Table, plages: readonly Plage[]): Droits {
  const plusieurs = plages.length > 1
  const ls = lignesDe(plages)
  const cs = colonnesDe(plages)
  const colonnes = nombreColonnes(t.cellules)
  const entL = lignesEntieres(plages, t)
  const entC = colonnesEntieres(plages, t)
  // Les déplacements ne regardent que la première plage, même quand il y en a plusieurs.
  const premiere = plages.slice(0, 1)
  const p = premiere.length ? normaliserPlage(premiere[0]!) : null
  const ligne1 = !!p && lignesEntieres(premiere, t) && !colonnesEntieres(premiere, t)
  const colonne1 = !!p && colonnesEntieres(premiere, t) && !lignesEntieres(premiere, t)
  // Des colonnes entières n'ajoutent qu'une ligne (au bord), des lignes entières qu'une colonne.
  const lignesAjoutees = entC && !entL ? 1 : ls.length
  const colonnesAjoutees = entL && !entC ? 1 : cs.length
  return {
    lignes: ls.length,
    colonnes: cs.length,
    plusieurs,
    lignesEntieres: entL,
    colonnesEntieres: entC,
    // Toute la table choisie : ni insertion ni retrait de lignes ou de colonnes, seulement vider.
    afficherLignes: !entC,
    afficherColonnes: !entL,
    insererLignes: !plusieurs && t.cellules.length + lignesAjoutees <= LIGNES_MAX,
    insererColonnes: !plusieurs && colonnes + colonnesAjoutees <= COLONNES_MAX,
    deplacerLignes: ligne1,
    deplacerColonnes: colonne1,
    lignesHaut: ligne1 && p!.l1 > 0,
    lignesBas: ligne1 && p!.l2 < t.cellules.length - 1,
    colonnesGauche: colonne1 && p!.c1 > 0,
    colonnesDroite: colonne1 && p!.c2 < colonnes - 1,
    retirerLignes: !plusieurs && t.cellules.length - ls.length >= LIGNES_MIN,
    retirerColonnes: !plusieurs && colonnes - cs.length >= COLONNES_MIN,
  }
}

/* ───────────── Contenu, styles, types ───────────── */

/** Vide le texte des cellules choisies ; leur mise en forme reste, sauf la case à cocher, qui redevient une cellule ordinaire. */
export function viderSelection(t: Table, plages: readonly Plage[]): Table {
  const vide = plages.reduce((table, p) => viderPlage(table, p), t)
  if (!t.formats) return vide
  // Le texte riche s'en va avec le texte.
  return appliquerFormat(vide, plages, (f) => avecRiche(f?.type === 'case' ? sansType(f) : f, undefined))
}

export { basculerStyle }

type Patch = Partial<Record<keyof FormatCellule, FormatCellule[keyof FormatCellule] | undefined>>

/** Pose ces clés dans le format de chaque cellule choisie ; une clé à `undefined` s'efface. */
export function poserFormat(t: Table, plages: readonly Plage[], patch: Patch): Table {
  return appliquerFormat(t, plages, (f) => ({ ...(f ?? {}), ...patch }) as FormatCellule)
}

/** Les options qui n'ont de sens que pour un type : elles s'en vont avec lui. */
const CLES_DE_TYPE = ['type', 'decimales', 'sansMilliers', 'devise', 'affichageDevise', 'comptable', 'date', 'heure', 'heureEntreParentheses'] as const

export function sansType(f: FormatCellule | null | undefined): FormatCellule | null {
  if (!f) return null
  const sortie: FormatCellule = { ...f }
  for (const k of CLES_DE_TYPE) delete sortie[k]
  return Object.keys(sortie).length ? sortie : null
}

const optionsDeType = (f: FormatCellule | null | undefined): FormatCellule => {
  const sortie: Record<string, unknown> = {}
  for (const k of CLES_DE_TYPE) if (f?.[k] !== undefined) sortie[k] = f[k]
  return sortie as FormatCellule
}

/** Les cellules des plages qui peuvent prendre ce type. */
export function cellulesPouvant(t: Table, plages: readonly Plage[], type: TypeCellule | undefined, lg: Regional): [number, number][] {
  return cellulesDe(plages, t).filter(([l, c]) => peutPrendreType(t.cellules[l]![c]!, type, lg))
}

/**
 * Donne un type aux cellules choisies qui peuvent le prendre. `undefined` : Auto. Passer en Texte fige le texte
 * tel qu'il s'affichait ; une date écrite en toutes lettres devient son numéro de série.
 */
export function choisirType(t: Table, plages: readonly Plage[], type: TypeCellule | undefined, lg: Regional): Table {
  const concernees = cellulesPouvant(t, plages, type, lg)
  if (!concernees.length) return t
  const formats = formatsDe(t)
  const cellules = t.cellules.map((l) => [...l])
  const affiches = type === 'texte' ? textesAffiches(t, lg) : null
  for (const [l, c] of concernees) {
    const ancien = formats[l]![c] ?? null
    let texte = cellules[l]![c]!
    let suite: FormatCellule | null = sansType(ancien)
    if (type === 'texte') {
      if (ancien?.type && ancien.type !== 'texte') texte = affiches![l]![c]! || texte
      suite = { ...(suite ?? {}), type }
    } else if (type === 'date') {
      const d = texte && !texte.startsWith('=') ? deduireType(texte, lg) : null
      if (d?.type === 'date') {
        texte = d.valeur
        suite = { ...(suite ?? {}), type, ...d.options }
        // Posée à la main, une date se montre en mots courts ; une heure ajoutée viendra entre parenthèses.
      } else suite = { ...(suite ?? {}), type, date: 'court', heureEntreParentheses: true }
    } else if (type) {
      suite = { ...(suite ?? {}), type }
    }
    cellules[l]![c] = texte
    formats[l]![c] = suite && Object.keys(suite).length ? suite : null
  }
  return { ...t, cellules, formats }
}

/* ───────────── Écrire une cellule ───────────── */

const serieDuJour = (d: Date) => dateVersSerie(new Date(d.getFullYear(), d.getMonth(), d.getDate()))

/** Le numéro de série d'un jour et d'une heure (en secondes depuis minuit) choisis au calendrier. */
export function serieDe(jour: Date, secondes: number): string {
  return String(Number((serieDuJour(jour) + secondes / 86400).toFixed(9)))
}

/**
 * Range ce que l'on vient d'écrire dans la cellule. Une formule se ferme et prend le type de son résultat ; le
 * reste passe par `saisir` (le type se déduit du texte). `calendrier` : le jour vient du calendrier, le format de la
 * cellule ne change pas, sauf l'heure.
 */
export function ecrireCellule(
  t: Table,
  l: number,
  c: number,
  saisie: string,
  lg: Regional,
  calendrier?: { serie: string; avecHeure?: boolean },
  passages?: readonly PassageCellule[],
): Table {
  const formats = formatsDe(t)
  const ancien = formats[l]?.[c] ?? null
  let texte = saisie
  let format: FormatCellule | null = ancien
  if (calendrier && ancien?.type === 'date') {
    texte = calendrier.serie
    if (calendrier.avecHeure !== undefined) {
      const heure = ancien.heure ?? 'aucune'
      if (calendrier.avecHeure && heure === 'aucune') format = { ...ancien, heure: '24h' }
      if (!calendrier.avecHeure && heure !== 'aucune') format = { ...ancien, heure: 'aucune' }
    }
  } else if (saisie.startsWith('=')) {
    texte = fermerParentheses(saisie)
    const apres = changerCellule(t.cellules, l, c, texte)
    const type = typeDuResultat(texte, apres, formats)
    if (type && type !== ancien?.type) {
      const cite = citerReferences(texte)[0]?.plage
      const source = cite ? formats[cite.l1]?.[cite.c1] : null
      format = { ...(sansType(ancien) ?? {}), ...(source?.type === type ? optionsDeType(source) : { type }) }
    }
  } else {
    const s = saisir(ancien, saisie, lg)
    texte = s.texte
    format = s.format
  }
  // Le texte riche ne tient que pour le texte tel qu'il a été écrit, dans une cellule qui reste du texte.
  const riche = !saisie.startsWith('=') && texte === saisie && peutEtreRiche(format, texte) ? richeDe(texte, passages ?? []) : undefined
  format = avecRiche(format, riche)
  if (texte === t.cellules[l]?.[c] && JSON.stringify(format) === JSON.stringify(ancien)) return t
  return appliquerFormat(changerCellule(t, l, c, texte), [plageDe({ l, c })], () => format)
}

/* ───────────── Presse-papiers, recopie ───────────── */

/** Le texte et le HTML que l'on copie : la première plage. */
export function copiable(t: Table, plages: readonly Plage[]): { texte: string; html: string; plage: Plage } | null {
  const p = plages[0]
  if (!p) return null
  const plage = normaliserPlage(p)
  return { texte: versTexte(t, plage), html: versHtml(t, plage), plage }
}

/**
 * Colle à partir de la première cellule choisie. `decalage` : de combien les références des formules collées
 * se déplacent. La sélection devient ce qui vient d'être collé.
 */
export function collerA(t: Table, plages: readonly Plage[], donnees: DonneesCollage, decalage: { dl: number; dc: number } | null, lg: Regional): Issue | null {
  const p = plages[0]
  if (!p) return null
  const { l1, c1 } = normaliserPlage(p)
  const table = coller(t, { l: l1, c: c1 }, donnees, decalage ? (x) => translaterFormule(x, decalage.dl, decalage.dc) : undefined, lg)
  if (table === t) return null
  const hauteur = donnees.cellules.length
  const largeur = Math.max(1, ...donnees.cellules.map((x) => x.length))
  const l2 = Math.min(l1 + hauteur - 1, table.cellules.length - 1)
  const c2 = Math.min(c1 + largeur - 1, nombreColonnes(table.cellules) - 1)
  return { table, ...plageSeule({ l1, c1, l2, c2 }) }
}

/** La poignée de recopie lâchée sur `cible`. */
export function recopierSur(t: Table, source: Plage, cible: Plage): Issue | null {
  const dims = { lignes: t.cellules.length, colonnes: nombreColonnes(t.cellules) }
  const table = recopier(t, source, cible, (x, dl, dc) => translaterFormule(x, dl, dc, dims))
  if (memeTable(table, t)) return null
  return { table, ...plageSeule(cible) }
}

/**
 * La plage que la poignée de recopie vise : la source, prolongée vers la cellule survolée dans le sens où l'on
 * a le plus tiré (haut, bas, gauche ou droite). Rien si le pointeur est resté dans la source.
 */
export function plageDeRecopie(source: Plage, survol: Cellule): Plage {
  const s = normaliserPlage(source)
  const dessous = Math.max(0, survol.l - s.l2)
  const dessus = Math.max(0, s.l1 - survol.l)
  const droite = Math.max(0, survol.c - s.c2)
  const gauche = Math.max(0, s.c1 - survol.c)
  const max = Math.max(dessous, dessus, droite, gauche)
  if (max === 0) return s
  if (dessous === max) return { ...s, l2: survol.l }
  if (dessus === max) return { ...s, l1: survol.l }
  if (droite === max) return { ...s, c2: survol.c }
  return { ...s, c1: survol.c }
}

/** Une table neuve, de la taille de ce qu'on a collé sur la toile (tableur, autre table), sans en-tête ajouté. */
export function tableDepuisCollage(donnees: DonneesCollage, x: number, y: number, lg: Regional): Element<Table> {
  const lignes = Math.min(Math.max(LIGNES_MIN, donnees.cellules.length), LIGNES_MAX)
  const colonnes = Math.min(Math.max(COLONNES_MIN, ...donnees.cellules.map((l) => l.length)), COLONNES_MAX)
  const depart: Table = {
    type: 'table',
    cellules: grilleVide(lignes, colonnes),
    formats: Array.from({ length: lignes }, () => Array.from({ length: colonnes }, (): FormatCellule | null => null)),
    largeurs: Array.from({ length: colonnes }, () => LARGEUR_COLONNE),
  }
  const table = coller(depart, { l: 0, c: 0 }, donnees, undefined, lg)
  return { id: nouvelId(), x, y, largeur: colonnes * LARGEUR_COLONNE, contenu: table }
}
