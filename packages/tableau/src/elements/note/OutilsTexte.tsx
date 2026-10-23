import { type Editor, useEditorState } from '@tiptap/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { type EtatTexte, ChampLien, MenuStyle, etatTexte } from './Barre'
import { basculerCentre } from './commandes'
import { t } from '../../langue'
import { type NomIcone, Icone } from '../../icones'
import { fermerMenus, useMenu } from '../../menuUnique'
import { useMenusBornes } from '../../borner'

interface Props {
  editor: Editor
  /** Le champ d'adresse du lien : `null` fermé, sinon l'adresse en cours de saisie. */
  lien: string | null
  surLien(adresse: string | null): void
  /** Commenter le passage choisi ; absent en lecture seule. */
  commenter?(): void
  /** Terminer l'édition : la note reste choisie. */
  finir(): void
}

export interface PropsOutil {
  icone: NomIcone
  libelle: string
  raccourci?: string
  actif?: boolean
  /** Grisé : le glyphe à 20 %, le clic reste reçu (il ne prend pas le focus à l'éditeur) mais ne fait rien. */
  grise?: boolean
  onClick(): void
}

/** Un outil de texte : l'icône seule, sans fond de tuile ; actif, la tuile se remplit à l'inverse. Le raccourci est dans l'infobulle. */
export function OutilTexte({ icone, libelle, raccourci, actif, grise, onClick }: PropsOutil) {
  return (
    <button
      type="button"
      className="notak-outil-texte"
      title={raccourci ? `${libelle} (${raccourci})` : libelle}
      aria-label={libelle}
      aria-pressed={actif}
      aria-disabled={grise || undefined}
      onClick={grise ? undefined : onClick}
    >
      <Icone nom={icone} taille={20} />
    </button>
  )
}

/**
 * Les outils de texte d'une note en édition, dans la barre de gauche : la flèche retour en haut, puis « Style de
 * texte » (le seul avec son nom) et les marques, dans l'ordre de Milanote. Ils ne prennent jamais le focus à l'éditeur.
 * Retrait et « Insérer » n'y sont pas ; leurs raccourcis clavier restent.
 */
export function OutilsTexteGauche({ editor, lien, surLien, commenter, finir }: Props) {
  const etat: EtatTexte = useEditorState({ editor, selector: etatTexte })
  const [menu, setMenu, ancreMenu] = useMenu()
  const barre = useRef<HTMLDivElement>(null)
  useMenusBornes(barre, true)
  // Échap referme d'abord le menu ouvert, sans sortir de la note.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ancreMenu.current?.querySelector('[aria-expanded="true"]')) return
      e.stopPropagation()
      e.preventDefault()
      fermerMenus()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [ancreMenu])
  const chaine = () => editor.chain().focus()
  const ouvrirLien = () => {
    if (etat.vide && !etat.surLien) return
    setMenu(false)
    surLien((editor.getAttributes('link').href as string | undefined) ?? '')
  }
  // Replier la sélection, sinon sortir : la note reste choisie.
  const retour = () => {
    if (!etat.vide) chaine().setTextSelection(etat.debut).run()
    else finir()
  }
  const arreter = (e: { stopPropagation(): void }) => e.stopPropagation()
  const sansFocus = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
  }
  const sansSelection = etat.vide && !etat.surLien
  const outil = (p: PropsOutil): ReactNode => <OutilTexte {...p} />

  return (
    // Le portail garde les événements de React : rien de ce qui se passe ici ne doit remonter à la note ni à la toile.
    <div className="notak-edition-outils" onPointerDown={arreter} onDoubleClick={arreter} onClick={arreter} onContextMenu={arreter} onMouseDown={sansFocus}>
      <button
        type="button"
        className="notak-barre-retour"
        title={etat.vide ? t('barre.retourEdition') : t('barre.retourTexte')}
        aria-label={etat.vide ? t('barre.retourEdition') : t('barre.retourTexte')}
        onClick={retour}
      >
        <Icone nom="gauche" taille={22} />
      </button>
      <div ref={barre} className="notak-barre-selection notak-barre-edition" data-a-gauche role="toolbar" aria-label={t('barre.miseEnForme')}>
        <div className="notak-note-menu-ancre" ref={ancreMenu}>
          <button type="button" className="notak-outil notak-outil-selection" data-genre="tuile" title={t('barre.styleTexte')} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <span className="notak-outil-icone"><Icone nom="texte" taille={24} /></span>
            <span className="notak-outil-libelle">{t('barre.styleTexte')}</span>
          </button>
          {menu && <MenuStyle editor={editor} etat={etat} />}
        </div>
        {outil({ icone: 'gras', libelle: t('barre.gras'), raccourci: '⌘B', actif: etat.gras, onClick: () => chaine().toggleBold().run() })}
        {outil({ icone: 'italique', libelle: t('barre.italique'), raccourci: '⌘I', actif: etat.italique, onClick: () => chaine().toggleItalic().run() })}
        {outil({ icone: 'barre', libelle: t('barre.barre'), raccourci: '⌘⇧X', actif: etat.barre, onClick: () => chaine().toggleStrike().run() })}
        {outil({ icone: 'souligne', libelle: t('barre.souligne'), raccourci: '⌘U', actif: etat.souligne, onClick: () => chaine().toggleUnderline().run() })}
        {outil({ icone: 'puces', libelle: t('barre.puces'), raccourci: '⌘⇧U', actif: etat.puces, onClick: () => chaine().toggleBulletList().run() })}
        {outil({ icone: 'numerotee', libelle: t('barre.numerotee'), raccourci: '⌘⇧O', actif: etat.numerotee, onClick: () => chaine().toggleOrderedList().run() })}
        {outil({ icone: 'centrer', libelle: t('barre.centrer'), raccourci: '⌘\\', actif: etat.centre, onClick: () => basculerCentre(editor) })}
        {outil({ icone: 'code', libelle: t('barre.codeLigne'), raccourci: '⌘E', actif: etat.code, onClick: () => chaine().toggleCode().run() })}
        <div className="notak-note-menu-ancre">
          {outil({ icone: 'lien', libelle: t('barre.lien'), raccourci: '⌘K', actif: etat.surLien || lien !== null, grise: sansSelection, onClick: ouvrirLien })}
          {lien !== null && (
            <div className="notak-lien-popup">
              <ChampLien editor={editor} depart={lien} fini={() => surLien(null)} />
            </div>
          )}
        </div>
        {commenter &&
          outil({
            icone: 'commenterPassage',
            libelle: t('barre.commenterPassageNom'),
            raccourci: '⌘⌥M',
            actif: etat.surFil,
            // Ni passage choisi ni commentaire à ouvrir ; et pas de commentaire dans du code.
            grise: (etat.vide && !etat.surFil) || etat.code || etat.blocCode,
            onClick: commenter,
          })}
      </div>
    </div>
  )
}
