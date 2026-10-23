import { EditorContent, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { type ReactNode, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DocumentTexte, NoeudTexte } from '../../coeur/tableau'
import { EXTENSIONS_NOTE } from '../note/extensions'
import { Surcouche } from '../surcouche'
import type { PropsOutils, PropsRendu } from '../types'
import { ColonneOutils } from './ColonneOutils'
import { type FormatDocument, documentEnTexte, imprimer, nomFichier, pageImpression, telecharger } from './export'
import { compterMots, doitEtreTitre } from './texte'
import { t, tn } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'
import { Icone } from '../../icones'
import { fermerMenus, useMenu } from '../../menuUnique'

/** Le texte tel qu'une note le dessine : mêmes extensions, en lecture seule. */
const Lu = memo(function Lu({ texte }: { texte: NoeudTexte }) {
  const rendu = useMemo(() => renderToReactElement({ content: texte, extensions: EXTENSIONS_NOTE }), [texte])
  return <div className="notak-texte">{rendu}</div>
})

/** La feuille de papier de la carte : 72 px, le coin plié, un pictogramme de texte en bas. */
function Papier() {
  return (
    <svg className="notak-document-papier" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
      <path d="M12 2h35l15 15v50a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z" fill="var(--notak-carte, #fff)" stroke="rgb(0 0 0 / 0.14)" />
      <path d="M47 2v12a3 3 0 0 0 3 3h12z" fill="rgb(0 0 0 / 0.1)" />
      <g stroke="rgb(0 0 0 / 0.35)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M20 48h32M20 55h32M20 62h20" />
      </g>
    </svg>
  )
}

/** Le titre qu'on écrit sur la carte : tout est choisi d'avance ; Entrée ou un appui ailleurs le valide, Échap le laisse. */
function TitreSurCarte({ titre, valider, fini }: { titre: string; valider(titre: string): void; fini(): void }) {
  const champ = useRef<HTMLInputElement>(null)
  const annule = useRef(false)
  useLayoutEffect(() => {
    champ.current?.focus({ preventScroll: true })
    champ.current?.select()
  }, [])
  return (
    <input
      ref={champ}
      className="notak-document-saisie"
      defaultValue={titre}
      aria-label={t('document.titre')}
      placeholder={t('document.nouveau')}
      maxLength={300}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') champ.current?.blur()
        else if (e.key === 'Escape') {
          annule.current = true
          champ.current?.blur()
        }
      }}
      onBlur={(e) => {
        if (!annule.current && e.target.value !== titre) valider(e.target.value)
        fini()
      }}
    />
  )
}

export function RenduDocument({ element, enEdition, contexte, brouillon, changer }: PropsRendu<DocumentTexte>) {
  const c = element.contenu
  // Qui ne peut pas écrire peut lire en grand.
  const [enLecture, setEnLecture] = useState(false)
  const lectureSeule = !!contexte.services.lectureSeule
  // Un document que l'outil vient de poser : son titre s'écrit sur la carte, la modale attend le double-clic.
  const [titreSurCarte, setTitreSurCarte] = useState(false)
  useEffect(() => {
    // Le drapeau ne se retire qu'au déclenchement : en mode strict, React monte l'effet deux fois.
    if (lectureSeule || !doitEtreTitre(element.id, false)) return
    const delai = setTimeout(() => {
      doitEtreTitre(element.id)
      setTitreSurCarte(true)
    }, 100)
    return () => clearTimeout(delai)
  }, [element.id, lectureSeule])
  const mots = useMemo(() => compterMots(c.texte), [c.texte])
  return (
    <div className="notak-document" onDoubleClick={lectureSeule ? () => setEnLecture(true) : undefined}>
      <Papier />
      {titreSurCarte ? (
        <TitreSurCarte titre={c.titre} valider={(titre) => changer({ ...c, titre: titre.trim() })} fini={() => setTitreSurCarte(false)} />
      ) : (
        <div className="notak-document-titre" data-vide={c.titre.trim() ? undefined : ''}>
          {c.titre.trim() || t('commun.sansTitre')}
        </div>
      )}
      <div className="notak-document-mots">{tn('document.mots', mots)}</div>
      {enEdition && <Grand contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />}
      {enLecture && <Lecture contenu={c} fermer={() => setEnLecture(false)} />}
    </div>
  )
}

/** « Export ▾ » : le PDF par l'impression du navigateur, le Markdown et le texte brut téléchargés. */
function MenuExport({ titre, lireTexte }: { titre: string; lireTexte(): NoeudTexte }) {
  const [ouvert, setOuvert, ancre] = useMenu()
  const fichier = (format: FormatDocument) => {
    const texte = documentEnTexte(titre, lireTexte(), format)
    telecharger(nomFichier(titre, format), texte, format === 'md' ? 'text/markdown' : 'text/plain')
    setOuvert(false)
  }
  const pdf = () => {
    const corps = renderToStaticMarkup(renderToReactElement({ content: lireTexte(), extensions: EXTENSIONS_NOTE }))
    imprimer(pageImpression(titre.trim() || t('commun.sansTitre'), corps))
    setOuvert(false)
  }
  return (
    <div className="notak-note-menu-ancre notak-document-export" ref={ancre}>
      <button type="button" className="notak-document-export-bouton" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {t('document.exporter')} <Icone nom="chevronBas" taille={14} />
      </button>
      {ouvert && (
        <div className="notak-note-menu notak-document-export-menu" role="menu">
          <button type="button" role="menuitem" className="notak-note-menu-ligne" onClick={pdf}>
            {t('document.exportPdf')}
          </button>
          <button type="button" role="menuitem" className="notak-note-menu-ligne" onClick={() => fichier('md')}>
            {t('document.exportMarkdown')}
          </button>
          <button type="button" role="menuitem" className="notak-note-menu-ligne" onClick={() => fichier('txt')}>
            {t('document.exportTexte')}
          </button>
        </div>
      )}
    </div>
  )
}

