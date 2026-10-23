import { type Editor, useEditorState } from '@tiptap/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type StyleBloc, basculerCentre, basculerSurlignage, poserCouleurTexte, poserStyle, styleActif } from './commandes'
import { normaliserUrl } from './conversion'
import { EMOJIS } from './insertion'
import { augmenterRetrait, diminuerRetrait } from './texte'
import { COULEURS_TEXTE, SURLIGNAGES, valeurCouleurTexte } from './couleurs'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { useMenu } from '../../menuUnique'

const STYLES: { style: StyleBloc; libelle: string }[] = [
  { style: 'titre1', get libelle() { return t('barre.style.grandTitre') } },
  { style: 'titre2', get libelle() { return t('barre.style.titre') } },
  { style: 'texte', get libelle() { return t('barre.style.texte') } },
  { style: 'petit', get libelle() { return t('barre.style.petit') } },
  { style: 'citation', get libelle() { return t('barre.style.citation') } },
  { style: 'code', get libelle() { return t('barre.style.code') } },
]

interface Props {
  editor: Editor
  /** Le champ d'adresse du lien : `null` fermé, sinon l'adresse en cours de saisie. */
  lien: string | null
  surLien(adresse: string | null): void
  /** Commenter le passage choisi ; absent en lecture seule. */
  commenter?(): void
}

/** La barre de mise en forme, posée au-dessus de la note en édition. Elle ne prend jamais le focus à l'éditeur. */
export function BarreTexte({ editor, lien, surLien, commenter }: Props) {
  const etat = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      style: styleActif(ed),
      gras: ed.isActive('bold'),
      italique: ed.isActive('italic'),
      barre: ed.isActive('strike'),
      souligne: ed.isActive('underline'),
      puces: ed.isActive('bulletList'),
      numerotee: ed.isActive('orderedList'),
      centre: ed.isActive({ textAlign: 'center' }),
      code: ed.isActive('code'),
      surLien: ed.isActive('link'),
      surFil: ed.isActive('commentaireTexte'),
      vide: ed.state.selection.empty,
      couleur: (ed.getAttributes('textStyle').color as string | undefined) ?? null,
      surlignage: ed.isActive('highlight') ? ((ed.getAttributes('highlight').color as string | null) ?? '') : null,
    }),
  })
  const [menu, setMenu, ancreMenu] = useMenu()
  const [insertion, setInsertion, ancreInsertion] = useMenu()
  const ouvrirLien = () => {
    if (etat.vide && !etat.surLien) return
    setMenu(false)
    surLien((editor.getAttributes('link').href as string | undefined) ?? '')
  }

  const bouton = (libelle: string, actif: boolean, action: () => void, contenu: ReactNode, desactive = false) => (
    <button type="button" title={libelle} aria-label={libelle} aria-pressed={actif} disabled={desactive} onClick={action}>
      {contenu}
    </button>
  )
  const chaine = () => editor.chain().focus()

  return (
    <div
      className="notak-note-barre"
      role="toolbar"
      aria-label={t('barre.miseEnForme')}
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
      }}
    >
      <div className="notak-note-menu-ancre" ref={ancreMenu}>
        <button type="button" title={t('barre.style')} aria-expanded={menu} onClick={() => setMenu(!menu)}>
          {STYLES.find((s) => s.style === etat.style)?.libelle} <Icone nom="chevronBas" taille={14} />
        </button>
        {menu && <MenuStyle editor={editor} etat={etat} ferme={() => setMenu(false)} />}
      </div>
      <i />
      {bouton(t('barre.gras'), etat.gras, () => chaine().toggleBold().run(), <Icone nom="gras" />)}
      {bouton(t('barre.italique'), etat.italique, () => chaine().toggleItalic().run(), <Icone nom="italique" />)}
      {bouton(t('barre.barre'), etat.barre, () => chaine().toggleStrike().run(), <Icone nom="barre" />)}
      {bouton(t('barre.souligne'), etat.souligne, () => chaine().toggleUnderline().run(), <Icone nom="souligne" />)}
      <i />
      {bouton(t('barre.puces'), etat.puces, () => chaine().toggleBulletList().run(), <Icone nom="puces" />)}
      {bouton(t('barre.numerotee'), etat.numerotee, () => chaine().toggleOrderedList().run(), <Icone nom="numerotee" />)}
      <i />
      {bouton(t('barre.centrer'), etat.centre, () => basculerCentre(editor), <Icone nom="centrer" />)}
      {bouton(t('barre.retraitMoins'), false, () => { editor.commands.focus(); diminuerRetrait(editor) }, <Icone nom="retraitMoins" />)}
      {bouton(t('barre.retraitPlus'), false, () => { editor.commands.focus(); augmenterRetrait(editor) }, <Icone nom="retraitPlus" />)}
      {bouton(t('barre.codeLigne'), etat.code, () => chaine().toggleCode().run(), <Icone nom="code" />)}
      {bouton(t('barre.lien'), etat.surLien || lien !== null, ouvrirLien, <Icone nom="lien" />, etat.vide && !etat.surLien)}
      {commenter &&
        bouton(t('barre.commenterPassage'), etat.surFil, commenter, <Icone nom="commenterPassage" />, etat.vide && !etat.surFil)}
      <i />
      <div className="notak-note-menu-ancre" ref={ancreInsertion}>
        <button type="button" title={t('barre.inserer')} aria-expanded={insertion} onClick={() => setInsertion(!insertion)}>
          {t('barre.inserer')} <Icone nom="chevronBas" taille={14} />
        </button>
        {insertion && <MenuInsertion editor={editor} ferme={() => setInsertion(false)} />}
      </div>
      {lien !== null && <ChampLien editor={editor} depart={lien} fini={() => surLien(null)} />}
    </div>
  )
}

