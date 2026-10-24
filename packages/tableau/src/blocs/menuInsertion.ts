import type { Node as NoeudPM } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import type { Entree } from './catalogue'
import { blocA } from './gestes'
import { CONTENEURS } from './ids'
import { blocsDe } from './modele'
import { inserer, transformer } from './transformer'

/**
 * Ce que fait le choix d'une entrée du menu « / » (docs/NOTION.md § 2.5) : le `/` et ce qu'on a tapé derrière s'en
 * vont, le reste du bloc est gardé ; une entrée d'insertion pose le bloc **sous** le bloc courant, et ne remplace
 * celui-ci que si c'est un paragraphe sans texte et sans enfant ; une entrée « Transformer en » ou une couleur agit
 * sur le bloc courant sans rien insérer. Le tout se défait d'un seul ⌘Z.
 */

export type Decision = 'remplacer' | 'dessous'

/**
 * Le bloc courant est remplacé quand c'est un paragraphe de la page ou d'une colonne (pas une puce, un titre, une
 * tâche, une citation, un encadré, un dépliant), vide, sans enfant ; sinon le bloc neuf vient dessous.
 */
export function decisionInsertion(bloc: { type: string; vide: boolean; enfants: number; dansConteneur: boolean }): Decision {
  return bloc.type === 'paragraph' && bloc.vide && bloc.enfants === 0 && bloc.dansConteneur ? 'remplacer' : 'dessous'
}

export interface Zone {
  de: number
  a: number
}

/** Le bloc qui contient `pos`, tel que `decisionInsertion` le lit. */
function lireBloc(doc: NoeudPM, pos: number) {
  const $pos = doc.resolve(pos)
  const debut = blocA($pos)
  const bloc = debut === null ? undefined : blocsDe(doc).find((b) => b.pos === debut)
  return {
    fin: bloc?.fin ?? null,
    retrait: Number($pos.parent.attrs.retrait) || 0,
    decision: decisionInsertion({
      type: $pos.parent.type.name,
      vide: $pos.parent.content.size === 0,
      enfants: bloc?.enfants.length ?? 0,
      dansConteneur: $pos.depth >= 1 && CONTENEURS.has($pos.node($pos.depth - 1).type.name),
    }),
  }
}

/**
 * Choisit une entrée du menu « / » : `zone` est le `/` et son filtre. Rend vrai quand il y a eu un geste. `image` : le
 * sélecteur de fichier, qui pose lui-même l'image (à la place d'un paragraphe vide, sinon dessous).
 *
 * Le `/` s'en va et, quand le bloc neuf vient dessous, son paragraphe d'accueil se pose dans la même transaction :
 * le type se règle juste après, sur ce paragraphe, et l'historique réunit le tout.
 */
export function choisirDansSlash(editor: Editor, entree: Pick<Entree, 'effet' | 'section'>, zone: Zone, image?: () => void): boolean {
  if (!editor.isEditable) return false
  const { effet } = entree
  // Le texte d'avant le `/` reste, le `/` et le filtre partent.
  const tr = editor.state.tr.deleteRange(zone.de, zone.a)
  if (effet.genre === 'action' || effet.genre === 'couleur' || (effet.genre === 'vers' && entree.section === 'transformer') || (effet.genre === 'inserer' && effet.quoi === 'image')) {
    editor.view.dispatch(tr)
    // « Transformer en » : le bloc courant change de type. L'image se pose quand le fichier est choisi.
    if (effet.genre === 'vers') return transformer(editor, effet.vers)
    if (effet.genre === 'inserer') image?.()
    return true
  }
  const { fin, retrait, decision } = lireBloc(tr.doc, tr.mapping.map(editor.state.selection.from))
  if (decision === 'dessous' && fin !== null) {
    tr.insert(fin, editor.state.schema.nodes.paragraph!.create({ retrait }))
    tr.setSelection(TextSelection.create(tr.doc, fin + 1)).scrollIntoView()
  }
  editor.view.dispatch(tr)
  if (effet.genre === 'vers') return effet.vers === 'texte' ? editor.commands.focus() : transformer(editor, effet.vers)
  if (effet.genre === 'inserer') return inserer(editor, effet.quoi)
  return false
}
