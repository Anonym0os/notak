import type { Node as NoeudPM } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { type Couleur, type Insertion, type Vers, couleurDeAttribut, couleurEnAttribut } from './catalogue'
import { blocA, dupliquer, supprimer } from './gestes'
import { CONTENEURS, poserIds } from './ids'
import { blocsDe } from './modele'
import { CLE_CHOIX, choisir } from './selection'

/**
 * Les gestes de « Transformer en », du menu « / » et des couleurs (docs/NOTION.md § 3 et § 5), sur le bloc du
 * curseur ou sur les blocs que la sélection touche. Les blocs étant à plat, transformer ne change que le type d'un
 * nœud : son id, son retrait, sa couleur et ses enfants restent.
 */

/** Le nœud et les attributs propres à chaque type de « Transformer en ». */
const CIBLES: Record<Vers, [string, Record<string, unknown>]> = {
  texte: ['paragraph', {}],
  titre1: ['heading', { level: 1, depliant: false }],
  titre2: ['heading', { level: 2, depliant: false }],
  titre3: ['heading', { level: 3, depliant: false }],
  puce: ['puce', {}],
  numero: ['numero', {}],
  tache: ['tache', {}],
  deroulant: ['depliant', {}],
  titreDeroulant1: ['heading', { level: 1, depliant: true, ouvert: true }],
  titreDeroulant2: ['heading', { level: 2, depliant: true, ouvert: true }],
  titreDeroulant3: ['heading', { level: 3, depliant: true, ouvert: true }],
  citation: ['citation', {}],
  encadre: ['encadreBloc', {}],
  code: ['codeBlock', {}],
}

/** Les blocs de texte que la sélection touche (les blocs choisis, ou le bloc du curseur) : leurs positions. */
function blocsDeTexteTouches(editor: Editor): number[] {
  const { from, to } = editor.state.selection
  const sortie: number[] = []
  editor.state.doc.nodesBetween(from, to, (n, pos, parent) => {
    if (n.isTextblock && parent && CONTENEURS.has(parent.type.name)) sortie.push(pos)
    return !n.isTextblock
  })
  return sortie
}

/** Le même bloc, d'un autre type : le texte d'un code perd ses marques et ses sauts de ligne deviennent des `\n`. */
function enType(n: NoeudPM, nom: string, extra: Record<string, unknown>): NoeudPM {
  const schema = n.type.schema
  const type = schema.nodes[nom]!
  const { id, retrait, couleur } = n.attrs
  const attrs = { id, retrait, couleur, ...extra }
  if (nom === 'codeBlock') {
    let texte = ''
    n.forEach((x) => (texte += x.isText ? x.text : x.type.name === 'hardBreak' ? '\n' : ''))
    return type.create(attrs, texte ? schema.text(texte) : null)
  }
  if (n.type.name === 'codeBlock') {
    const lignes = n.textContent.split('\n')
    const contenu = lignes.flatMap((l, i) => [...(i ? [schema.nodes.hardBreak!.create()] : []), ...(l ? [schema.text(l)] : [])])
    return type.create(attrs, contenu)
  }
  return type.create(attrs, n.content, n.marks)
}

/**
 * Un titre qu'on rend dépliant range dessous les blocs qui le suivent à son rang, jusqu'au prochain titre de son rang
 * ou d'un rang plus haut, ou jusqu'à un séparateur (NOTION.md § 2).
 */
function rangerSousLeTitre(editor: Editor, pos: number) {
  const { state } = editor
  const titre = state.doc.nodeAt(pos)!
  const niveau = Number(titre.attrs.level) || 1
  const retrait = Number(titre.attrs.retrait) || 0
  const $pos = state.doc.resolve(pos)
  const conteneur = $pos.parent
  const tr = state.tr
  let p = pos + titre.nodeSize
  for (let i = $pos.index() + 1; i < conteneur.childCount; i++) {
    const n = conteneur.child(i)
    const r = Number(n.attrs.retrait) || 0
    if (r < retrait) break
    if (r === retrait && ((n.type.name === 'heading' && Number(n.attrs.level) <= niveau) || n.type.name === 'horizontalRule' || n.type.name === 'colonnes')) break
    if ('retrait' in n.attrs) tr.setNodeAttribute(p, 'retrait', r + 1)
    p += n.nodeSize
  }
  if (tr.docChanged) editor.view.dispatch(tr)
}

