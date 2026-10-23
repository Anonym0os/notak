import { type Editor, useEditorState } from '@tiptap/react'
import { useEffect, useMemo, useRef } from 'react'
import { type EtatTexte, ChampLien, MenuStyle, etatTexte } from './Barre'
import { basculerCentre } from './commandes'
import { t } from '../../langue'
import { type NomIcone, Icone } from '../../icones'
import { Infobulle } from '../../Infobulle'
import { fermerMenus, useMenu } from '../../menuUnique'
import { useMenusBornes } from '../../borner'
import { type EntreeRepli, ORDRE, type Palier, useRepli } from '../../repli'

interface Props {
  editor: Editor
  /** Le champ d'adresse du lien : `null` fermé, sinon l'adresse en cours de saisie. */
  lien: string | null
  surLien(adresse: string | null): void
  /** Commenter le passage choisi ; absent en lecture seule. */
  commenter?(): void
  /** Terminer l'édition : la note reste choisie. */
  finir(): void
  /** `legende` : le texte riche de la légende, sans blocs ni listes ni code ni commentaire. */
  variante?: 'note' | 'legende'
}

export interface PropsOutil {
  icone: NomIcone
  libelle: string
  raccourci?: string
  actif?: boolean
  /** Grisé : le glyphe à 20 %, le clic reste reçu (il ne prend pas le focus à l'éditeur) mais ne fait rien. */
  grise?: boolean
  onClick(): void
  /** Rangé dans le « ••• » : une tuile avec son nom, plutôt que l'icône seule. */
  enTuile?: boolean
}

/** Un outil de texte : l'icône seule, sans fond de tuile ; actif, la tuile se remplit à l'inverse. Le raccourci est dans l'infobulle. */
export function OutilTexte({ icone, libelle, raccourci, actif, grise, onClick, enTuile }: PropsOutil) {
  if (enTuile)
    return (
      <button type="button" className="notak-outil notak-outil-selection" data-genre="tuile" aria-label={libelle} aria-pressed={actif} aria-disabled={grise || undefined} onClick={grise ? undefined : onClick}>
        <span className="notak-outil-icone"><Icone nom={icone} taille={24} /></span>
        <span className="notak-outil-libelle">{libelle}</span>
      </button>
    )
  return (
    <Infobulle libelle={libelle} {...(raccourci ? { raccourci } : {})} cote="droite" contenu>
      <button type="button" className="notak-outil-texte" aria-label={libelle} aria-pressed={actif} aria-disabled={grise || undefined} onClick={grise ? undefined : onClick}>
        <Icone nom={icone} taille={20} />
      </button>
    </Infobulle>
  )
}

/**
 * Les outils de texte d'une note en édition, dans la barre de gauche : la flèche retour en haut, puis « Style de
 * texte » (le seul avec son nom) et les marques, dans l'ordre de Milanote. Ils ne prennent jamais le focus à l'éditeur.
 * Retrait et « Insérer » n'y sont pas ; leurs raccourcis clavier restent.
 */
