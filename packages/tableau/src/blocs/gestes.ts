import { Fragment, type Node as NoeudPM, type NodeType, type ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { blocsDe } from './modele'

/**
 * Les gestes sur des blocs entiers (docs/NOTION.md § 6 à § 8), désignés par leurs ids : supprimer, dupliquer, déplacer.
 * Chacun prend l'état de l'éditeur et rend une transaction (ou `null` s'il n'y a rien à faire).
 */

/** Les blocs de premier rang parmi ceux choisis : un bloc dont un ancêtre est aussi choisi le suit déjà. */
export function racines(doc: NoeudPM, ids: readonly string[]): { id: string; pos: number; noeud: NoeudPM }[] {
  const voulus = new Set(ids)
  const blocs = blocsDe(doc)
  const parId = new Map(blocs.map((b) => [b.id, b]))
  return blocs.flatMap((b) => {
    if (!b.id || !voulus.has(b.id)) return []
    for (let p = b.parent; p; p = parId.get(p)?.parent ?? null) if (voulus.has(p)) return []
    return [{ id: b.id, pos: b.pos, noeud: doc.nodeAt(b.pos)! }]
  })
}

/** La position d'un bloc à partir d'une position dedans : l'élément de liste, le dépliant… plutôt que leur premier texte. */
export function blocA($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d)
    const parent = $pos.node(d - 1)
    if (!('id' in n.attrs)) continue
    // Le premier texte d'un élément de liste, d'une citation, d'un encadré est ce bloc-là.
    if ($pos.index(d - 1) === 0 && (n.isTextblock || n.type.name === 'resumeDeroulant') && ['listItem', 'taskItem', 'blockquote', 'encadre', 'deroulant'].includes(parent.type.name)) continue
    if (n.type.name === 'resumeDeroulant') continue
    return $pos.before(d)
  }
  return null
}

/**
 * Ce qu'on retire pour ôter un bloc : lui, ou le conteneur qu'il laisserait vide (sa liste, sa colonne), de proche en
 * proche. Une colonne vidée disparaît ainsi (NOTION.md § 8), ce que ProseMirror ne fait pas seul.
 */
export function etendue(doc: NoeudPM, pos: number, taille: number): [number, number] {
  let de = pos
  let a = pos + taille
  for (;;) {
    const $de = doc.resolve(de)
    if ($de.depth === 0 || $de.parent.childCount !== 1) return [de, a]
    if (!['bulletList', 'orderedList', 'taskList', 'colonne'].includes($de.parent.type.name)) return [de, a]
    de = $de.before()
    a = de + $de.parent.nodeSize
  }
}

/** Retire les blocs de la transaction, du dernier au premier. */
export function retirer(tr: Transaction, doc: NoeudPM, r: readonly { pos: number; noeud: NoeudPM }[]) {
  for (const { pos, noeud } of [...r].reverse()) {
    const [de, a] = etendue(doc, pos, noeud.nodeSize)
    tr.deleteRange(tr.mapping.map(de), tr.mapping.map(a))
  }
}

/** Supprime les blocs ; un conteneur vidé (liste, colonne) part avec eux, un document vidé garde un paragraphe. */
export function supprimer(state: EditorState, ids: readonly string[]): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const tr = state.tr
  retirer(tr, state.doc, r)
  if (tr.doc.childCount === 0 || tr.doc.content.size === 0) tr.insert(0, state.schema.nodes.paragraph!.create())
  const ici = Math.min(tr.mapping.map(r[0]!.pos), tr.doc.content.size)
  return tr.setSelection(TextSelection.near(tr.doc.resolve(ici), -1)).scrollIntoView()
}

/** Duplique les blocs, chacun juste après lui ; les copies reçoivent leurs propres ids (voir `ids.ts`). */
export function dupliquer(state: EditorState, ids: readonly string[]): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const tr = state.tr
  for (const { pos, noeud } of [...r].reverse()) tr.insert(pos + noeud.nodeSize, noeud.copy(noeud.content))
  return tr.scrollIntoView()
}

export type Cote = 'dessus' | 'dessous'

/**
 * Enveloppe ce qu'on pose là où le parent ne l'accepte pas tel quel : un élément de liste hors d'une liste retrouve une
 * liste du même genre ; un bloc posé entre des éléments de liste devient un élément.
 */
