import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { Node as NoeudPM, type Schema } from '@tiptap/pm/model'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import type { XmlFragment } from 'yjs'
import type { Id, NoeudTexte } from '../coeur/tableau'
import type { ContexteToile } from './types'

/**
 * Le texte d'un élément écrit à plusieurs (une note, une liste de tâches) : un fragment Yjs que Tiptap fusionne.
 * Le contenu de l'élément en garde une copie, écrite par l'éditeur, pour tout ce qui le lit hors édition.
 */

/** Le document que porte le fragment ; `null` s'il est vide (jamais écrit à plusieurs) ou illisible. */
function lire(fragment: XmlFragment, schema: Schema): NoeudPM | null {
  if (fragment.length === 0) return null
  try {
    return yXmlFragmentToProseMirrorRootNode(fragment, schema)
  } catch {
    return null
  }
}

/**
 * Le texte partagé de l'élément, prêt à éditer. Si personne d'autre n'y écrit, il repart de `texte`, le contenu
 * de l'élément (qu'une annulation a pu changer depuis) ; sinon on rejoint ce qui s'écrit.
 */
export function textePartage(contexte: ContexteToile, id: Id, texte: NoeudTexte, schema: Schema): XmlFragment | null {
  const fragment = contexte.magasin.texte?.(id)
  if (!fragment) return null
  const ailleurs = contexte.services.presence?.autres().some((p) => p.edition === id)
  const voulu = NoeudPM.fromJSON(schema, texte)
  if (!ailleurs && !lire(fragment, schema)?.eq(voulu)) {
    fragment.doc!.transact(() => {
      fragment.delete(0, fragment.length)
      prosemirrorToYXmlFragment(voulu, fragment)
    }, 'notak:texte')
  }
  return fragment
}

/** Le curseur d'un autre : un trait à sa couleur, son prénom au-dessus. */
function caret(utilisateur: Record<string, unknown>): HTMLElement {
  const couleur = String(utilisateur.color ?? '#888')
  const trait = document.createElement('span')
  trait.className = 'notak-caret'
  trait.style.borderColor = couleur
  const nom = document.createElement('span')
  nom.className = 'notak-caret-nom'
  nom.style.backgroundColor = couleur
  nom.textContent = String(utilisateur.name ?? '').split(' ')[0] ?? ''
  trait.append(nom)
  return trait
}

/** Ce que l'éditeur ajoute pour écrire dans `fragment` à plusieurs : la fusion, et les curseurs des autres. */
export function extensionsDuPartage(fragment: XmlFragment, contexte: ContexteToile) {
  const presence = contexte.services.presence
  const canal = presence?.canal?.()
  const moi = presence?.moi?.()
  return [
    Collaboration.configure({ fragment }),
    ...(canal && moi
      ? [
          CollaborationCaret.configure({
            provider: { awareness: canal },
            user: { name: moi.nom, color: moi.couleur },
            render: caret,
            selectionRender: (u) => ({ nodeName: 'span', class: 'notak-caret-selection', style: `background-color: ${String(u.color)}33` }),
          }),
        ]
      : []),
  ]
}