/** Transforme le bloc du curseur (ou les blocs choisis). Rend vrai si le geste a eu lieu. */
export function transformer(editor: Editor, vers: Vers): boolean {
  if (!editor.isEditable) return false
  const [nom, extra] = CIBLES[vers]
  const positions = blocsDeTexteTouches(editor)
  if (positions.length === 0) return false
  const choix = CLE_CHOIX.getState(editor.state)
  const { from, to } = editor.state.selection
  const devenaitTitreDepliant = vers.startsWith('titreDeroulant')
  const titresAvant = new Set(positions.filter((p) => editor.state.doc.nodeAt(p)?.type.name === 'heading' && !editor.state.doc.nodeAt(p)?.attrs.depliant))
  const tr = editor.state.tr
  for (const pos of [...positions].reverse()) {
    const n = tr.doc.nodeAt(pos)!
    const neuf = enType(n, nom, nom === 'tache' && n.type.name === 'tache' ? { ...extra, coche: n.attrs.coche } : extra)
    // Le texte ne change pas : le nœud change de type sur place, le curseur ne bouge pas. Le code, lui, se réécrit.
    if (nom === 'codeBlock' || n.type.name === 'codeBlock') tr.replaceWith(pos, pos + n.nodeSize, neuf)
    else tr.setNodeMarkup(pos, neuf.type, neuf.attrs, n.marks)
  }
  const ici = Math.min(tr.mapping.map(from, -1), tr.doc.content.size)
  const la = Math.min(tr.mapping.map(to, -1), tr.doc.content.size)
  tr.setSelection(TextSelection.between(tr.doc.resolve(ici), tr.doc.resolve(la)))
  editor.view.dispatch(choix ? choisir(editor.state, choix, tr) : tr)
  if (devenaitTitreDepliant && positions.length === 1 && titresAvant.has(positions[0]!)) rangerSousLeTitre(editor, positions[0]!)
  editor.commands.focus()
  return true
}

/** Le type du bloc du curseur, dans le vocabulaire de « Transformer en ». */
export function versActuel(editor: Editor): Vers {
  const bloc = editor.state.selection.$from.parent
  switch (bloc.type.name) {
    case 'heading': {
      const niveau = Math.min(3, Number(bloc.attrs.level) || 1)
      return (bloc.attrs.depliant ? `titreDeroulant${niveau}` : `titre${niveau}`) as Vers
    }
    case 'codeBlock':
      return 'code'
    case 'puce':
    case 'numero':
    case 'tache':
    case 'citation':
      return bloc.type.name
    case 'depliant':
      return 'deroulant'
    case 'encadreBloc':
      return 'encadre'
    default:
      return 'texte'
  }
}

/** La position du bloc du curseur (un bloc de la page ou d'une colonne). */
export function blocDuCurseur(editor: Editor): number {
  return blocA(editor.state.selection.$from) ?? 0
}

/** Là où un bloc neuf se pose sous le bloc du curseur : après lui et ses enfants, et son retrait. */
function apresLeBloc(editor: Editor): { ou: number; retrait: number } {
  const pos = blocDuCurseur(editor)
  const b = blocsDe(editor.state.doc).find((x) => x.pos === pos)
  const n = editor.state.doc.nodeAt(pos)
  return { ou: b ? b.fin : pos + (n?.nodeSize ?? 0), retrait: Number(n?.attrs.retrait) || 0 }
}

/** Le bloc du curseur est-il un texte vide (on le transforme plutôt que d'en insérer un sous lui) ? */
export const blocVide = (editor: Editor) => editor.state.selection.$from.parent.isTextblock && editor.state.selection.$from.parent.content.size === 0

