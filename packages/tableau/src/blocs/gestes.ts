import type { Node as NoeudPM, ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { CONTENEURS, RETRAIT_MAX, nouvelIdBloc } from './ids'
import { type Bloc, type TypeBloc, blocsDe } from './modele'

/**
 * Les gestes sur des blocs entiers (docs/NOTION.md § 5 à § 8), désignés par leurs ids : supprimer, dupliquer, déplacer,
 * indenter. Un bloc emporte toujours ses enfants (les blocs plus en retrait qui le suivent). Chacun prend l'état de
 * l'éditeur et rend une transaction (ou `null` s'il n'y a rien à faire).
 */

/** Un bloc choisi, avec son sous-arbre `[pos, fin)` et son retrait dans son conteneur. */
export interface Racine {
  id: string
  pos: number
  fin: number
  noeud: NoeudPM
  bloc: Bloc
}

/** Le retrait d'un bloc dans son conteneur (la page ou sa colonne). */
const retraitDe = (blocs: readonly Bloc[], b: Bloc) => {
  let base = 0
  for (let p = b.parent ? blocs.find((x) => x.id === b.parent) : undefined; p; p = p.parent ? blocs.find((x) => x.id === p!.parent) : undefined) {
    if (p.type === 'colonne') {
      base = p.profondeur + 1
      break
    }
  }
  return b.profondeur - base
}

/** Les blocs de premier rang parmi ceux choisis : un bloc dont un ancêtre est aussi choisi le suit déjà. */
export function racines(doc: NoeudPM, ids: readonly string[]): Racine[] {
  const voulus = new Set(ids)
  const blocs = blocsDe(doc)
  const parId = new Map(blocs.map((b) => [b.id, b]))
  return blocs.flatMap((b) => {
    if (!b.id || !voulus.has(b.id)) return []
    for (let p = b.parent; p; p = parId.get(p)?.parent ?? null) if (voulus.has(p)) return []
    return [{ id: b.id, pos: b.pos, fin: b.fin, noeud: doc.nodeAt(b.pos)!, bloc: b }]
  })
}

/** La position du bloc qui contient `$pos` : le bloc de la page ou de la colonne, pas un paragraphe de cellule. */
export function blocA($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    if (CONTENEURS.has($pos.node(d - 1).type.name) && 'id' in $pos.node(d).attrs) return $pos.before(d)
  }
  return null
}

/**
 * Ce qu'on retire pour ôter `[de, a)` : la colonne qu'il laisserait vide, puis la rangée qui n'aurait plus de colonne.
 * Une colonne restée seule se dissout ensuite (`colonnes.ts`).
 */
export function etendue(doc: NoeudPM, de: number, a: number): [number, number] {
  for (;;) {
    const $de = doc.resolve(de)
    if ($de.depth === 0 || de !== $de.start() || a !== $de.end()) return [de, a]
    if ($de.parent.type.name !== 'colonne' && !($de.parent.type.name === 'colonnes' && $de.parent.childCount === 1)) return [de, a]
    de = $de.before()
    a = de + $de.parent.nodeSize
  }
}

/** Retire les sous-arbres de la transaction, du dernier au premier. */
export function retirer(tr: Transaction, doc: NoeudPM, r: readonly { pos: number; fin: number }[]) {
  for (const { pos, fin } of [...r].reverse()) {
    const [de, a] = etendue(doc, pos, fin)
    tr.deleteRange(tr.mapping.map(de), tr.mapping.map(a))
  }
}

/** Un document vidé garde un paragraphe. */
function jamaisVide(tr: Transaction) {
  if (tr.doc.childCount === 0 || tr.doc.content.size === 0) tr.insert(0, tr.doc.type.schema.nodes.paragraph!.create())
}

/** Supprime les blocs et leurs enfants ; une colonne vidée part avec eux. */
export function supprimer(state: EditorState, ids: readonly string[]): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const tr = state.tr
  retirer(tr, state.doc, r)
  jamaisVide(tr)
  const ici = Math.min(tr.mapping.map(r[0]!.pos), tr.doc.content.size)
  return tr.setSelection(TextSelection.near(tr.doc.resolve(ici), -1)).scrollIntoView()
}

