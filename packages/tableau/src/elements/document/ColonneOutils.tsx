import { type Editor, useEditorState } from '@tiptap/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { type EtatTexte, ChampLien, MenuInsertion, MenuStyle, etatTexte } from '../note/Barre'
import { basculerCentre } from '../note/commandes'
import { type PropsOutil, OutilTexte } from '../note/OutilsTexte'
import { augmenterRetrait, diminuerRetrait } from '../note/texte'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { useMenu } from '../../menuUnique'

/** La place d'un outil en icône seule dans la colonne, en pixels (32 de tuile, 12 d'écart). */
export const PAS_OUTIL = 44
/** Ce que prennent « Style de texte », « Insérer » et « ••• » : ils ne sont jamais repliés. */
const RESERVE = 2 * 64 + 40

interface Props {
  editor: Editor
  /** Le champ d'adresse du lien : `null` fermé, sinon l'adresse en cours de saisie. */
  lien: string | null
  surLien(adresse: string | null): void
}

/** Combien d'outils en icône seule tiennent dans cette hauteur ; ce qui reste passe derrière « ••• ». 0 de hauteur : rien n'est mesuré, tout se montre. */
export function outilsVisibles(hauteur: number, total: number): number {
  if (hauteur <= 0) return total
  return Math.max(0, Math.min(total, Math.floor((hauteur - RESERVE) / PAS_OUTIL)))
}

/**
 * La colonne d'outils du document ouvert : « Style de texte » et « Insérer » avec leur nom, puis les marques en
 * icônes seules (les mêmes outils que la note), repliées derrière « ••• » quand la hauteur manque. Elle ne prend
 * jamais le focus à l'éditeur.
 */
export function ColonneOutils({ editor, lien, surLien }: Props) {
  const etat: EtatTexte = useEditorState({ editor, selector: etatTexte })
  const [menuStyle, setMenuStyle, ancreStyle] = useMenu()
  const [insertion, setInsertion, ancreInsertion] = useMenu()
  const [plus, setPlus, ancrePlus] = useMenu()
  const racine = useRef<HTMLDivElement>(null)
  const [hauteur, setHauteur] = useState(0)
  useLayoutEffect(() => {
    const el = racine.current
    if (!el) return
    const mesurer = () => setHauteur(el.clientHeight)
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(mesurer)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const chaine = () => editor.chain().focus()
  const sansSelection = etat.vide && !etat.surLien
  const dansListe = etat.puces || etat.numerotee
  const ouvrirLien = () => {
    if (sansSelection) return
    setMenuStyle(false)
    surLien((editor.getAttributes('link').href as string | undefined) ?? '')
  }
  const outils: PropsOutil[] = [
    { icone: 'gras', libelle: t('barre.gras'), raccourci: '⌘B', actif: etat.gras, onClick: () => chaine().toggleBold().run() },
    { icone: 'italique', libelle: t('barre.italique'), raccourci: '⌘I', actif: etat.italique, onClick: () => chaine().toggleItalic().run() },
    { icone: 'puces', libelle: t('barre.puces'), raccourci: '⌘⇧U', actif: etat.puces, onClick: () => chaine().toggleBulletList().run() },
    { icone: 'numerotee', libelle: t('barre.numerotee'), raccourci: '⌘⇧O', actif: etat.numerotee, onClick: () => chaine().toggleOrderedList().run() },
    { icone: 'retraitPlus', libelle: t('barre.retraitPlus'), raccourci: 'Tab', grise: !dansListe, onClick: () => { editor.commands.focus(); augmenterRetrait(editor) } },
    { icone: 'retraitMoins', libelle: t('barre.retraitMoins'), raccourci: '⇧Tab', grise: !dansListe, onClick: () => { editor.commands.focus(); diminuerRetrait(editor) } },
    { icone: 'centrer', libelle: t('barre.centrer'), raccourci: '⌘\\', actif: etat.centre, onClick: () => basculerCentre(editor) },
    { icone: 'lien', libelle: t('barre.lien'), raccourci: '⌘K', actif: etat.surLien || lien !== null, grise: sansSelection, onClick: ouvrirLien },
    { icone: 'barre', libelle: t('barre.barre'), raccourci: '⌘⇧X', actif: etat.barre, onClick: () => chaine().toggleStrike().run() },
    { icone: 'souligne', libelle: t('barre.souligne'), raccourci: '⌘U', actif: etat.souligne, onClick: () => chaine().toggleUnderline().run() },
    { icone: 'code', libelle: t('barre.codeLigne'), raccourci: '⌘E', actif: etat.code, onClick: () => chaine().toggleCode().run() },
  ]
  const n = outilsVisibles(hauteur, outils.length)
  const cache = outils.slice(n)

  return (
    <div
      ref={racine}
      className="notak-document-outils"
      role="toolbar"
      aria-label={t('document.outils')}
      // Rien ne prend le focus à l'éditeur, sauf le champ d'adresse du lien.
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
      }}
    >
      <div className="notak-note-menu-ancre" ref={ancreStyle}>
        <button type="button" className="notak-document-tuile" title={t('barre.styleTexte')} aria-expanded={menuStyle} onClick={() => setMenuStyle(!menuStyle)}>
          <span className="notak-document-tuile-icone"><Icone nom="texte" taille={22} /></span>
          <span className="notak-document-tuile-libelle">{t('barre.styleTexte')}</span>
        </button>
        {menuStyle && <MenuStyle editor={editor} etat={etat} />}
      </div>
      <div className="notak-note-menu-ancre" ref={ancreInsertion}>
        <button type="button" className="notak-document-tuile" title={t('barre.inserer')} aria-expanded={insertion} onClick={() => setInsertion(!insertion)}>
          <span className="notak-document-tuile-icone"><Icone nom="ajouter" taille={22} /></span>
          <span className="notak-document-tuile-libelle">{t('barre.inserer')}</span>
        </button>
        {insertion && <MenuInsertion editor={editor} ferme={() => setInsertion(false)} />}
      </div>
      {outils.slice(0, n).map((o) => (
        <OutilTexte key={o.icone} {...o} />
      ))}
      {cache.length > 0 && (
        <div className="notak-note-menu-ancre" ref={ancrePlus}>
          <button type="button" className="notak-document-plus" title={t('barre.plusOutils')} aria-label={t('barre.plusOutils')} aria-expanded={plus} onClick={() => setPlus(!plus)}>
            <Icone nom="plus" taille={18} />
          </button>
          {plus && (
            <div className="notak-note-menu notak-document-reste" role="menu">
              {cache.map((o) => (
                <button
                  key={o.icone}
                  type="button"
                  role="menuitem"
                  className="notak-note-menu-ligne"
                  aria-pressed={o.actif}
                  aria-disabled={o.grise || undefined}
                  onClick={o.grise ? undefined : o.onClick}
                >
                  <Icone nom={o.icone} taille={18} />
                  <span>{o.libelle}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {lien !== null && (
        <div className="notak-lien-popup">
          <ChampLien editor={editor} depart={lien} fini={() => surLien(null)} />
        </div>
      )}
    </div>
  )
}
