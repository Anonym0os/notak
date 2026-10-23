import type { Mark } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'

/** Un retrait : quatre espaces, comme une tabulation d'éditeur de texte. */
export const RETRAIT = 4

/** Combien d'espaces ajouter pour atteindre le retrait suivant, depuis `n` espaces. */
export const espacesAAjouter = (n: number) => RETRAIT - (n % RETRAIT)

/** Combien d'espaces retirer pour revenir au retrait précédent, depuis `n` espaces (rien s'il n'y en a pas). */
export const espacesARetirer = (n: number) => (n === 0 ? 0 : n % RETRAIT || RETRAIT)

const espacesEnTete = (t: string) => t.length - t.replace(/^[  ]+/, '').length

/** Les débuts des blocs de texte que touche la sélection (paragraphes, titres, lignes de code), du dernier au premier. */
function debutsDeBlocs(editor: Editor): { pos: number; texte: string }[] {
  const { from, to } = editor.state.selection
  const blocs: { pos: number; texte: string }[] = []
  editor.state.doc.nodesBetween(from, to, (n, pos) => {
    if (!n.isTextblock) return true
    blocs.push({ pos: pos + 1, texte: n.textContent })
    return false
  })
  return blocs.reverse()
}

const dansUneListe = (editor: Editor) => editor.isActive('listItem') || editor.isActive('taskItem')

/**
 * Tab : le curseur seul reçoit quatre espaces ; une sélection sur plusieurs lignes décale chacune.
 * Dans une liste, l'élément descend (Tiptap s'en charge avant nous) ; s'il ne peut pas, rien ne bouge,
 * mais Tab ne quitte jamais la note.
 */
export function augmenterRetrait(editor: Editor): boolean {
  const { state } = editor
  const { selection } = state
  if (dansUneListe(editor)) return editor.commands.sinkListItem('listItem') || true
  if (selection.empty || selection.$from.sameParent(selection.$to)) {
    if (!selection.empty && selection.$from.parentOffset === 0 && selection.$to.parentOffset === selection.$to.parent.content.size) {
      // Toute la ligne choisie : on la décale, comme plusieurs lignes.
    } else {
      // Curseur seul : toujours quatre espaces, là où il est.
      return editor.chain().insertContent(' '.repeat(RETRAIT)).run()
    }
  }
  const tr = state.tr
  for (const { pos, texte } of debutsDeBlocs(editor)) tr.insertText(' '.repeat(espacesAAjouter(espacesEnTete(texte))), pos)
  editor.view.dispatch(tr)
  return true
}

/** Maj+Tab : chaque ligne touchée revient d'un retrait ; dans une liste, l'élément remonte. */
export function diminuerRetrait(editor: Editor): boolean {
  if (dansUneListe(editor)) return editor.commands.liftListItem('listItem') || true
  const tr = editor.state.tr
  for (const { pos, texte } of debutsDeBlocs(editor)) {
    const n = espacesARetirer(espacesEnTete(texte))
    if (n > 0) tr.delete(pos, pos + n)
  }
  if (tr.docChanged) editor.view.dispatch(tr)
  return true
}

export type Casse = 'haut' | 'bas' | 'mots'

/**
 * La casse suivante, comme Maj+F3 d'un traitement de texte : MAJUSCULES, puis minuscules,
 * puis Une Capitale Par Mot, puis de nouveau MAJUSCULES.
 */
export function casseSuivante(texte: string): Casse {
  const haut = texte.toLocaleUpperCase('fr')
  const bas = texte.toLocaleLowerCase('fr')
  if (texte === haut && texte !== bas) return 'bas'
  if (texte === bas && texte !== haut) return 'mots'
  return 'haut'
}

const debutDeMot = /[\s\-'’(«"]/

/** Le texte dans cette casse. `avant` : le caractère qui le précède, pour savoir si un mot commence. */
export function enCasse(casse: Casse, texte: string, avant = ' '): string {
  if (casse === 'haut') return texte.toLocaleUpperCase('fr')
  const bas = texte.toLocaleLowerCase('fr')
  if (casse === 'bas') return bas
  let precedent = avant
  let rendu = ''
  for (const c of bas) {
    rendu += debutDeMot.test(precedent) || precedent === '' ? c.toLocaleUpperCase('fr') : c
    precedent = c
  }
  return rendu
}

/** Maj+F3 : change la casse du texte choisi, sans toucher à sa mise en forme. */
export function changerCasse(editor: Editor): boolean {
  const { state } = editor
  const { from, to, empty } = state.selection
  if (empty) return false
  // La casse se décide sur tout le texte choisi, puis s'applique morceau par morceau (chacun garde ses marques).
  const casse = casseSuivante(state.doc.textBetween(from, to, ' ', ' '))
  const morceaux: { de: number; a: number; texte: string; marques: readonly Mark[] }[] = []
  state.doc.nodesBetween(from, to, (n, pos) => {
    if (!n.isText) return true
    const de = Math.max(from, pos)
    const a = Math.min(to, pos + n.nodeSize)
    // Le caractère d'avant, même dans le morceau précédent : un mot peut couvrir deux mises en forme.
    const debut = state.doc.resolve(de).start()
    const avant = de > debut ? state.doc.textBetween(de - 1, de, ' ', ' ') : ' '
    morceaux.push({ de, a, texte: enCasse(casse, n.text!.slice(de - pos, a - pos), avant), marques: n.marks })
    return false
  })
  const tr = state.tr
  for (const m of morceaux.reverse()) {
    tr.replaceWith(m.de, m.a, state.schema.text(m.texte, m.marques))
  }
  tr.setSelection(TextSelection.create(tr.doc, from, tr.mapping.map(to)))
  editor.view.dispatch(tr)
  return true
}