interface PropsModale {
  titre: ReactNode
  /** Le titre est celui du document : il se modifie ici. */
  lireTexte(): NoeudTexte
  titreTexte: string
  outils?: ReactNode
  fermer(): void
  children: ReactNode
}

/**
 * La modale du document, comme Milanote : le fond assombri et flou, une boîte blanche sans arrondi collée en haut,
 * un en-tête de 56 px (le titre au centre, « Export » à droite), la colonne d'outils à gauche et le texte à côté.
 * Pas de croix : Échap ou un appui sur le fond referment.
 */
function Modale({ titre, titreTexte, lireTexte, outils, fermer, children }: PropsModale) {
  return (
    <Surcouche
      etiquette={t('type.document')}
      className="notak-document-fond"
      fermer={fermer}
      surTouche={(e) => {
        // Échap referme d'abord le menu ouvert, sans quitter le document.
        if (e.key !== 'Escape' || !(e.currentTarget as HTMLElement).querySelector('[aria-expanded="true"]')) return false
        e.preventDefault()
        fermerMenus()
        return true
      }}
    >
      <div className="notak-document-boite">
        <header className="notak-document-entete">
          <span className="notak-document-entete-vide" />
          <div className="notak-document-entete-titre">{titre}</div>
          <MenuExport titre={titreTexte} lireTexte={lireTexte} />
        </header>
        <div className="notak-document-zone">
          <aside className="notak-document-cote">{outils}</aside>
          <div className="notak-document-corps">{children}</div>
        </div>
      </div>
    </Surcouche>
  )
}

function Lecture({ contenu, fermer }: { contenu: DocumentTexte; fermer(): void }) {
  const titre = contenu.titre.trim() || t('commun.sansTitre')
  return (
    <Modale titre={<span className="notak-document-titre-lu">{titre}</span>} titreTexte={contenu.titre} lireTexte={() => contenu.texte} fermer={fermer}>
      <Lu texte={contenu.texte} />
    </Modale>
  )
}

/**
 * Le document ouvert en grand. Ce qu'on tape part au brouillon (le titre en haut comme le texte) ; le curseur
 * est dans le texte dès l'ouverture.
 */
function Grand({ contenu, ecrire, finir }: { contenu: DocumentTexte; ecrire(c: DocumentTexte): void; finir(): void }) {
  const [titre, setTitre] = useState(contenu.titre)
  const [lien, setLien] = useState<string | null>(null)
  // Le titre et le texte changent chacun de leur côté : le brouillon porte toujours les deux derniers.
  const dernier = useRef({ titre: contenu.titre, texte: contenu.texte })
  const poser = (suite: Partial<typeof dernier.current>) => {
    dernier.current = { ...dernier.current, ...suite }
    ecrire({ ...contenu, ...dernier.current })
  }
  const editeur = useEditor({
    extensions: EXTENSIONS_NOTE,
    content: contenu.texte,
    editorProps: { attributes: { class: 'notak-texte', 'aria-label': t('document.texte') } },
    onUpdate: ({ editor }) => poser({ texte: editor.getJSON() as NoeudTexte }),
  })
  useEffect(() => {
    if (editeur && !editeur.isDestroyed) editeur.commands.focus('end')
  }, [editeur])

  return (
    <Modale
      titre={
        <input
          className="notak-document-grand-titre"
          type="text"
          aria-label={t('document.titre')}
          placeholder={t('document.nouveau')}
          maxLength={300}
          spellCheck={false}
          value={titre}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setTitre(e.target.value)
            poser({ titre: e.target.value })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              editeur?.commands.focus('start')
            }
          }}
        />
      }
      titreTexte={titre}
      lireTexte={() => (editeur ? (editeur.getJSON() as NoeudTexte) : dernier.current.texte)}
      outils={editeur && <ColonneOutils editor={editeur} lien={lien} surLien={setLien} />}
      fermer={finir}
    >
      <EditorContent editor={editeur} />
    </Modale>
  )
}

export function OutilsDocument({ elements, contexte }: PropsOutils<DocumentTexte>) {
  if (elements.length !== 1) return null
  return (
    <BoutonOutil icone="ouvrir" secondaire titre={t('document.ouvrirGrand')} libelle={t('commun.ouvrir')} onClick={() => contexte.commencerEdition(elements[0]!.id)} />
  )
}
