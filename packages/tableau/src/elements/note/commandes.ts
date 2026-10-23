import type { Editor } from '@tiptap/react'
import { valeurCouleurTexte } from './couleurs'

/** Centré ↔ à gauche. */
export function basculerCentre(editor: Editor): boolean {
  return editor.chain().focus().setTextAlign(editor.isActive({ textAlign: 'center' }) ? 'left' : 'center').run()
}

/** Poser un surlignage retire la couleur du texte ; le reposer le retire. `null` : sans surlignage. */
export function basculerSurlignage(editor: Editor, nom: string | null): boolean {
  if (nom === null || editor.isActive('highlight', { color: nom })) return editor.chain().focus().unsetHighlight().run()
  return editor.chain().focus().unsetColor().setHighlight({ color: nom }).run()
}

/** Poser une couleur de texte retire le surlignage. `null` : couleur par défaut. */
export function poserCouleurTexte(editor: Editor, nom: string | null): boolean {
  if (nom === null) return editor.chain().focus().unsetColor().run()
  return editor.chain().focus().unsetHighlight().setColor(valeurCouleurTexte(nom)).run()
}

/** ⌘. : un passage à l'intérieur d'une ligne passe en code en ligne ; une ligne entière, en bloc de code. */
export function basculerCode(editor: Editor): boolean {
  const { selection } = editor.state
  const dansUneLigne =
    !selection.empty &&
    selection.$from.sameParent(selection.$to) &&
    !(selection.$from.parentOffset === 0 && selection.$to.parentOffset === selection.$from.parent.content.size)
  return dansUneLigne ? editor.chain().focus().toggleCode().run() : poserStyle(editor, 'code')
}

/** Un bloc d'une autre sorte (code, citation, encadré) se retire avant d'en poser un nouveau. */
const enveloppe = (ed: Editor) => ed.isActive('blockquote') || ed.isActive('codeBlock') || ed.isActive('encadre')

export type StyleBloc = 'titre1' | 'titre2' | 'texte' | 'petit' | 'citation' | 'code'

export function poserStyle(editor: Editor, style: StyleBloc): boolean {
  const c = editor.chain().focus()
  switch (style) {
    case 'titre1':
      return (enveloppe(editor) ? c.clearNodes() : c).setHeading({ level: 1 }).run()
    case 'titre2':
      return (enveloppe(editor) ? c.clearNodes() : c).setHeading({ level: 2 }).run()
    case 'texte':
      return c.clearNodes().updateAttributes('paragraph', { petit: null }).run()
    case 'petit':
      return c.clearNodes().updateAttributes('paragraph', { petit: true }).run()
    case 'citation':
      if (editor.isActive('blockquote')) return c.lift('blockquote').run()
      return (editor.isActive('codeBlock') || editor.isActive('encadre') ? c.clearNodes() : c).setBlockquote().run()
    case 'code':
      if (editor.isActive('codeBlock')) return c.clearNodes().run()
      return (editor.isActive('blockquote') || editor.isActive('encadre') ? c.clearNodes() : c).setCodeBlock().run()
  }
}

export function styleActif(editor: Editor): StyleBloc {
  if (editor.isActive('heading', { level: 1 })) return 'titre1'
  if (editor.isActive('heading', { level: 2 })) return 'titre2'
  if (editor.isActive('blockquote')) return 'citation'
  if (editor.isActive('codeBlock')) return 'code'
  if (editor.isActive('paragraph', { petit: true })) return 'petit'
  return 'texte'
}
