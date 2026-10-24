import type { Node as NoeudPM, NodeType } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Extension } from '@tiptap/react'
import { racines, retirer } from './gestes'
import { blocsDe } from './modele'

/**
 * Les colonnes (docs/NOTION.md § 8) : lâcher un bloc sur le côté d'un autre crée une rangée, ou y ajoute une colonne
 * (cinq au plus) ; une rangée réduite à une colonne se dissout ; la largeur se règle par paire, aimantée.
 */

export const COLONNES_MAX = 5

export type Flanc = 'gauche' | 'droite'

/** Les blocs posés dans une colonne neuve : un élément de liste retrouve sa liste. */
function dansColonne(state: EditorState, r: ReturnType<typeof racines>): NoeudPM[] {
  const listes = new Map<NoeudPM, NodeType>()
  for (const { pos, noeud } of r) {
    const parent = state.doc.resolve(pos).parent
    if (['bulletList', 'orderedList', 'taskList'].includes(parent.type.name)) listes.set(noeud, parent.type)
  }
  return r.map(({ noeud }) => {
    const liste = listes.get(noeud)
    return liste ? liste.create(null, noeud) : noeud
  })
}

/**
 * Pose les blocs sur le flanc du bloc `cible` : à côté d'un bloc du flux, une rangée de deux colonnes les réunit ; à
 * côté d'un bloc déjà dans une colonne, une colonne s'ajoute à sa rangée. `null` si la rangée est pleine ou si la cible
 * est parmi les blocs tirés.
 */
export function enColonnes(state: EditorState, ids: readonly string[], cible: string, flanc: Flanc, copier = false): Transaction | null {
  const r = racines(state.doc, ids)
  const c = blocsDe(state.doc).find((b) => b.id === cible)
  if (r.length === 0 || !c) return null
  for (const { pos, noeud } of r) if (c.pos >= pos && c.pos < pos + noeud.nodeSize) return null
  const { colonnes, colonne } = state.schema.nodes
  const $c = state.doc.resolve(c.pos)
  const dansUneColonne = $c.parent.type === colonne
  const nouvelle = colonne!.create(null, dansColonne(state, r.map((x) => (copier ? { ...x, noeud: x.noeud.copy(x.noeud.content) } : x))))

  const tr = state.tr
  if (dansUneColonne) {
    const rangee = $c.node($c.depth - 1)
    if (rangee.childCount >= COLONNES_MAX) return null
    const posColonne = $c.before()
    const fin = posColonne + $c.parent.nodeSize
    if (!copier) retirer(tr, state.doc, r)
    // Une colonne de plus : les largeurs repartent à parts égales.
    const ou = flanc === 'gauche' ? tr.mapping.map(posColonne, 1) : tr.mapping.map(fin, -1)
    tr.insert(ou, nouvelle)
    const $rangee = tr.doc.resolve(ou)
    const debutRangee = $rangee.before()
    tr.doc.nodeAt(debutRangee)?.forEach((_, decalage) => tr.setNodeAttribute(debutRangee + 1 + decalage, 'ratio', null))
    return tr.setSelection(TextSelection.near(tr.doc.resolve(ou + 1))).scrollIntoView()
  }

  // La cible doit pouvoir être remplacée par une rangée dans son parent.
  if (!$c.parent.canReplaceWith($c.index(), $c.index() + 1, colonnes!)) return null
  if (!copier) retirer(tr, state.doc, r)
  const debut = tr.mapping.map(c.pos, 1)
  const cibleNoeud = tr.doc.nodeAt(debut)
  if (!cibleNoeud) return null
  const ancienne = colonne!.create(null, cibleNoeud)
  const rangee = colonnes!.create(null, flanc === 'gauche' ? [nouvelle, ancienne] : [ancienne, nouvelle])
  tr.replaceWith(debut, debut + cibleNoeud.nodeSize, rangee)
  const curseur = debut + 1 + (flanc === 'gauche' ? 1 : rangee.firstChild!.nodeSize + 1)
  return tr.setSelection(TextSelection.near(tr.doc.resolve(curseur))).scrollIntoView()
}

/** Les rangées à défaire : celles qui n'ont plus qu'une colonne. Rend la transaction, ou `null`. */
export function dissoudre(state: EditorState): Transaction | null {
  const seules: [number, NoeudPM][] = []
  state.doc.descendants((n, pos) => {
    if (n.type.name === 'colonnes' && n.childCount === 1) seules.push([pos, n])
    return n.type.name !== 'colonnes' || n.childCount === 1
  })
  if (seules.length === 0) return null
  const tr = state.tr
  for (const [pos, n] of seules.reverse()) tr.replaceWith(pos, pos + n.nodeSize, n.firstChild!.content)
  return tr.setMeta('addToHistory', false)
}

export const DissolutionColonnes = Extension.create({
  name: 'dissolutionColonnes',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dissolutionColonnes'),
        appendTransaction: (trs, _, state) => (trs.some((tr) => tr.docChanged) ? dissoudre(state) : null),
      }),
    ]
  },
})

/** Les parts de largeur d'une rangée, qui font 1 au total ; une part absente vaut une part égale. */
export function parts(ratios: readonly (number | null)[]): number[] {
  const brutes = ratios.map((r) => (r && r > 0 ? r : 1))
  const total = brutes.reduce((a, b) => a + b, 0)
  return brutes.map((r) => r / total)
}

/**
 * Déplace la frontière entre les colonnes `i` et `i + 1` de `delta` (une fraction de la rangée). Seules ces deux-là
 * changent ; la frontière s'aimante par pas de 1/(8·n), et chacune garde au moins un pas (NOTION.md § 8).
 */
export function partager(fractions: readonly number[], i: number, delta: number): number[] {
  const n = fractions.length
  const pas = 1 / (8 * n)
  const avant = fractions.slice(0, i).reduce((a, b) => a + b, 0)
  const paire = fractions[i]! + fractions[i + 1]!
  const frontiere = avant + fractions[i]! + delta
  const aimantee = Math.round(frontiere / pas) * pas
  const gauche = Math.min(Math.max(aimantee - avant, pas), paire - pas)
  const sortie = [...fractions]
  sortie[i] = gauche
  sortie[i + 1] = paire - gauche
  return sortie
}

/** Les attributs `ratio` qui donnent ces parts : une part égale s'écrit `null`. */
export const ratiosDe = (fractions: readonly number[]): (number | null)[] =>
  fractions.map((f) => {
    const r = Math.round(f * fractions.length * 1000) / 1000
    return Math.abs(r - 1) < 0.001 ? null : r
  })

/** Pose les largeurs d'une rangée (la position de son nœud `colonnes`). */
export function regler(state: EditorState, posRangee: number, ratios: readonly (number | null)[]): Transaction | null {
  const rangee = state.doc.nodeAt(posRangee)
  if (rangee?.type.name !== 'colonnes') return null
  const tr = state.tr
  rangee.forEach((_, decalage, i) => tr.setNodeAttribute(posRangee + 1 + decalage, 'ratio', ratios[i] ?? null))
  return tr
}
