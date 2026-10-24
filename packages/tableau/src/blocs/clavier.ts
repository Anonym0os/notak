import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type EditorState, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { CONTENEURS, RETRAIT_MAX } from './ids'
import { indenter } from './gestes'
import { type Bloc, blocsDe } from './modele'

/**
 * Le clavier du texte (docs/NOTION.md § 5) : Entrée, Retour arrière, Suppr, Tab, à la façon de Notion. Chaque geste
 * est une seule transaction, donc un seul pas d'annulation. Les règles par type sont celles du tableau du § 5.
 */

/** Les types qu'Entrée reproduit, et qui remontent d'un cran quand on les laisse vides en dernier enfant. */
const CONTINUABLES = new Set(['paragraph', 'puce', 'numero', 'tache', 'depliant'])

/** Les types qu'Entrée sur un bloc vide ou Retour arrière en tête ramènent à du texte. */
const CONVERTIBLES = new Set(['heading', 'puce', 'numero', 'tache', 'depliant', 'citation', 'encadreBloc'])

/** Le bloc de texte du curseur, s'il est un bloc de la page ou d'une colonne (pas une cellule de tableau). */
interface Ici {
  noeud: NoeudPM
  pos: number
  bloc: Bloc
  blocs: Bloc[]
  doc: NoeudPM
}

function ici(state: EditorState): Ici | null {
  const { $from } = state.selection
  const noeud = $from.parent
  if (!noeud.isTextblock || $from.depth < 1 || !CONTENEURS.has($from.node($from.depth - 1).type.name)) return null
  const pos = $from.before()
  const blocs = blocsDe(state.doc)
  const bloc = blocs.find((b) => b.pos === pos)
  return bloc ? { noeud, pos, bloc, blocs, doc: state.doc } : null
}

const parentDe = (c: Ici) => (c.bloc.parent ? c.blocs.find((b) => b.id === c.bloc.parent) : undefined)

/** Le bloc est-il le dernier enfant de son parent (un bloc, pas une colonne) ? */
function dernierEnfant(c: Ici): boolean {
  const p = parentDe(c)
  return !!p && p.type !== 'colonne' && p.type !== 'colonnes' && p.enfants[p.enfants.length - 1] === c.bloc.id
}

/** Un dépliant ou un titre dépliant fermé. */
const ferme = (n: NoeudPM) => (n.type.name === 'depliant' || (n.type.name === 'heading' && n.attrs.depliant)) && n.attrs.ouvert === false
const ouvertDepliant = (n: NoeudPM) => (n.type.name === 'depliant' || (n.type.name === 'heading' && n.attrs.depliant)) && n.attrs.ouvert !== false

/** Un bloc caché par un dépliant fermé au-dessus de lui. */
function cache(blocs: readonly Bloc[], b: Bloc): boolean {
  for (let p = b.parent ? blocs.find((x) => x.id === b.parent) : undefined; p; p = p.parent ? blocs.find((x) => x.id === p!.parent) : undefined) {
    if ((p.type === 'deroulant' || p.type.startsWith('titreDeroulant')) && p.format.ouvert === false) return true
  }
  return false
}

/** Le bloc ramené à du texte, à sa place, avec ses enfants (NOTION.md § 5, « convertir en texte »). */
function enTexte(tr: Transaction, pos: number, n: NoeudPM) {
  if (n.type.name === 'heading' && n.attrs.depliant) {
    tr.setNodeAttribute(pos, 'depliant', false)
    return
  }
  const attrs = { id: n.attrs.id, retrait: n.attrs.retrait, couleur: n.type.name === 'encadreBloc' ? null : n.attrs.couleur }
  tr.setNodeMarkup(pos, n.type.schema.nodes.paragraph!, attrs)
}

/** Décale les enfants d'un bloc d'un cran vers la gauche (ils prennent sa place quand il disparaît). */
function remonterEnfants(tr: Transaction, b: Bloc) {
  tr.doc.nodesBetween(b.pos + b.taille, b.fin, (n, pos) => {
    if (pos < b.pos + b.taille || !('retrait' in n.attrs)) return false
    tr.setNodeAttribute(pos, 'retrait', Math.max(0, (Number(n.attrs.retrait) || 0) - 1))
    return false
  })
}

/** Le bloc de texte précédent dans l'ordre d'affichage (les blocs sans texte et les blocs cachés sont sautés). */
function texteAvant(c: Ici): Bloc | null {
  const i = c.blocs.indexOf(c.bloc)
  for (let j = i - 1; j >= 0; j--) {
    const b = c.blocs[j]!
    const n = c.doc.nodeAt(b.pos)
    if (n?.isTextblock && n.type.name !== 'codeBlock' && !cache(c.blocs, b)) return b
  }
  return null
}