/** Les nœuds d'un sous-arbre, chacun avec son retrait ramené à `profondeur` pour la racine ; `neufs` : de nouveaux ids. */
export function sousArbre(doc: NoeudPM, r: Racine, profondeur: number, neufs: boolean): NoeudPM[] {
  const noeuds: NoeudPM[] = []
  const base = Number(r.noeud.attrs.retrait) || 0
  doc.nodesBetween(r.pos, r.fin, (n, pos) => {
    if (pos < r.pos) return true
    const retrait = 'retrait' in n.attrs ? Math.max(0, Math.min(RETRAIT_MAX, (Number(n.attrs.retrait) || 0) - base + profondeur)) : undefined
    const attrs = { ...n.attrs, ...(retrait !== undefined ? { retrait } : {}), ...(neufs && 'id' in n.attrs ? { id: nouvelIdBloc() } : {}) }
    noeuds.push(n.type.name === 'colonnes' && neufs ? copieColonnes(n) : n.type.create(attrs, n.content, n.marks))
    return false
  })
  return noeuds
}

/** Une rangée copiée : chaque bloc de ses colonnes reçoit un id neuf. */
function copieColonnes(n: NoeudPM): NoeudPM {
  const neuf = (x: NoeudPM): NoeudPM =>
    x.type.create('id' in x.attrs ? { ...x.attrs, id: nouvelIdBloc() } : x.attrs, x.isTextblock || x.isAtom ? x.content : mapFragment(x), x.marks)
  const mapFragment = (x: NoeudPM) => {
    const enfants: NoeudPM[] = []
    x.forEach((c) => enfants.push(neuf(c)))
    return enfants
  }
  return neuf(n)
}

/** Le retrait de la racine dans son conteneur. */
const retraitRacine = (doc: NoeudPM, r: Racine) => retraitDe(blocsDe(doc), r.bloc)

/**
 * Duplique les blocs (et leurs enfants) : les copies se posent ensemble après le dernier bloc choisi, chacune avec ses
 * propres ids (NOTION.md § 6). Rend la transaction et les ids des copies (pour les choisir).
 */
export function dupliquer(state: EditorState, ids: readonly string[]): { tr: Transaction; copies: string[] } | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const dernier = r[r.length - 1]!
  const parts = r.map((x) => sousArbre(state.doc, x, retraitRacine(state.doc, x), true))
  const tr = state.tr.insert(dernier.fin, parts.flat())
  const copies = parts.map((p) => p[0]!.attrs.id as string)
  return { tr: tr.scrollIntoView(), copies }
}

export type Cote = 'dessus' | 'dessous'

/**
 * Pose les blocs choisis (et leurs enfants) à la position `ou`, une limite entre deux blocs d'un conteneur, chaque
 * racine au retrait `profondeur` ; `copier` les y copie. Un bloc ne se pose pas dans ses propres enfants.
 */
export function poser(state: EditorState, ids: readonly string[], ou: number, profondeur: number, copier = false): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  for (const { pos, fin } of r) if (ou > pos && ou < fin) return null
  const $ou = state.doc.resolve(ou)
  if (!CONTENEURS.has($ou.parent.type.name)) return null
  // Pas de rangée de colonnes dans une colonne.
  if ($ou.parent.type.name === 'colonne' && r.some((x) => x.noeud.type.name === 'colonnes')) return null
  const noeuds = r.flatMap((x) => sousArbre(state.doc, x, Math.max(0, profondeur), copier))
  const tr = state.tr
  if (!copier) retirer(tr, state.doc, r)
  const ici = tr.mapping.map(ou, -1)
  tr.insert(ici, noeuds)
  jamaisVide(tr)
  return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(ici + 1, tr.doc.content.size)))).scrollIntoView()
}

/**
 * Déplace les blocs au-dessus du bloc `cible`, ou au-dessous de lui et de ses enfants, à son rang (NOTION.md § 8) ;
 * `copier` les y copie.
 */
export function deplacer(state: EditorState, ids: readonly string[], cible: string, cote: Cote, copier = false): Transaction | null {
  const blocs = blocsDe(state.doc)
  const c = blocs.find((b) => b.id === cible)
  if (!c || c.type === 'colonne') return null
  if (ids.includes(cible) && !copier) return null
  // La cible dans un bloc tiré : refusé.
  if (!copier && racines(state.doc, ids).some((x) => c.pos >= x.pos && c.pos < x.fin)) return null
  return poser(state, ids, cote === 'dessus' ? c.pos : c.fin, retraitDe(blocs, c), copier)
}