export function OutilsTexteGauche({ editor, lien, surLien, commenter, finir, variante = 'note' }: Props) {
  const legende = variante === 'legende'
  const etat: EtatTexte = useEditorState({ editor, selector: etatTexte })
  const [menu, setMenu, ancreMenu] = useMenu()
  const [tiroir, setTiroir, ancreTiroir] = useMenu()
  const barre = useRef<HTMLDivElement>(null)
  useMenusBornes(barre, true)
  // Échap referme d'abord le menu ouvert, sans sortir de la note.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !barre.current?.querySelector('[aria-expanded="true"]')) return
      e.stopPropagation()
      e.preventDefault()
      fermerMenus()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])
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

  // Les outils dans l'ordre de la barre, avec leur ordre de repli (relevé) : trop court, Code, Souligné, Barré,
  // Alignement, Lien partent d'abord dans le « ••• » ; Commentaire ne se replie jamais.
  const tous: (PropsOutil & { id: string; ordre: number })[] = [
    { id: 'gras', ordre: 100, icone: 'gras', libelle: t('barre.gras'), raccourci: '⌘B', actif: etat.gras, onClick: () => chaine().toggleBold().run() },
    { id: 'italique', ordre: 100, icone: 'italique', libelle: t('barre.italique'), raccourci: '⌘I', actif: etat.italique, onClick: () => chaine().toggleItalic().run() },
    { id: 'barre', ordre: 1003, icone: 'barre', libelle: t('barre.barre'), raccourci: '⌘⇧X', actif: etat.barre, onClick: () => chaine().toggleStrike().run() },
    { id: 'souligne', ordre: 1004, icone: 'souligne', libelle: t('barre.souligne'), raccourci: '⌘U', actif: etat.souligne, onClick: () => chaine().toggleUnderline().run() },
    { id: 'puces', ordre: 101, icone: 'puces', libelle: t('barre.puces'), raccourci: '⌘⇧U', actif: etat.puces, onClick: () => chaine().toggleBulletList().run() },
    { id: 'numerotee', ordre: 101, icone: 'numerotee', libelle: t('barre.numerotee'), raccourci: '⌘⇧O', actif: etat.numerotee, onClick: () => chaine().toggleOrderedList().run() },
    { id: 'centrer', ordre: 1002, icone: 'centrer', libelle: t('barre.centrer'), raccourci: '⌘\\', actif: etat.centre, onClick: () => basculerCentre(editor) },
    { id: 'code', ordre: 1005, icone: 'code', libelle: t('barre.codeLigne'), raccourci: '⌘E', actif: etat.code, onClick: () => chaine().toggleCode().run() },
    { id: 'lien', ordre: 1000, icone: 'lien', libelle: t('barre.lien'), raccourci: '⌘K', actif: etat.surLien || lien !== null, grise: sansSelection, onClick: ouvrirLien },
    ...(commenter
      ? [
          {
            id: 'commentaire',
            ordre: ORDRE.jamais,
            icone: 'commenterPassage' as const,
            libelle: t('barre.commenterPassageNom'),
            raccourci: '⌘⌥M',
            actif: etat.surFil,
            // Ni passage choisi ni commentaire à ouvrir ; et pas de commentaire dans du code.
            grise: (etat.vide && !etat.surFil) || etat.code || etat.blocCode,
            onClick: commenter,
          },
        ]
      : []),
  ]
  // La légende : Gras, Italique, Barré, Souligné, Lien, Centrer, et rien d'autre.
  const outils = legende
    ? ORDRE_LEGENDE.map((id) => tous.find((o) => o.id === id)!)
    : tous
  const entrees = useMemo<EntreeRepli[]>(
    () => [{ id: 'style', genre: 'tuile', ordre: 10 }, ...outils.map((o): EntreeRepli => ({ id: o.id, genre: 'icone', ordre: o.ordre }))],
    [outils.map((o) => o.id).join('|')], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const { ranges } = useRepli(barre, entrees, fixeTexte)
  const rangeStyle = ranges.has('style')
  const rangesOutils = outils.filter((o) => ranges.has(o.id))
  const style = (
    <div className="notak-note-menu-ancre" ref={ancreMenu}>
      <Infobulle libelle={t('barre.styleTexte')} cote="droite" contenu>
        <button type="button" className="notak-outil notak-outil-selection" data-genre="tuile" aria-label={t('barre.styleTexte')} aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <span className="notak-outil-icone"><Icone nom="texte" taille={24} /></span>
          <span className="notak-outil-libelle">{t('barre.styleTexte')}</span>
        </button>
      </Infobulle>
      {menu && <MenuStyle editor={editor} etat={etat} sansBlocs={legende} />}
    </div>
  )
  const popupLien = lien !== null && (
    <div className="notak-lien-popup">
      <ChampLien editor={editor} depart={lien} fini={() => surLien(null)} />
    </div>
  )

  return (
    // Le portail garde les événements de React : rien de ce qui se passe ici ne doit remonter à la note ni à la toile.
    <div className="notak-edition-outils" onPointerDown={arreter} onDoubleClick={arreter} onClick={arreter} onContextMenu={arreter} onMouseDown={sansFocus}>
      <Infobulle libelle={etat.vide ? t('barre.retourEdition') : t('barre.retourTexte')} cote="droite" contenu>
        <button type="button" className="notak-barre-retour" aria-label={etat.vide ? t('barre.retourEdition') : t('barre.retourTexte')} onClick={retour}>
          <Icone nom="gauche" taille={22} />
        </button>
      </Infobulle>
      <div ref={barre} className="notak-barre-selection notak-barre-edition" data-a-gauche role="toolbar" aria-label={t('barre.miseEnForme')}>
        {!rangeStyle && style}
        {outils.map((o) =>
          o.id === 'lien' ? (
            ranges.has('lien') ? (
              popupLien && <div key={o.id} className="notak-note-menu-ancre">{popupLien}</div>
            ) : (
              <div key={o.id} className="notak-note-menu-ancre">
                <OutilTexte {...o} />
                {popupLien}
              </div>
            )
          ) : ranges.has(o.id) ? null : (
            <OutilTexte key={o.id} {...o} />
          ),
        )}
        {(rangeStyle || rangesOutils.length > 0) && (
          <div className="notak-outil-place notak-selection-plus" ref={ancreTiroir}>
            <Infobulle libelle={t('barre.plusOutils')} cote="droite" contenu>
              <button type="button" className="notak-outil-plus" aria-expanded={tiroir} aria-label={t('barre.plusOutils')} onClick={() => setTiroir(!tiroir)}>
                <Icone nom="plus" />
              </button>
            </Infobulle>
            {tiroir && (
              <div className="notak-tiroir">
                {rangeStyle && <div className="notak-tiroir-style">{style}</div>}
                {rangesOutils.map((o) => (
                  <OutilTexte key={o.id} {...o} enTuile />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Les outils de la légende, dans l'ordre. */
const ORDRE_LEGENDE = ['gras', 'italique', 'barre', 'souligne', 'lien', 'centrer']

/** La place de ce qui ne se replie pas dans la barre de texte : marges, flèche retour, « ••• », corbeille. */
const fixeTexte = (p: Palier) => (p === 'grande' ? 20 : 12) + 44 + 34 + 60 + 12