function texteApres(c: Ici): Bloc | null {
  const i = c.blocs.indexOf(c.bloc)
  for (let j = i + 1; j < c.blocs.length; j++) {
    const b = c.blocs[j]!
    const n = c.doc.nodeAt(b.pos)
    if (n?.isTextblock && n.type.name !== 'codeBlock' && !cache(c.blocs, b)) return b
  }
  return null
}

/** Entrée (NOTION.md § 5, Entrée). */
export function entree(state: EditorState): Transaction | null {
  const c = ici(state)
  if (!c || c.noeud.type.name === 'codeBlock') return null
  const { noeud, pos, bloc } = c
  const { $from, empty } = state.selection
  const vide = noeud.content.size === 0
  const tr = state.tr
  const retrait = Number(noeud.attrs.retrait) || 0
  const { paragraph } = state.schema.nodes

  // Un bloc vide qu'on quitte : il remonte d'un cran s'il est le dernier enfant de son parent, sinon il devient du texte.
  const dernierDansEncadre = noeud.type.name === 'paragraph' && parentDe(c)?.type === 'encadre' && dernierEnfant(c)
  if (empty && vide && (CONVERTIBLES.has(noeud.type.name) || dernierDansEncadre)) {
    if (CONTINUABLES.has(noeud.type.name) && dernierEnfant(c) && bloc.id) return indenter(state, [bloc.id], -1)
    enTexte(tr, pos, noeud)
    return tr
  }

  // En tête d'un bloc non vide : un bloc vide se glisse au-dessus, le curseur reste.
  if (empty && $from.parentOffset === 0 && !vide) {
    const type = CONTINUABLES.has(noeud.type.name) ? noeud.type : paragraph!
    const attrs = { retrait, ...(type.name === 'tache' ? { coche: noeud.attrs.coche } : {}), ...(type.name === 'depliant' ? { ouvert: noeud.attrs.ouvert } : {}) }
    tr.insert(pos, type.create(attrs))
    return tr.scrollIntoView()
  }

  // La coupure.
  if (!empty) tr.deleteSelection()
  const $ici = tr.selection.$from
  const reste = $ici.parent.content.cut($ici.parentOffset)
  // Un dépliant fermé : le bloc neuf se pose après ses enfants cachés.
  if (ferme(noeud)) {
    const neuf = noeud.type.name === 'depliant' ? noeud.type.create({ retrait, ouvert: false }, reste) : paragraph!.create({ retrait }, reste)
    const fin = tr.mapping.map(bloc.fin)
    tr.delete($ici.pos, $ici.end())
    const ou = tr.mapping.map(fin)
    tr.insert(ou, neuf)
    return tr.setSelection(TextSelection.create(tr.doc, ou + 1)).scrollIntoView()
  }
  let type = CONTINUABLES.has(noeud.type.name) ? noeud.type : paragraph!
  let cran = retrait
  // Un dépliant ouvert reçoit un premier enfant ; un encadré qui a des enfants aussi.
  if (ouvertDepliant(noeud)) {
    type = paragraph!
    cran = Math.min(RETRAIT_MAX, retrait + 1)
  } else if (noeud.type.name === 'encadreBloc' && bloc.enfants.length) {
    const premier = c.blocs.find((b) => b.id === bloc.enfants[0])
    const n = premier ? state.doc.nodeAt(premier.pos) : null
    type = n && CONTINUABLES.has(n.type.name) ? n.type : paragraph!
    cran = Math.min(RETRAIT_MAX, retrait + 1)
  }
  const attrs = { retrait: cran, ...(type.name === 'depliant' ? { ouvert: true } : {}) }
  tr.split($ici.pos, 1, [{ type, attrs }])
  return tr.scrollIntoView()
}

/** Retour arrière en tête d'un bloc (NOTION.md § 5) ; `direct` (⌘) saute la conversion en texte. */
export function retourArriere(state: EditorState, direct = false): Transaction | null {
  const { empty, $from } = state.selection
  if (!empty || $from.parentOffset !== 0) return null
  const c = ici(state)
  if (!c || c.noeud.type.name === 'codeBlock') return null
  const { noeud, pos, bloc } = c
  const tr = state.tr
  const titreSimple = noeud.type.name === 'heading' && !noeud.attrs.depliant
  if (!direct && CONVERTIBLES.has(noeud.type.name) && !titreSimple) {
    enTexte(tr, pos, noeud)
    return tr
  }
  // Le dernier enfant remonte d'un cran plutôt que de fusionner (sauf le premier enfant d'un dépliant).
  const p = parentDe(c)
  const premierDuDepliant = !!p && (p.type === 'deroulant' || p.type.startsWith('titreDeroulant')) && p.enfants[0] === bloc.id
  if (!direct && dernierEnfant(c) && p?.type !== 'encadre' && !premierDuDepliant && bloc.id) {
    const t = indenter(state, [bloc.id], -1)
    if (t) return t
  }
  const avant = texteAvant(c)
  if (!avant) return tr
  // La fusion : le texte rejoint la fin du bloc de texte d'avant, ses enfants prennent sa place.
  const fin = avant.pos + avant.taille - 1
  remonterEnfants(tr, bloc)
  tr.delete(pos, pos + noeud.nodeSize)
  tr.insert(tr.mapping.map(fin), noeud.content)
  return tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(fin, -1))).scrollIntoView()
}