/** Les frères d'un bloc (même parent, même conteneur), dans l'ordre. */
function freres(blocs: readonly Bloc[], b: Bloc): Bloc[] {
  return blocs.filter((x) => x.parent === b.parent && x.type !== 'colonne' && sameConteneur(blocs, x, b))
}

const conteneurDe = (blocs: readonly Bloc[], b: Bloc): string | null => {
  for (let p = b.parent ? blocs.find((x) => x.id === b.parent) : undefined; p; p = p.parent ? blocs.find((x) => x.id === p!.parent) : undefined) {
    if (p.type === 'colonne') return p.id
  }
  return null
}
const sameConteneur = (blocs: readonly Bloc[], a: Bloc, b: Bloc) => conteneurDe(blocs, a) === conteneurDe(blocs, b)

/** ⌘⇧↑ et ⌘⇧↓ : monte ou descend les blocs d'un rang parmi leurs frères, avec leurs enfants (NOTION.md § 5). */
export function decaler(state: EditorState, ids: readonly string[], sens: -1 | 1): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const blocs = blocsDe(state.doc)
  const bord = sens < 0 ? r[0]!.bloc : r[r.length - 1]!.bloc
  const f = freres(blocs, bord)
  const i = f.findIndex((x) => x.id === bord.id)
  const voisin = f[i + sens]
  if (!voisin?.id) return null
  return deplacer(state, ids, voisin.id, sens < 0 ? 'dessus' : 'dessous')
}

/** Colore des blocs entiers, texte ou fond (NOTION.md § 6) ; `null` leur rend la couleur par défaut. */
export function colorerBlocs(state: EditorState, ids: readonly string[], couleur: string | null): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const tr = state.tr
  for (const { pos } of r) tr.setNodeAttribute(pos, 'couleur', couleur)
  return tr
}

/** Les blocs qui peuvent recevoir des enfants par Tab (NOTION.md § 3) : ni un titre simple, ni un encadré, ni un code… */
export const PARENTS: ReadonlySet<TypeBloc> = new Set<TypeBloc>(['texte', 'puce', 'numero', 'tache', 'deroulant', 'titreDeroulant1', 'titreDeroulant2', 'titreDeroulant3', 'citation'])

/**
 * Tab (`sens` 1) et Maj+Tab (-1) sur des blocs (NOTION.md § 3).
 * - Tab range le bloc sous son frère d'avant, si celui-ci peut porter des enfants ; un bloc seul (le curseur) se
 *   décale sans ses enfants, qui restent où ils sont ; plusieurs blocs choisis se décalent avec leurs enfants. Un
 *   dépliant fermé qui reçoit un enfant s'ouvre.
 * - Maj+Tab sort le bloc de son parent avec ses enfants ; les frères qui le suivaient deviennent ses enfants. Refusé
 *   sous un encadré.
 */
export function indenter(state: EditorState, ids: readonly string[], sens: 1 | -1, seul = ids.length === 1): Transaction | null {
  const r = racines(state.doc, ids)
  if (r.length === 0) return null
  const blocs = blocsDe(state.doc)
  const parId = new Map(blocs.map((b) => [b.id, b]))
  const tr = state.tr
  const pousser = (de: number, a: number) =>
    state.doc.nodesBetween(de, a, (n, pos) => {
      if (pos < de || !('retrait' in n.attrs)) return false
      tr.setNodeAttribute(pos, 'retrait', Math.max(0, Math.min(RETRAIT_MAX, (Number(n.attrs.retrait) || 0) + sens)))
      return false
    })
  if (sens > 0) {
    const premier = r[0]!.bloc
    const f = freres(blocs, premier)
    const avant = f[f.findIndex((x) => x.id === premier.id) - 1]
    if (!avant || !PARENTS.has(avant.type)) return null
    if (avant.format.ouvert === false) tr.setNodeAttribute(avant.pos, 'ouvert', true)
    for (const x of r) {
      const ferme = x.bloc.type === 'deroulant' || x.bloc.type.startsWith('titreDeroulant') ? x.noeud.attrs.ouvert === false : false
      if (seul && !ferme) pousser(x.pos, x.pos + x.noeud.nodeSize)
      else pousser(x.pos, x.fin)
    }
  } else {
    for (const x of r) {
      const parent = x.bloc.parent ? parId.get(x.bloc.parent) : undefined
      if (!parent || parent.type === 'colonne' || parent.type === 'colonnes' || parent.type === 'encadre') continue
      pousser(x.pos, x.fin)
    }
  }
  return tr.docChanged ? tr : null
}
