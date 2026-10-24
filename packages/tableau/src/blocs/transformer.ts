import { Fragment, type Node as NoeudPM } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { type Couleur, type Insertion, type Vers, couleurDeAttribut, couleurEnAttribut } from './catalogue'
import { dupliquer, supprimer } from './gestes'
import { poserIds } from './ids'

/**
 * Les gestes de « Transformer en », du menu « / » et des couleurs (docs/NOTION.md § 3 et § 5), sur le bloc du
 * curseur ou sur les blocs que le passage choisi touche.
 */

const LISTES = new Set(['listItem', 'taskItem'])
const ENVELOPPES = new Set(['blockquote', 'encadre'])

/** Le dépliant dont le curseur est dans le résumé : sa position, ou `null`. */
function deroulantDuResume(editor: Editor): number | null {
  const { $from } = editor.state.selection
  return $from.parent.type.name === 'resumeDeroulant' ? $from.before($from.depth - 1) : null
}

/**
 * Défait le dépliant de `pos` : son résumé redevient un paragraphe (un titre, pour un titre dépliant), ses blocs le
 * suivent dans le flux. Le curseur reste au même endroit du texte.
 */
function defaireDeroulant(editor: Editor, pos: number) {
  const { state } = editor
  const noeud = state.doc.nodeAt(pos)
  if (!noeud) return
  const resume = noeud.firstChild!
  const niveau = Number(noeud.attrs.niveau) || 0
  const { heading, paragraph } = state.schema.nodes
  const tete = niveau ? heading!.create({ level: niveau }, resume.content) : paragraph!.create(null, resume.content)
  const dedans: NoeudPM[] = []
  noeud.forEach((n, _, i) => i > 0 && dedans.push(n))
  const decalage = state.selection.from - (pos + 2)
  const tr = state.tr.replaceWith(pos, pos + noeud.nodeSize, Fragment.from([tete, ...dedans]))
  tr.setSelection(TextSelection.create(tr.doc, pos + 1 + Math.max(0, Math.min(decalage, tete.content.size))))
  editor.view.dispatch(tr)
}

/** Ramène le bloc du curseur (ou les blocs choisis) à du texte : hors des listes, des citations et des encadrés. */
function versTexte(editor: Editor) {
  const ou = deroulantDuResume(editor)
  if (ou !== null) defaireDeroulant(editor, ou)
  for (let i = 0; i < 12; i++) {
    const { $from } = editor.state.selection
    const parent = $from.node($from.depth - 1)
    if (LISTES.has(parent.type.name)) {
      if (!editor.commands.liftListItem(parent.type.name)) break
    } else if (ENVELOPPES.has(parent.type.name) && $from.index($from.depth - 1) === 0) {
      if (!editor.commands.lift(parent.type.name)) break
    } else break
  }
  const bloc = editor.state.selection.$from.parent
  if (bloc.type.name !== 'paragraph') editor.commands.setParagraph()
}

/**
 * Le bloc du curseur devient un dépliant (`niveau` 0) ou un titre dépliant. Un titre qu'on rend dépliant range
 * dessous les blocs qui le suivent, jusqu'au prochain titre de son rang ou d'un rang plus haut (NOTION.md § 2).
 */
function enDeroulant(editor: Editor, niveau: number) {
  const ici = deroulantDuResume(editor)
  if (ici !== null) {
    editor.view.dispatch(editor.state.tr.setNodeAttribute(ici, 'niveau', niveau))
    return
  }
  const titreAvant = editor.state.selection.$from.parent.type.name === 'heading'
  versTexte(editor)
  const { state } = editor
  const { $from } = state.selection
  const bloc = $from.parent
  const debut = $from.before()
  const parent = $from.node($from.depth - 1)
  const index = $from.index($from.depth - 1)
  const dedans: NoeudPM[] = []
  if (titreAvant && niveau) {
    for (let i = index + 1; i < parent.childCount; i++) {
      const n = parent.child(i)
      const rang = n.type.name === 'heading' ? Number(n.attrs.level) : n.type.name === 'deroulant' ? Number(n.attrs.niveau) || 99 : 99
      if (rang <= niveau || n.type.name === 'horizontalRule') break
      dedans.push(n)
    }
  }
  const { deroulant, resumeDeroulant } = state.schema.nodes
  const fin = debut + bloc.nodeSize + dedans.reduce((s, n) => s + n.nodeSize, 0)
  const neuf = deroulant!.create({ niveau, id: bloc.attrs.id, couleur: bloc.attrs.couleur }, [resumeDeroulant!.create(null, bloc.content), ...dedans])
  const decalage = state.selection.from - (debut + 1)
  const tr = state.tr.replaceWith(debut, fin, neuf)
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, debut + 2 + decalage)))
}