/** Suppr en fin de bloc : un bloc vide part ; sinon le bloc de texte suivant le rejoint (NOTION.md § 5). */
export function suppr(state: EditorState): Transaction | null {
  const { empty, $from } = state.selection
  if (!empty || $from.parentOffset !== $from.parent.content.size) return null
  const c = ici(state)
  if (!c || c.noeud.type.name === 'codeBlock') return null
  const apres = texteApres(c)
  const tr = state.tr
  if (c.noeud.content.size === 0) {
    if (!apres) return tr
    remonterEnfants(tr, c.bloc)
    tr.delete(c.pos, c.pos + c.noeud.nodeSize)
    return tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(apres.pos) + 1))
  }
  if (!apres) return tr
  const n = state.doc.nodeAt(apres.pos)!
  const fin = c.pos + c.noeud.nodeSize - 1
  remonterEnfants(tr, apres)
  tr.delete(apres.pos, apres.pos + n.nodeSize)
  tr.insert(fin, n.content)
  return tr.setSelection(TextSelection.create(tr.doc, fin))
}

/** Les ids des blocs que la sélection de texte touche. */
function blocsTouches(state: EditorState): string[] {
  const { from, to } = state.selection
  return blocsDe(state.doc)
    .filter((b) => b.id && b.type !== 'colonne' && b.type !== 'colonnes' && b.pos + b.taille > from && b.pos <= to)
    .map((b) => b.id!)
}

/** Tab dans un bloc de code : une tabulation en tête de chaque ligne touchée ; Maj+Tab en retire une (ou deux espaces). */
function tabCode(state: EditorState, sens: 1 | -1): Transaction {
  const { $from, from, to } = state.selection
  const debut = $from.start()
  const texte = $from.parent.textContent
  const tr = state.tr
  const lignes: number[] = [0]
  for (let i = 0; i < texte.length; i++) if (texte[i] === '\n') lignes.push(i + 1)
  const touchees = lignes.filter((l, k) => {
    const finLigne = k + 1 < lignes.length ? lignes[k + 1]! - 1 : texte.length
    return debut + finLigne >= from && debut + l <= to
  })
  for (const l of [...touchees].reverse()) {
    if (sens > 0) tr.insertText('\t', debut + l)
    else {
      const tete = texte.slice(l, l + 2)
      const n = tete.startsWith('\t') ? 1 : tete === '  ' ? 2 : tete.startsWith(' ') ? 1 : 0
      if (n) tr.delete(debut + l, debut + l + n)
    }
  }
  return tr
}

/** Tab et Maj+Tab dans le texte (NOTION.md § 3) : jamais de caractère, jamais hors de l'éditeur. */
export function tab(state: EditorState, sens: 1 | -1): Transaction | null {
  if (state.selection.$from.parent.type.name === 'codeBlock') return tabCode(state, sens)
  const ids = blocsTouches(state)
  if (ids.length === 0) return null
  return indenter(state, ids, sens, ids.length === 1)
}

/** Maj+Entrée dans un bloc de code : on en sort, un texte neuf dessous. */
function sortirDuCode(state: EditorState): Transaction | null {
  const { $from } = state.selection
  if ($from.parent.type.name !== 'codeBlock') return null
  const apres = $from.after()
  const tr = state.tr.insert(apres, state.schema.nodes.paragraph!.create({ retrait: $from.parent.attrs.retrait }))
  return tr.setSelection(Selection.near(tr.doc.resolve(apres + 1))).scrollIntoView()
}

const jouer = (view: EditorView, tr: Transaction | null) => {
  if (!tr) return false
  view.dispatch(tr)
  return true
}

export const ClavierBlocs = Extension.create({
  name: 'clavierBlocs',
  // Avant le kit (listes, titres), après les menus qui gardent leurs touches tant qu'ils sont ouverts.
  priority: 1050,
  addKeyboardShortcuts() {
    const v = () => this.editor.view
    const s = () => this.editor.state
    return {
      Enter: () => !v().composing && jouer(v(), entree(s())),
      Backspace: () => !v().composing && jouer(v(), retourArriere(s())),
      'Mod-Backspace': () => !v().composing && jouer(v(), retourArriere(s(), true)),
      Delete: () => !v().composing && jouer(v(), suppr(s())),
      Tab: () => {
        if (v().composing) return false
        jouer(v(), tab(s(), 1))
        return true
      },
      'Shift-Tab': () => {
        if (v().composing) return false
        jouer(v(), tab(s(), -1))
        return true
      },
      'Shift-Enter': () => jouer(v(), sortirDuCode(s())),
    }
  },
})
