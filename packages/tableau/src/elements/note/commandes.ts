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

export type StyleBloc = 'titre1' | 'titre2' | 'texte' | 'citation' | 'code'

export function poserStyle(editor: Editor, style: StyleBloc): boolean {
  const c = editor.chain().focus()
  switch (style) {
    case 'titre1':
      return c.setHeading({ level: 1 }).run()
    case 'titre2':
      return c.setHeading({ level: 2 }).run()
    case 'texte':
      return c.clearNodes().run()
    case 'citation':
      return editor.isActive('blockquote') ? c.lift('blockquote').run() : c.setBlockquote().run()
    case 'code':
      return editor.isActive('codeBlock') ? c.clearNodes().run() : c.setCodeBlock().run()
  }
}

export function styleActif(editor: Editor): StyleBloc {
  if (editor.isActive('heading', { level: 1 })) return 'titre1'
  if (editor.isActive('heading', { level: 2 })) return 'titre2'
  if (editor.isActive('blockquote')) return 'citation'
  if (editor.isActive('codeBlock')) return 'code'
  return 'texte'
}
