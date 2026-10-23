import type { Id, Operation, Table } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { type Issue, memeTable } from './actions'
import { poserEtat } from './etat'
import { largeursDe, nombreColonnes } from './grille'

/**
 * Un geste sur une table devient un pas d'historique : le contenu change, et la largeur de l'élément avec lui
 * (elle est toujours la somme des largeurs de colonnes). Les gestes de `actions.ts` ne connaissent ni le magasin ni
 * l'élément ; c'est ici qu'ils s'y branchent.
 */

const arrondir = (v: number) => Math.round(v * 1000) / 1000

/** La largeur de l'élément qui va avec ces colonnes : leur somme (`repli` si la table n'a pas de largeurs valides). */
export function largeurDesColonnes(t: Table, repli: number): number {
  const ls = t.largeurs
  if (!ls || ls.length !== nombreColonnes(t.cellules) || !ls.every((v) => v > 0)) return repli
  return arrondir(ls.reduce((a, b) => a + b, 0))
}

/** Un geste : la table (ses largeurs posées) et la largeur de l'élément en entrée, le résultat en sortie. */
export type Geste = (table: Table, largeur: number) => Issue | null

/**
 * Applique le geste à ces tables, d'un seul pas. Rend vrai si quelque chose a changé. La sélection de cellules ne
 * suit que si une seule table est visée.
 */
export function modifierTables(contexte: ContexteToile, ids: readonly Id[], f: Geste): boolean {
  if (contexte.services.lectureSeule) return false
  const pas: Operation[] = []
  let suite: { id: Id; issue: Issue } | null = null
  for (const id of ids) {
    const el = contexte.magasin.lire().elements.find((x) => x.id === id)
    if (!el || el.contenu.type !== 'table') continue
    const base: Table = { ...el.contenu, largeurs: largeursDe(el.contenu, el.largeur) }
    const issue = f(base, el.largeur)
    if (!issue) continue
    if (!memeTable(base, issue.table)) pas.push({ type: 'contenu', id, avant: el.contenu, apres: issue.table })
    const largeur = largeurDesColonnes(issue.table, el.largeur)
    if (Math.abs(largeur - el.largeur) > 1e-9) pas.push({ type: 'redimensionner', id, de: el.largeur, vers: largeur })
    suite = { id, issue }
  }
  if (pas.length > 0) contexte.magasin.faire(pas)
  if (suite && ids.length === 1 && suite.issue.plages) {
    const { id, issue } = suite
    poserEtat(id, { plages: issue.plages!, ...(issue.ancre ? { ancre: issue.ancre } : {}), ...(issue.tete ? { tete: issue.tete } : {}) })
  }
  return pas.length > 0
}

export const modifierTable = (contexte: ContexteToile, id: Id, f: Geste): boolean => modifierTables(contexte, [id], f)