function MenuStyle({ editor, etat, ferme }: { editor: Editor; etat: { couleur: string | null; surlignage: string | null }; ferme(): void }) {
  return (
    <div className="notak-note-menu" role="menu">
      {STYLES.map(({ style, libelle }) => (
        <button key={style} type="button" role="menuitem" className="notak-note-menu-ligne" onClick={() => { poserStyle(editor, style); ferme() }}>
          {libelle}
        </button>
      ))}
      <hr />
      <div className="notak-note-pastilles" aria-label={t('barre.couleurTexte')}>
        <button type="button" title={t('barre.defaut')} aria-label={t('barre.couleurDefaut')} aria-pressed={etat.couleur === null} data-vide onClick={() => poserCouleurTexte(editor, null)}>
          A
        </button>
        {COULEURS_TEXTE.map(({ nom, libelle }) => (
          <button key={nom} type="button" title={libelle} aria-label={t('barre.texteCouleur', { couleur: libelle })} aria-pressed={etat.couleur === valeurCouleurTexte(nom)} data-texte={nom} onClick={() => poserCouleurTexte(editor, nom)}>
            A
          </button>
        ))}
      </div>
      <div className="notak-note-pastilles" aria-label={t('barre.surlignage')}>
        {SURLIGNAGES.map(({ nom, libelle }) => (
          <button key={nom} type="button" title={libelle} aria-label={t('barre.surlignageCouleur', { couleur: libelle })} aria-pressed={etat.surlignage === nom} data-surligne={nom} onClick={() => basculerSurlignage(editor, nom)} />
        ))}
      </div>
    </div>
  )
}

/** Le menu d'insertion : un séparateur, un émoji. */
function MenuInsertion({ editor, ferme }: { editor: Editor; ferme(): void }) {
  return (
    <div className="notak-note-menu" role="menu">
      <button type="button" role="menuitem" className="notak-note-menu-ligne" onClick={() => { editor.chain().focus().setHorizontalRule().run(); ferme() }}>
        {t('barre.separateur')}
      </button>
      <hr />
      <div className="notak-note-emojis" role="group" aria-label={t('barre.emojis')}>
        {EMOJIS.map((e) => (
          <button key={e} type="button" role="menuitem" aria-label={e} onClick={() => { editor.chain().focus().insertContent(e).run(); ferme() }}>
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChampLien({ editor, depart, fini }: { editor: Editor; depart: string; fini(): void }) {
  const [valeur, setValeur] = useState(depart)
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => champ.current?.focus(), [])
  const valider = () => {
    const url = normaliserUrl(valeur)
    const c = editor.chain().focus().extendMarkRange('link')
    if (url) c.setLink({ href: url }).run()
    else c.unsetLink().run()
    fini()
  }
  return (
    <input
      ref={champ}
      className="notak-note-lien"
      value={valeur}
      placeholder={t('lien.adresse')}
      aria-label={t('barre.adresseLien')}
      onChange={(e) => setValeur(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          valider()
        } else if (e.key === 'Escape') {
          // Échap ferme le champ ; il ne sort pas de la note.
          e.stopPropagation()
          e.preventDefault()
          editor.commands.focus()
          fini()
        }
      }}
    />
  )
}
