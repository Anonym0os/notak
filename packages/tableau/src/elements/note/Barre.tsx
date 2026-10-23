import { type Editor, useEditorState } from '@tiptap/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type StyleBloc, basculerCentre, basculerSurlignage, poserCouleurTexte, poserStyle, styleActif } from './commandes'
import { normaliserUrl } from './conversion'
import { augmenterRetrait, diminuerRetrait } from './texte'
import { COULEURS_TEXTE, SURLIGNAGES, valeurCouleurTexte } from './couleurs'

const STYLES: { style: StyleBloc; libelle: string }[] = [
  { style: 'titre1', libelle: 'Grand titre' },
  { style: 'titre2', libelle: 'Titre' },
  { style: 'texte', libelle: 'Texte' },
  { style: 'petit', libelle: 'Petit texte' },
  { style: 'citation', libelle: 'Citation' },
  { style: 'code', libelle: 'Code' },
]

const Trait = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

interface Props {
  editor: Editor
  /** Le champ d'adresse du lien : `null` fermé, sinon l'adresse en cours de saisie. */
  lien: string | null
  surLien(adresse: string | null): void
}

/** La barre de mise en forme, posée au-dessus de la note en édition. Elle ne prend jamais le focus à l'éditeur. */
export function BarreTexte({ editor, lien, surLien }: Props) {
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
      vide: ed.state.selection.empty,
      couleur: (ed.getAttributes('textStyle').color as string | undefined) ?? null,
      surlignage: ed.isActive('highlight') ? ((ed.getAttributes('highlight').color as string | null) ?? '') : null,
    }),
  })
  const [menu, setMenu] = useState(false)
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
      aria-label="Mise en forme"
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
      }}
    >
      <div className="notak-note-menu-ancre">
        <button type="button" title="Style" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          {STYLES.find((s) => s.style === etat.style)?.libelle} ▾
        </button>
        {menu && <MenuStyle editor={editor} etat={etat} ferme={() => setMenu(false)} />}
      </div>
      <i />
      {bouton('Gras', etat.gras, () => chaine().toggleBold().run(), <b>B</b>)}
      {bouton('Italique', etat.italique, () => chaine().toggleItalic().run(), <i>I</i>)}
      {bouton('Barré', etat.barre, () => chaine().toggleStrike().run(), <s>S</s>)}
      {bouton('Souligné', etat.souligne, () => chaine().toggleUnderline().run(), <u>U</u>)}
      <i />
      {bouton('Puces', etat.puces, () => chaine().toggleBulletList().run(), <Trait d="M6 4h8M6 8h8M6 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />)}
      {bouton('Numérotée', etat.numerotee, () => chaine().toggleOrderedList().run(), <Trait d="M6 4h8M6 8h8M6 12h8M2 3.5l1-.5v3M2 9.5h2l-2 2h2" />)}
      <i />
      {bouton('Centrer', etat.centre, () => basculerCentre(editor), <Trait d="M2 4h12M4 8h8M3 12h10" />)}
      {bouton('Retrait −', false, () => { editor.commands.focus(); diminuerRetrait(editor) }, <Trait d="M2 3h12M7 6.5h7M7 9.5h7M2 13h12M5 6.5 2.5 8 5 9.5" />)}
      {bouton('Retrait +', false, () => { editor.commands.focus(); augmenterRetrait(editor) }, <Trait d="M2 3h12M7 6.5h7M7 9.5h7M2 13h12M2.5 6.5 5 8 2.5 9.5" />)}
      {bouton('Code', etat.code, () => chaine().toggleCode().run(), <Trait d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />)}
      {bouton('Lien', etat.surLien || lien !== null, ouvrirLien, <Trait d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.7.7M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.7-.7" />, etat.vide && !etat.surLien)}
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
      <div className="notak-note-pastilles" aria-label="Couleur du texte">
        <button type="button" title="Défaut" aria-label="Couleur par défaut" aria-pressed={etat.couleur === null} data-vide onClick={() => poserCouleurTexte(editor, null)}>
          A
        </button>
        {COULEURS_TEXTE.map(({ nom, libelle }) => (
          <button key={nom} type="button" title={libelle} aria-label={`Texte ${libelle}`} aria-pressed={etat.couleur === valeurCouleurTexte(nom)} data-texte={nom} onClick={() => poserCouleurTexte(editor, nom)}>
            A
          </button>
        ))}
      </div>
      <div className="notak-note-pastilles" aria-label="Surlignage">
        {SURLIGNAGES.map(({ nom, libelle }) => (
          <button key={nom} type="button" title={libelle} aria-label={`Surlignage ${libelle}`} aria-pressed={etat.surlignage === nom} data-surligne={nom} onClick={() => basculerSurlignage(editor, nom)} />
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
      placeholder="Adresse"
      aria-label="Adresse du lien"
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
