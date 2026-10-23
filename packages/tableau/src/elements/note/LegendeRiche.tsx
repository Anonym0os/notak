import { type Editor, EditorContent, Extension, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { type RefObject, memo, useEffect, useMemo } from 'react'
import type { NoeudTexte } from '../../coeur/tableau'
import { t } from '../../langue'
import { adressesEnLiens, docEstVide } from './conversion'
import { EXTENSIONS_LEGENDE } from './extensions'

/** La légende hors édition : le texte riche, tel qu'il a été écrit ; les adresses y sont cliquables. */
export const LegendeFigee = memo(function LegendeFigee({ doc }: { doc: NoeudTexte }) {
  const rendu = useMemo(() => renderToReactElement({ content: adressesEnLiens(doc), extensions: EXTENSIONS_LEGENDE }), [doc])
  return <div className="notak-legende-texte notak-texte">{rendu}</div>
})

/** Ce que la légende demande à la note qui l'accueille. */
export interface ActionsLegende {
  /** Ouvre le champ d'adresse du lien, sur la légende. */
  lien(): void
  /** Retour arrière sur une légende vide : la légende disparaît et l'écriture repart dans le texte. */
  retirer(): void
  /** Cmd+Entrée : la note suivante. */
  noteDessous(): void
}

const clavierLegende = (actions: RefObject<ActionsLegende | null>) =>
  Extension.create({
    name: 'clavierLegende',
    priority: 1100,
    addKeyboardShortcuts() {
      return {
        'Mod-k': () => {
          actions.current?.lien()
          return true
        },
        'Mod-Enter': () => {
          actions.current?.noteDessous()
          return true
        },
        Backspace: () => {
          if (!docEstVide(this.editor.getJSON() as NoeudTexte)) return false
          actions.current?.retirer()
          return true
        },
      }
    },
  })

/**
 * La légende en édition : un petit éditeur de texte riche (voir `EXTENSIONS_LEGENDE`), dans la carte de la note.
 * Sa barre d'outils est celle de la barre de gauche, que la note branche sur `surEditeur` quand l'éditeur a le focus.
 */
export function LegendeEditeur({
  depart,
  ecrire,
  surEditeur,
  actions,
}: {
  depart: NoeudTexte
  ecrire(doc: NoeudTexte): void
  surEditeur(e: Editor | null): void
  actions: RefObject<ActionsLegende | null>
}) {
  const extensions = useMemo(() => [...EXTENSIONS_LEGENDE, clavierLegende(actions)], [actions])
  const editeur = useEditor({
    extensions,
    content: depart,
    editorProps: { attributes: { class: 'notak-legende-texte notak-texte', 'data-attente': t('note.legende') } },
    onUpdate: ({ editor }) => ecrire(editor.getJSON() as NoeudTexte),
  })
  useEffect(() => {
    if (!editeur) return
    surEditeur(editeur)
    return () => surEditeur(null)
  }, [editeur, surEditeur])
  return <EditorContent editor={editeur} />
}