export function adapter(noeuds: readonly NoeudPM[], parent: NoeudPM, index: number, listeDOrigine: Map<NoeudPM, NodeType>): NoeudPM[] | null {
  const schema = parent.type.schema
  const sortie = noeuds.map((n) => {
    if (parent.canReplaceWith(index, index, n.type)) return n
    const liste = listeDOrigine.get(n)
    if ((n.type.name === 'listItem' || n.type.name === 'taskItem') && liste && parent.canReplaceWith(index, index, liste)) return liste.create(null, n)
    if (['bulletList', 'orderedList'].includes(parent.type.name)) return schema.nodes.listItem!.create(null, n.isTextblock ? n : [schema.nodes.paragraph!.create(), n])
    if (parent.type.name === 'taskList') return schema.nodes.taskItem!.create(null, n.isTextblock ? n : [schema.nodes.paragraph!.create(), n])
    return null
  })
  if (sortie.some((n) => !n)) return null
  const fragment = Fragment.from(sortie as NoeudPM[])
  return parent.canReplace(index, index, fragment) ? (sortie as NoeudPM[]) : null
}

/**
 * Déplace les blocs au-dessus ou au-dessous du bloc `cible` (NOTION.md § 8) ; `copier` les y copie. Un bloc ne se pose
 * pas dans ses propres descendants.
 */
export function deplacer(state: EditorState, ids: readonly string[], cible: string, cote: Cote, copier = false): Transaction | null {
  const r = racines(state.doc, ids)
  const blocs = blocsDe(state.doc)
  const c = blocs.find((b) => b.id === cible)
  if (r.length === 0 || !c) return null
  // La cible dans un bloc déplacé : refusé.
  for (const { pos, noeud } of r) if (c.pos >= pos && c.pos < pos + noeud.nodeSize && !(copier && c.pos === pos)) return null
  const listes = new Map<NoeudPM, NodeType>()
  for (const { pos, noeud } of r) {
    const parent = state.doc.resolve(pos).parent
    if (['bulletList', 'orderedList', 'taskList'].includes(parent.type.name)) listes.set(noeud, parent.type)
  }
  const tr = state.tr
  const arrivee = c.pos + (cote === 'dessous' ? c.taille : 0)
  if (!copier) retirer(tr, state.doc, r)
  const ou = tr.mapping.map(arrivee, cote === 'dessous' ? -1 : 1)
  const $ou = tr.doc.resolve(ou)
  const noeuds = adapter(
    r.map(({ noeud }) => (copier ? noeud.copy(noeud.content) : noeud)),
    $ou.parent,
    $ou.index(),
    listes,
  )
  if (!noeuds) return null
  tr.insert(ou, noeuds)
  if (tr.doc.content.size === 0) tr.insert(0, state.schema.nodes.paragraph!.create())
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(ou + 1, tr.doc.content.size)))).scrollIntoView()
}

/** Les frères du bloc, dans son parent : celui d'avant et celui d'après. */
function voisins(state: EditorState, id: string): { avant: string | null; apres: string | null } {
  const b = blocsDe(state.doc).find((x) => x.id === id)
  if (!b) return { avant: null, apres: null }
  const $pos = state.doc.resolve(b.pos)
  const i = $pos.index()
  const parent = $pos.parent
  const idDe = (n: NoeudPM | null | undefined) => (n?.attrs.id as string | undefined) ?? null
  return { avant: i > 0 ? idDe(parent.child(i - 1)) : null, apres: i + 1 < parent.childCount ? idDe(parent.child(i + 1)) : null }
}

/** ⌘⇧↑ et ⌘⇧↓ : monte ou descend les blocs d'un rang parmi leurs frères (NOTION.md § 5). */
export function decaler(state: EditorState, ids: readonly string[], sens: -1 | 1): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const bord = sens < 0 ? r[0]! : r[r.length - 1]!
  const { avant, apres } = voisins(state, bord.id)
  const cible = sens < 0 ? avant : apres
  return cible ? deplacer(state, ids, cible, sens < 0 ? 'dessus' : 'dessous') : null
}

/** Colore des blocs entiers, texte ou fond (NOTION.md § 6) ; `null` leur rend la couleur par défaut. */
export function colorerBlocs(state: EditorState, ids: readonly string[], couleur: string | null): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const tr = state.tr
  for (const { pos } of r) tr.setNodeAttribute(pos, 'couleur', couleur)
  return tr
}
