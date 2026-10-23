import type { FormatCellule, Table } from '../../coeur/tableau'
import { t } from '../../langue'
import { type Regional, afficher, localeDe, regional } from './formats'
import { type CodeErreur, type Resultat, type Valeur, evaluerTable } from './formules'
import { formatsDe, nombreColonnes } from './grille'

/** Ce que la table montre d'une cellule : le texte, formaté selon le type, et l'erreur d'une formule s'il y en a une. */

const CLES_ERREUR: Record<CodeErreur, string> = {
  '#PARSE': 'table.erreur.syntaxe',
  '#DIV/0!': 'table.erreur.division',
  '#REF!': 'table.erreur.reference',
  '#NAME?': 'table.erreur.nom',
  '#VALUE!': 'table.erreur.valeur',
  '#CYCLE!': 'table.erreur.circulaire',
  '#N/A': 'table.erreur.indisponible',
}

/** La phrase qui dit une erreur de formule. */
export const messageErreur = (code: CodeErreur): string => t(CLES_ERREUR[code])

/** Un nombre sans bruit de calcul (0,1 + 0,2), en écriture décimale que `afficher` sait lire. */
function canon(n: number): string | null {
  const s = String(Number(n.toPrecision(15)))
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null
}

function texteDeValeur(v: Valeur, format: FormatCellule | null | undefined, lg: Regional): string {
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'string') return v
  const type = format?.type
  const c = canon(v)
  if (c !== null && (type === 'nombre' || type === 'monnaie' || type === 'pourcent' || type === 'date')) return afficher(c, format, lg)
  if (type === 'texte' || type === 'case') return c ?? String(v)
  return new Intl.NumberFormat(localeDe(lg), { maximumFractionDigits: 10, useGrouping: false }).format(v)
}

/** Le texte affiché d'une cellule, sachant le résultat de sa formule. Une formule en erreur n'affiche rien (le rendu dessine une pastille). */
export function texteAffiche(texte: string, format: FormatCellule | null | undefined, resultat: Resultat | undefined, lg: Regional = regional()): string {
  if (texte.startsWith('=')) {
    if (!resultat || resultat.erreur) return ''
    return texteDeValeur(resultat.valeur, format, lg)
  }
  return afficher(texte, format, lg)
}

/** Le texte affiché de chaque cellule de la table. */
export function textesAffiches(table: Table, lg: Regional = regional()): string[][] {
  const formats = formatsDe(table)
  const resultats = evaluerTable(table.cellules)
  return table.cellules.map((ligne, i) => ligne.map((texte, j) => texteAffiche(texte, formats[i]?.[j], resultats[i]?.[j], lg)))
}

/** Ce que cherche la recherche : le titre, puis les cellules telles qu'on les lit. */
export function texteCherchableDeTable(table: Table, lg: Regional = regional()): string {
  return [table.avecTitre ? table.titre : undefined, ...textesAffiches(table, lg).flat()].filter(Boolean).join('\n')
}

/** Ce qu'on lit d'une table dans une liste : son titre ou sa première ligne, puis le nombre de lignes. */
export function resumeTable(table: Table): string {
  const premiere = (textesAffiches(table)[0] ?? []).filter(Boolean).join(' | ')
  const debut = (table.avecTitre && table.titre?.trim()) || premiere || t('type.table')
  return t('table.resume', { entete: debut, lignes: table.cellules.length, colonnes: nombreColonnes(table.cellules) })
}
