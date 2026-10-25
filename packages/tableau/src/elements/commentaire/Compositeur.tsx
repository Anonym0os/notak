import { EditorContent, Extension, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { NoeudTexte } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { FenetreEmojis } from '../decor/FenetreEmojis'
import { EXTENSIONS_NOTE } from '../note/extensions'
import { type Pont, Propositions, extensionPropositions } from '../note/Propositions'
import type { ContexteToile } from '../types'
import { estSimple, richeDe, texteDeRiche } from './fil'

/** Ce que le champ montre de l'éditeur de la note : les marques en ligne, les citations et les adresses repérées. */
const DE_LA_NOTE = new Set(['highlight', 'textStyle', 'color', 'code', 'adressesReperees', 'mention', 'lienTableau', 'markdownTape'])

/**
 * Les extensions d'un message : celles de la note (gras, italique, barré, lien, code, surlignage, couleur, mentions),
 * sans les blocs (titres, listes, tables, citations) qu'un commentaire n'a pas.
 */
export const EXTENSIONS_MESSAGE = [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    code: false,
    link: { openOnClick: false, autolink: false, linkOnPaste: false },
  }),
  ...EXTENSIONS_NOTE.filter((e) => DE_LA_NOTE.has(e.name)),
]

/** Ce qu'on peut demander au champ du dehors. */
export interface PoigneeCompositeur {
  /** Pose du texte (un émoji) au curseur. */
  inserer(texte: string): void
  focus(): void
  vider(): void
  /** Envoie ce qui est écrit, comme Entrée (le bouton d'envoi). */
  envoyer?(): void
}

export interface PropsCompositeur {
  contexte: ContexteToile
  /** Le message qu'on modifie, ou rien pour un message neuf. */
  initial?: { texte: string; riche?: NoeudTexte }
  placeholder: string
  autoFocus?: boolean
  /** À chaque frappe : le texte brut, et la mise en forme si elle dit plus que lui. */
  surChangement?(texte: string, riche: NoeudTexte | undefined): void
  /** Entrée (hors liste de mentions). */
  envoyer(texte: string, riche: NoeudTexte | undefined): void
  /** Échap. Rend vrai si la touche a servi. */
  echapper?(): boolean | void
  /** Retour arrière dans un champ resté vide. */
  retourVide?(): void
  /** Le texte est tapé (vrai) ou vidé (faux), pour dire aux autres qu'on écrit. */
  surFrappe?(): void
  poignee?: Ref<PoigneeCompositeur>
  /** Des boutons à poser dans le coin bas droit du champ (Publier, Enregistrer). */
  children?: React.ReactNode
  className?: string
}

/**
 * Le champ d'un message : l'éditeur de la note, réduit aux paragraphes et aux marques en ligne, avec les mentions `@`
 * et un bouton d'émojis. Entrée envoie, Maj+Entrée va à la ligne.
 */
export function Compositeur({ contexte, initial, placeholder, autoFocus, surChangement, envoyer, echapper, retourVide, surFrappe, poignee, children, className }: PropsCompositeur) {
  const pont = useRef<Pont | null>(null)
  // Les rappels changent à chaque rendu : l'extension lit toujours les derniers.
  const gestes = useRef({ envoyer, echapper, retourVide })
  gestes.current = { envoyer, echapper, retourVide }
  const lire = (editeur: { getJSON(): unknown }) => {
    const doc = editeur.getJSON() as NoeudTexte
    return { texte: texteDeRiche(doc).trim(), riche: estSimple(doc) ? undefined : doc }
  }
  const extensions = useMemo(
    () => [
      ...EXTENSIONS_MESSAGE,
      extensionPropositions(pont),
      Extension.create({
        name: 'envoiMessage',
        priority: 1100,
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              const { texte, riche } = lire(this.editor)
              if (texte) gestes.current.envoyer(texte, riche)
              return true
            },
            Escape: () => !!gestes.current.echapper?.(),
            Backspace: () => {
              if (!this.editor.isEmpty || !gestes.current.retourVide) return false
              gestes.current.retourVide()
              return true
            },
          }
        },
      }),
    ],
    [],
  )
  const editeur = useEditor({
    extensions,
    content: initial ? richeDe(initial) : '',
    editorProps: { attributes: { class: 'notak-texte notak-commentaire-saisie-texte', 'aria-label': placeholder } },
    onUpdate: ({ editor }) => {
      const { texte, riche } = lire(editor)
      surChangement?.(texte, riche)
      if (texte) surFrappe?.()
    },
  })
  useEffect(() => {
    if (!editeur || editeur.isDestroyed || !autoFocus) return
    editeur.commands.focus('end')
  }, [editeur, autoFocus])

  const [emojis, setEmojis] = useState<Element | null>(null)
  const boutonEmoji = useRef<HTMLButtonElement>(null)
  useImperativeHandle(
    poignee,
    () => ({
      inserer: (texte) => void editeur?.chain().focus().insertContent(texte).run(),
      focus: () => void editeur?.commands.focus('end'),
      vider: () => void editeur?.commands.clearContent(true),
      envoyer: () => {
        if (!editeur) return
        const { texte, riche } = lire(editeur)
        if (texte) gestes.current.envoyer(texte, riche)
      },
    }),
    [editeur],
  )
  const vide = useEditorState({ editor: editeur, selector: ({ editor }) => editor?.isEmpty ?? true })
  if (!editeur) return null
  return (
    <div className={`notak-compositeur${className ? ` ${className}` : ''}`} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {vide && <span className="notak-compositeur-attente" aria-hidden>{placeholder}</span>}
      <EditorContent editor={editeur} />
      <div className="notak-compositeur-pied">
        <button
          ref={boutonEmoji}
          type="button"
          className="notak-compositeur-emoji"
          aria-expanded={emojis !== null}
          aria-label={t('commentaire.emoji')}
          title={t('commentaire.emoji')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEmojis(emojis ? null : boutonEmoji.current)}
        >
          <Icone nom="reaction" taille={15} />
        </button>
        {children}
      </div>
      <Propositions editeur={editeur} contexte={contexte} pont={pont} />
      {emojis && (
        <FenetreEmojis
          ancre={emojis}
          fermer={() => setEmojis(null)}
          choisir={(e) => {
            editeur.chain().focus().insertContent(e).run()
            setEmojis(null)
          }}
        />
      )}
    </div>
  )
}