/** Pose un bloc sans texte (séparateur, tableau, colonnes) à la place du bloc vide, ou sous le bloc du curseur. */
export function inserer(editor: Editor, quoi: Insertion): boolean {
  const { schema } = editor.state
  const { $from } = editor.state.selection
  const vide = blocVide(editor) && $from.depth >= 1 && CONTENEURS.has($from.node($from.depth - 1).type.name)
  const dansColonne = $from.depth >= 1 && $from.node($from.depth - 1).type.name === 'colonne'
  const retrait = vide ? Number($from.parent.attrs.retrait) || 0 : apresLeBloc(editor).retrait
  const p = () => schema.nodes.paragraph!.create({ retrait })
  let noeud: NoeudPM
  if (quoi === 'separateur') noeud = schema.nodes.horizontalRule!.create({ retrait })
  else if (quoi === 'tableau') {
    const cellule = (entete: boolean) => (entete ? schema.nodes.enteteTable! : schema.nodes.celluleTable!).create(null, schema.nodes.paragraph!.create())
    const ligne = (entete: boolean) => schema.nodes.ligneTable!.create(null, [cellule(entete), cellule(entete), cellule(entete)])
    noeud = schema.nodes.table!.create({ retrait }, [ligne(true), ligne(false), ligne(false)])
  } else if (quoi.startsWith('colonnes')) {
    // Pas de rangée dans une colonne.
    if (dansColonne) return false
    const n = Number(quoi.slice(-1))
    noeud = schema.nodes.colonnes!.create(null, Array.from({ length: n }, () => schema.nodes.colonne!.create(null, schema.nodes.paragraph!.create())))
  } else return false
  const debut = vide ? $from.before() : apresLeBloc(editor).ou
  const fin = vide ? $from.after() : debut
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
  const { ou, retrait } = apresLeBloc(editor)
  const tr = editor.state.tr.insert(ou, editor.state.schema.nodes.paragraph!.create({ retrait }))
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, ou + 1)).scrollIntoView())
  return vers ? transformer(editor, vers) : true
}

/** Colore le passage choisi ; sans passage, le bloc du curseur (NOTION.md § 1). */
export function colorer(editor: Editor, couleur: Couleur): boolean {
  const { empty } = editor.state.selection
  if (!empty && !CLE_CHOIX.getState(editor.state)) {
    const c = editor.chain().focus()
    if (couleur.nom === 'defaut') return (couleur.fond ? c.unsetHighlight() : c.unsetColor()).run()
    return couleur.fond ? c.setHighlight({ color: `fond-${couleur.nom}` }).run() : c.setColor(`var(--notak-bloc-${couleur.nom})`).run()
  }
  const positions = CLE_CHOIX.getState(editor.state) ? blocsDeTexteTouches(editor) : [blocDuCurseur(editor)]
  const tr = editor.state.tr
  for (const pos of positions) if (tr.doc.nodeAt(pos)) tr.setNodeAttribute(pos, 'couleur', couleurEnAttribut(couleur))
  if (!tr.docChanged) return false
  editor.view.dispatch(tr)
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

/** Duplique le bloc du curseur (et ses enfants) juste après lui ; la copie est choisie (NOTION.md § 6). */
export function dupliquerBloc(editor: Editor): boolean {
  const id = idDuCurseur(editor)
  const d = id ? dupliquer(editor.state, [id]) : null
  if (d) editor.view.dispatch(choisir(editor.state, { ancre: d.copies[0]!, tete: d.copies[0]! }, d.tr))
  return !!d
}

/** Supprime le bloc du curseur et ses enfants, avec la colonne qu'il laisserait vide (voir `gestes.ts`). */
export function supprimerBloc(editor: Editor): boolean {
  const id = idDuCurseur(editor)
  const tr = id ? supprimer(editor.state, [id]) : null
  if (tr) editor.view.dispatch(tr)
  return !!tr
}

/** Pose une image du tableau sous le bloc du curseur (ou à la place du bloc vide). */
export function insererImage(editor: Editor, fichier: string): boolean {
  const { $from } = editor.state.selection
  const vide = blocVide(editor) && $from.depth >= 1 && CONTENEURS.has($from.node($from.depth - 1).type.name)
  const { ou, retrait } = vide ? { ou: $from.before(), retrait: Number($from.parent.attrs.retrait) || 0 } : apresLeBloc(editor)
  const image = editor.state.schema.nodes.image!.create({ fichier, retrait })
  const tr = editor.state.tr.replaceWith(ou, vide ? $from.after() : ou, [image, editor.state.schema.nodes.paragraph!.create({ retrait })])
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, ou + image.nodeSize + 1)).scrollIntoView())
  return true
}

/**
 * Un appui sous le dernier bloc (NOTION.md § 9) : le curseur va à la fin de la page, dans un paragraphe vide de premier
 * rang, ajouté s'il le faut (après un code, un encadré, une puce…).
 */
export function ecrireALaFin(editor: Editor): boolean {
  const { doc, schema } = editor.state
  const dernier = doc.lastChild
  if (!(dernier?.type.name === 'paragraph' && dernier.content.size === 0 && !dernier.attrs.retrait)) {
    editor.view.dispatch(editor.state.tr.insert(doc.content.size, schema.nodes.paragraph!.create()))
  }
  editor.commands.focus('end')
  return true
}