/** Transforme le bloc du curseur (ou les blocs choisis). Rend vrai si le geste a eu lieu. */
export function transformer(editor: Editor, vers: Vers): boolean {
  if (!editor.isEditable) return false
  if (vers === 'deroulant' || vers.startsWith('titreDeroulant')) {
    enDeroulant(editor, vers === 'deroulant' ? 0 : Number(vers.slice(-1)))
    return true
  }
  versTexte(editor)
  const c = editor.chain().focus()
  switch (vers) {
    case 'texte':
      return c.run()
    case 'titre1':
    case 'titre2':
    case 'titre3':
      return c.setNode('heading', { level: Number(vers.slice(-1)) }).run()
    case 'puce':
      return c.toggleBulletList().run()
    case 'numero':
      return c.toggleOrderedList().run()
    case 'tache':
      return c.toggleTaskList().run()
    case 'citation':
      return c.wrapIn('blockquote').run()
    case 'encadre':
      return c.wrapIn('encadre').run()
    case 'code':
      return c.setCodeBlock().run()
    default:
      return false
  }
}

/** Le type du bloc du curseur, dans le vocabulaire de « Transformer en ». */
export function versActuel(editor: Editor): Vers {
  const { $from } = editor.state.selection
  const bloc = $from.parent
  if (bloc.type.name === 'resumeDeroulant') {
    const niveau = Number($from.node($from.depth - 1).attrs.niveau) || 0
    return niveau ? (`titreDeroulant${niveau}` as Vers) : 'deroulant'
  }
  if (bloc.type.name === 'heading') return `titre${Math.min(3, Number(bloc.attrs.level) || 1)}` as Vers
  if (bloc.type.name === 'codeBlock') return 'code'
  const parent = $from.node($from.depth - 1)
  if (parent.type.name === 'taskItem') return 'tache'
  if (parent.type.name === 'listItem') return $from.node($from.depth - 2).type.name === 'orderedList' ? 'numero' : 'puce'
  if (parent.type.name === 'blockquote') return 'citation'
  if (parent.type.name === 'encadre') return 'encadre'
  return 'texte'
}

/**
 * Le nœud de bloc qui contient le curseur : l'élément de liste, la citation, le dépliant… plutôt que leur premier
 * paragraphe. Rend sa position.
 */
export function blocDuCurseur(editor: Editor): number {
  const { $from } = editor.state.selection
  if ($from.depth < 1) return 0
  const parent = $from.depth > 1 ? $from.node($from.depth - 1) : null
  const premier = $from.index($from.depth - 1) === 0
  if (parent && premier && (LISTES.has(parent.type.name) || ENVELOPPES.has(parent.type.name) || parent.type.name === 'deroulant')) return $from.before($from.depth - 1)
  return $from.before()
}

/** Là où un bloc neuf se pose après le bloc du curseur : juste après lui, ou après sa liste. */
function apresLeBloc(editor: Editor): number {
  const { doc, schema } = editor.state
  let pos = blocDuCurseur(editor)
  for (;;) {
    const $pos = doc.resolve(pos)
    const fin = pos + doc.nodeAt(pos)!.nodeSize
    if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), schema.nodes.paragraph!)) return fin
    if ($pos.depth === 0) return fin
    pos = $pos.before()
  }
}

/** Le bloc du curseur est-il un texte vide (on le transforme plutôt que d'en insérer un sous lui) ? */
export const blocVide = (editor: Editor) => editor.state.selection.$from.parent.isTextblock && editor.state.selection.$from.parent.content.size === 0

