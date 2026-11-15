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
import { type Brouillon, brouillonGarde, garderBrouillon, inscrireChamp, retenirParmi, type Retenue } from './brouillon'
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
  /**
   * La clé du brouillon (`brouillon.ts`) : le champ retient ce qu'on n'a pas publié. Un geste de sortie le signale
   * d'abord, le second l'abandonne ; une fiche démontée le garde sous cette clé, et le champ remonté le rend. Sans
   * clé, le champ ne retient rien (le fil de la toile, dont le brouillon vit dans l'élément).
   */
  garde?: string
  /** Le brouillon abandonné (le second geste de sortie, « Abandonner ») : la modification d'un message s'arrête. */
  surAbandon?(): void
  /** Des boutons à poser dans le coin bas droit du champ (Publier, Enregistrer). */
  children?: React.ReactNode
  className?: string
}

/**
 * Le champ d'un message : l'éditeur de la note, réduit aux paragraphes et aux marques en ligne, avec les mentions `@`
 * et un bouton d'émojis. Entrée envoie, Maj+Entrée va à la ligne.
 */
export function Compositeur({ contexte, initial, placeholder, autoFocus, surChangement, envoyer, echapper, retourVide, surFrappe, poignee, garde, surAbandon, children, className }: PropsCompositeur) {
  const pont = useRef<Pont | null>(null)
  const racine = useRef<HTMLDivElement>(null)
  // La garde du brouillon : ce qu'il était à l'ouverture (rien, ou le message qu'on modifie), et s'il a prévenu.
  const depart = useRef<string | null>(null)
  // Le brouillon gardé sous cette clé, lu une fois : le champ s'ouvre dessus.
  const repris = useRef(garde ? brouillonGarde(garde) : undefined)
  const [alerte, setAlerte] = useState(false)
  const prevenu = useRef(false)
  const [secousse, setSecousse] = useState(0)
  const retenue = useRef<Retenue | null>(null)
  // Les rappels changent à chaque rendu : l'extension lit toujours les derniers.
  const gestes = useRef({ envoyer, echapper, retourVide, surAbandon, surFrappe, garde })
  gestes.current = { envoyer, echapper, retourVide, surAbandon, surFrappe, garde }
  const lire = (editeur: { getJSON(): unknown }): Brouillon => {
    const doc = editeur.getJSON() as NoeudTexte
    return { texte: texteDeRiche(doc).trim(), ...(estSimple(doc) ? {} : { riche: doc }) }
  }
  const signature = (b: Brouillon) => `${b.texte}\u0000${b.riche ? JSON.stringify(b.riche) : ''}`
  /** Envoyer : le brouillon gardé part avec. */
  const envoyerLu = (editeur: { getJSON(): unknown }) => {
    const { texte, riche } = lire(editeur)
    if (!texte) return
    gestes.current.envoyer(texte, riche)
    if (gestes.current.garde) garderBrouillon(gestes.current.garde, null)
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
              envoyerLu(this.editor)
              return true
            },
            // Avec un brouillon, le premier Échap le signale, le second l'abandonne et ferme.
            Escape: () => {
              if (retenue.current && retenirParmi([retenue.current])) return true
              return !!gestes.current.echapper?.()
            },
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
    content: repris.current ? richeDe(repris.current) : initial ? richeDe(initial) : '',
    editorProps: { attributes: { class: 'notak-texte notak-commentaire-saisie-texte', 'aria-label': placeholder } },
    onUpdate: ({ editor }) => {
      const lu = lire(editor)
      const { texte, riche } = lu
      if (gestes.current.garde) garderBrouillon(gestes.current.garde, texte && signature(lu) !== signatureDepart(editor) ? lu : null)
      // Une frappe après l'avertissement : il faudra le redire avant d'abandonner.
      if (prevenu.current) {
        prevenu.current = false
        setAlerte(false)
      }
      surChangement?.(texte, riche)
      if (texte) gestes.current.surFrappe?.()
    },
  })
  /** Ce que le champ disait à l'ouverture, lu par le schéma de l'éditeur (comme `getJSON` le rendrait). */
  function signatureDepart(editor: typeof editeur & {}): string {
    if (depart.current !== null) return depart.current
    let doc: unknown = { type: 'doc', content: [] }
    if (initial) {
      try {
        doc = editor.schema.nodeFromJSON(richeDe(initial)).toJSON()
      } catch {
        doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: initial.texte }] }] }
      }
    }
    depart.current = signature(lire({ getJSON: () => doc }))
    return depart.current
  }
  // Rendu à l'ouverture, le brouillon gardé se dit à l'hôte (« Publier » s'allume) ; ce n'est pas une frappe.
  useEffect(() => {
    if (!editeur || !repris.current) return
    const { texte, riche } = lire(editeur)
    surChangement?.(texte, riche)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editeur])
  const abandonner = () => {
    prevenu.current = false
    setAlerte(false)
    if (garde) garderBrouillon(garde, null)
    if (editeur && !editeur.isDestroyed) {
      if (initial) editeur.commands.setContent(richeDe(initial), { emitUpdate: true })
      else editeur.commands.clearContent(true)
      if (garde) garderBrouillon(garde, null)
    }
    gestes.current.surAbandon?.()
  }
  const abandonnerRef = useRef(abandonner)
  abandonnerRef.current = abandonner
  useEffect(() => {
    if (!editeur || !garde) return
    const r: Retenue = {
      zone: () => zoneDuChamp(racine.current),
      sale: () => {
        if (editeur.isDestroyed) return false
        const lu = lire(editeur)
        return !!lu.texte && signature(lu) !== signatureDepart(editeur)
      },
      prevenu: () => prevenu.current,
      signaler: () => {
        prevenu.current = true
        setAlerte(true)
        setSecousse((n) => n + 1)
        if (!editeur.isDestroyed) editeur.commands.focus()
      },
      abandonner: () => abandonnerRef.current(),
    }
    retenue.current = r
    const desinscrire = inscrireChamp(r)
    return () => {
      desinscrire()
      if (retenue.current === r) retenue.current = null
    }
  }, [editeur, garde])
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
        if (editeur) envoyerLu(editeur)
      },
    }),
    [editeur],
  )
  const vide = useEditorState({ editor: editeur, selector: ({ editor }) => editor?.isEmpty ?? true })
  if (!editeur) return null
  return (
    <div ref={racine} className="notak-compositeur-bloc" data-secousse={secousse ? (secousse % 2 ? 'a' : 'b') : undefined} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className={`notak-compositeur${className ? ` ${className}` : ''}`} data-alerte={alerte || undefined}>
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
      {alerte && (
        <p className="notak-compositeur-alerte" role="alert" title={t('commentaire.brouillon.aide')}>
          <span>{initial ? t('commentaire.brouillon.nonEnregistre') : t('commentaire.brouillon.nonPublie')}</span>
          <span aria-hidden>·</span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => envoyerLu(editeur)}>
            {initial ? t('commentaire.enregistrer') : t('commentaire.publier')}
          </button>
          <span aria-hidden>·</span>
          <button type="button" data-genre="abandonner" onMouseDown={(e) => e.preventDefault()} onClick={abandonner}>
            {t('commentaire.brouillon.abandonner')}
          </button>
        </p>
      )}
    </div>
  )
}

/**
 * La fiche d'un champ, où un appui n'est pas une sortie : la bulle d'une épingle, la fiche d'un passage en marge, ou,
 * à défaut, le fil sur la toile ; le champ seul hors de tout fil.
 */
function zoneDuChamp(n: HTMLElement | null): Element | null {
  return n?.closest('.notak-fil-attache, .notak-fil-marge') ?? n?.closest('.notak-commentaire') ?? n
}
