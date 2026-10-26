import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import { type NoeudTexte, texteBrut } from '../../coeur/tableau'
import { type NomIcone, Icone } from '../../icones'
import { BoutonIcone, useFermeture } from '../../communs'
import { t } from '../../langue'
import { EXTENSIONS_NOTE } from '../note/extensions'
import { Flottant } from './Flottant'

/**
 * La note d'un sujet, en popover posé près de lui (Maj+Cmd+N, ou l'icône de note du sujet) : un éditeur de texte riche
 * de 400 sur 280 (gras, italique, barré, souligné, listes, lien). Elle s'écrit dans la carte quand on la quitte.
 */
interface Props {
  titre: string
  note: NoeudTexte | undefined
  /** Le coin haut-gauche voulu, en px de la surface de la carte ; la fenêtre le retient dans l'écran (Flottant). */
  x: number
  y: number
  lectureSeule: boolean
  /** Écrit la note ; `undefined` : la retirer. */
  valider(n: NoeudTexte | undefined): void
  fermer(): void
}

const BOUTONS: { icone: NomIcone; cle: string; actif: string; faire: (e: NonNullable<ReturnType<typeof useEditor>>) => void }[] = [
  { icone: 'gras', cle: 'arbre.gras', actif: 'bold', faire: (e) => e.chain().focus().toggleBold().run() },
  { icone: 'italique', cle: 'arbre.italique', actif: 'italic', faire: (e) => e.chain().focus().toggleItalic().run() },
  { icone: 'barre', cle: 'arbre.gauche.noteBarre', actif: 'strike', faire: (e) => e.chain().focus().toggleStrike().run() },
  { icone: 'souligne', cle: 'arbre.gauche.noteSouligne', actif: 'underline', faire: (e) => e.chain().focus().toggleUnderline().run() },
  { icone: 'numerotee', cle: 'arbre.gauche.noteNumerotee', actif: 'orderedList', faire: (e) => e.chain().focus().toggleOrderedList().run() },
  { icone: 'puces', cle: 'arbre.gauche.notePuces', actif: 'bulletList', faire: (e) => e.chain().focus().toggleBulletList().run() },
]

export function PopoverNote({ titre, note, x, y, lectureSeule, valider, fermer }: Props) {
  const racine = useRef<HTMLDivElement>(null)
  const editeur = useEditor({
    extensions: EXTENSIONS_NOTE,
    content: note ?? '',
    editable: !lectureSeule,
    autofocus: lectureSeule ? false : 'end',
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'notak-texte notak-arbre-note', 'aria-label': t('arbre.note') } },
  })
  // Ce qui est déjà dans la carte : on n'écrit que ce qui a changé.
  const ecrit = useRef(JSON.stringify(note))
  const quitter = useRef(() => {})
  quitter.current = () => {
    if (!editeur || lectureSeule) return
    const doc = editeur.getJSON() as NoeudTexte
    const vide = texteBrut(doc).trim() === ''
    const suite = JSON.stringify(vide ? undefined : doc)
    if (suite === ecrit.current) return
    ecrit.current = suite
    valider(vide ? undefined : doc)
  }
  useEffect(() => {
    if (!editeur) return
    const garder = () => quitter.current()
    editeur.on('blur', garder)
    return () => {
      editeur.off('blur', garder)
    }
  }, [editeur])
  // Ouverte par un menu, elle prend quand même le clavier : le menu qui se ferme rend le focus à la carte après l'autofocus.
  useEffect(() => {
    if (!editeur || lectureSeule) return
    const image = requestAnimationFrame(() => {
      if (!racine.current?.contains(document.activeElement)) editeur.commands.focus('end')
    })
    return () => cancelAnimationFrame(image)
  }, [editeur, lectureSeule])
  // Échap la ferme, où que soit le focus (il ne remonte pas jusqu'à la carte, qui se fermerait avec), et un clic dehors aussi.
  useFermeture({
    racine,
    fermer: () => {
      quitter.current()
      fermer()
    },
  })
  const lien = () => {
    if (!editeur) return
    const actuel = (editeur.getAttributes('link').href as string | undefined) ?? ''
    const url = window.prompt(t('arbre.gauche.noteLien'), actuel)
    if (url === null) return
    if (url.trim() === '') editeur.chain().focus().extendMarkRange('link').unsetLink().run()
    else editeur.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  // Le coin demandé est dans le repère de la surface de la carte ; la fenêtre flottante le veut dans celui de l'écran.
  const surface = document.querySelector('.notak-arbre-surface')?.getBoundingClientRect()
  return (
    <Flottant
      racine={racine}
      ancre={{ x: (surface?.left ?? 0) + x, y: (surface?.top ?? 0) + y, l: 0, h: 0 }}
      cote="libre"
      className="notak-pop notak-arbre-note-popover"
      role="dialog"
      aria-label={t('arbre.note')}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      // Ses touches lui restent : la carte n'y voit pas des gestes.
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="notak-arbre-note-barre" role="toolbar" aria-label={t('arbre.note')} onMouseDown={(e) => (e.target as Element).closest('button') && e.preventDefault()}>
        <span className="notak-arbre-note-titre">{titre}</span>
        {!lectureSeule &&
          editeur &&
          BOUTONS.map((b) => (
            <BoutonIcone key={b.actif} taille={30} aria-label={t(b.cle)} title={t(b.cle)} aria-pressed={editeur.isActive(b.actif)} onClick={() => b.faire(editeur)}>
              <Icone nom={b.icone} taille={18} trait={1.5} />
            </BoutonIcone>
          ))}
        {!lectureSeule && editeur && (
          <BoutonIcone taille={30} aria-label={t('arbre.lien')} title={t('arbre.lien')} aria-pressed={editeur.isActive('link')} onClick={lien}>
            <Icone nom="lien" taille={18} trait={1.5} />
          </BoutonIcone>
        )}
        <BoutonIcone
          taille={30}
          aria-label={t('commun.fermer')}
          title={t('commun.fermer')}
          onClick={() => {
            quitter.current()
            fermer()
          }}
        >
          <Icone nom="fermer" taille={16} trait={2} />
        </BoutonIcone>
      </div>
      <div className="notak-arbre-note-corps">
        <EditorContent editor={editeur} />
      </div>
    </Flottant>
  )
}