/** Pose un bloc sans texte (séparateur, tableau, colonnes) à la place du bloc vide, ou sous le bloc du curseur. */
export function inserer(editor: Editor, quoi: Insertion): boolean {
  const { schema } = editor.state
  const p = () => schema.nodes.paragraph!.create()
  let noeud: NoeudPM
  if (quoi === 'separateur') noeud = schema.nodes.horizontalRule!.create()
  else if (quoi === 'tableau') {
    const cellule = (entete: boolean) => (entete ? schema.nodes.enteteTable! : schema.nodes.celluleTable!).create(null, p())
    const ligne = (entete: boolean) => schema.nodes.ligneTable!.create(null, [cellule(entete), cellule(entete), cellule(entete)])
    noeud = schema.nodes.table!.create(null, [ligne(true), ligne(false), ligne(false)])
  } else if (quoi.startsWith('colonnes')) {
    const n = Number(quoi.slice(-1))
    noeud = schema.nodes.colonnes!.create(null, Array.from({ length: n }, () => schema.nodes.colonne!.create(null, p())))
  } else return false
  const vide = blocVide(editor) && editor.state.selection.$from.depth === 1
  const debut = vide ? editor.state.selection.$from.before() : apresLeBloc(editor)
  const fin = vide ? editor.state.selection.$from.after() : debut
  // Après un séparateur, un paragraphe neuf reçoit le curseur ; dans un tableau ou des colonnes, la première case.
  const suite = quoi === 'separateur' ? [noeud, p()] : [noeud]
  const tr = editor.state.tr.replaceWith(debut, fin, suite)
  const curseur = quoi === 'separateur' ? debut + noeud.nodeSize + 1 : debut + 1
  tr.setSelection(TextSelection.near(tr.doc.resolve(curseur)))
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.focus()
  return true
}

/** Insère un bloc de texte vide sous le bloc du curseur et l'y place ; `vers` le transforme aussitôt. */
export function insererDessous(editor: Editor, vers?: Vers): boolean {
  const pos = apresLeBloc(editor)
  const tr = editor.state.tr.insert(pos, editor.state.schema.nodes.paragraph!.create())
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView())
  return vers ? transformer(editor, vers) : true
}

/** Colore le passage choisi ; sans passage, le bloc du curseur (NOTION.md § 1). */
export function colorer(editor: Editor, couleur: Couleur): boolean {
  const { empty } = editor.state.selection
  if (!empty) {
    const c = editor.chain().focus()
    if (couleur.nom === 'defaut') return (couleur.fond ? c.unsetHighlight() : c.unsetColor()).run()
    return couleur.fond ? c.setHighlight({ color: `fond-${couleur.nom}` }).run() : c.setColor(`var(--notak-bloc-${couleur.nom})`).run()
  }
  const pos = blocDuCurseur(editor)
  const noeud = editor.state.doc.nodeAt(pos)
  if (!noeud) return false
  editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'couleur', couleurEnAttribut(couleur)))
  return true
}

/** La couleur du bloc du curseur, s'il en porte une. */
export const couleurDuBloc = (editor: Editor): Couleur | null => couleurDeAttribut(editor.state.doc.nodeAt(blocDuCurseur(editor))?.attrs.couleur)

/** L'id du bloc du curseur ; les blocs qui n'en ont pas encore (juste à l'ouverture) le reçoivent d'abord. */
function idDuCurseur(editor: Editor): string | null {
  const tr = poserIds(editor.state)
  if (tr) editor.view.dispatch(tr)
  return (editor.state.doc.nodeAt(blocDuCurseur(editor))?.attrs.id as string | null) ?? null
}

/** Duplique le bloc du curseur juste après lui ; la copie reçoit ses propres ids (voir `ids.ts`). */
export function dupliquerBloc(editor: Editor): boolean {
  const id = idDuCurseur(editor)
  const tr = id ? dupliquer(editor.state, [id]) : null
  if (tr) editor.view.dispatch(tr)
  return !!tr
}

/** Supprime le bloc du curseur, avec la liste ou la colonne qu'il laisserait vide (voir `gestes.ts`). */
export function supprimerBloc(editor: Editor): boolean {
  const id = idDuCurseur(editor)
  const tr = id ? supprimer(editor.state, [id]) : null
  if (tr) editor.view.dispatch(tr)
  return !!tr
}

/** Pose une image du tableau sous le bloc du curseur (ou à la place du bloc vide). */
export function insererImage(editor: Editor, fichier: string): boolean {
  const image = editor.state.schema.nodes.image!.create({ fichier })
  const vide = blocVide(editor) && editor.state.selection.$from.depth === 1
  const debut = vide ? editor.state.selection.$from.before() : apresLeBloc(editor)
  const tr = editor.state.tr.replaceWith(debut, vide ? editor.state.selection.$from.after() : debut, [image, editor.state.schema.nodes.paragraph!.create()])
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, debut + image.nodeSize + 1)).scrollIntoView())
  return true
}
