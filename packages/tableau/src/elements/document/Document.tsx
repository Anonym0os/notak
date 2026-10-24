import { EditorContent, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { type ReactNode, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { type Commentaire, type DocumentTexte, type Id, type NoeudTexte, nouvelId } from '../../coeur/tableau'
import { type Fils, MARQUE_FIL, avecFil, filsVivants, sansPassagesMuets } from '../note/fils'
import { Marge } from '../note/Marge'
import { type Pont, Propositions, extensionPropositions } from '../note/Propositions'
import { Surcouche } from '../surcouche'
import { CLE_IDS } from '../../blocs/ids'
import { degrader, lisible } from '../../blocs/lisible'
import { EXTENSIONS_BLOCS, SCHEMA_BLOCS as SCHEMA } from '../../blocs/schema'
import { LegendeLocale, OutilLegende, avecTexteLegende } from '../LegendeLocale'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { ColonneOutils } from './ColonneOutils'
import { documentEnDocx } from './docx'
import { type FormatDocument, TITRE_MAX, documentEnTexte, imprimer, nomFichier, pageImpression, telecharger, telechargerOctets } from './export'
import { LARGEUR_DOCUMENT, LARGEUR_DOCUMENT_CARTE, compterMots, premiersBlocs, demanderRenommer, doitEtreTitre, ecouterRenommer, prendreTampon, titreAffiche } from './texte'
import { t, tn } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'
import { Icone } from '../../icones'
import { fermerMenus, useMenu } from '../../menuUnique'

/**
 * Le texte tel que le moteur de blocs le dessine, en lecture seule. Un bloc qu'une version plus récente a
 * écrit se dessine réduit à son texte (docs/NOTION.md § 1).
 */
const Lu = memo(function Lu({ texte, fils }: { texte: NoeudTexte; fils?: Fils | undefined }) {
  // Un passage dont le fil n'a aucun message (marqué, rien écrit) ne se souligne pas.
  const rendu = useMemo(() => renderToReactElement({ content: sansPassagesMuets(degrader(texte, SCHEMA), fils), extensions: EXTENSIONS_BLOCS }), [texte, fils])
  return <div className="notak-texte notak-blocs">{rendu}</div>
})

/**
 * La feuille de papier de la carte : 72 px, le coin plié, un pictogramme de texte en bas. Choisie, c'est elle qui est
 * cernée de 2 px (le contour suit la silhouette de la feuille), non la carte entière avec son titre.
 */
function Papier({ choisie, taille = 72 }: { choisie?: boolean; taille?: number }) {
  return (
    <svg className="notak-document-papier" viewBox="-2 -2 76 76" width={taille * (76 / 72)} height={taille * (76 / 72)} aria-hidden="true">
      <path d="M12 2h35l15 15v50a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z" fill="var(--notak-carte, #fff)" stroke="rgb(0 0 0 / 0.14)" />
      <path d="M47 2v12a3 3 0 0 0 3 3h12z" fill="rgb(0 0 0 / 0.1)" />
      <g stroke="rgb(0 0 0 / 0.35)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M20 48h32M20 55h32M20 62h20" />
      </g>
      {choisie && <path className="notak-document-papier-choix" d="M12 2h35l15 15v50a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z" fill="none" />}
    </svg>
  )
}

/**
 * Le titre qu'on écrit sur la carte : tout est choisi d'avance ; Entrée ou un appui ailleurs le valide (un titre
 * vidé n'est pas gardé), Échap le laisse. Entrée désélectionne ensuite le document.
 */
function TitreSurCarte({ titre, valider, fini }: { titre: string; valider(titre: string): void; fini(entree: boolean): void }) {
  const champ = useRef<HTMLInputElement>(null)
  const annule = useRef(false)
  const entree = useRef(false)
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
      maxLength={TITRE_MAX}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          entree.current = true
          champ.current?.blur()
        } else if (e.key === 'Escape') {
          annule.current = true
          champ.current?.blur()
        }
      }}
      onBlur={(e) => {
        if (!annule.current && e.target.value.trim() && e.target.value !== titre) valider(e.target.value)
        fini(entree.current)
      }}
    />
  )
}

export function RenduDocument({ element, choisie, enEdition, contexte, brouillon, changer }: PropsRendu<DocumentTexte>) {
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
  // Entrée sur le document choisi, ou « Renommer » : le titre s'édite sur la carte.
  useEffect(() => (lectureSeule ? undefined : ecouterRenommer(element.id, () => setTitreSurCarte(true))), [element.id, lectureSeule])
  const mots = useMemo(() => compterMots(c.texte), [c.texte])
  // Un texte qu'une version plus récente a écrit ne s'édite pas ici : l'éditeur le viderait (docs/NOTION.md § 1).
  const editable = useMemo(() => lisible(c.texte, SCHEMA), [c.texte])
  const nom = (
    <>
      {titreSurCarte ? (
        <TitreSurCarte
          titre={c.titre}
          valider={(titre) => changer({ ...c, titre: titre.trim() })}
          fini={(entree) => {
            setTitreSurCarte(false)
            if (entree) contexte.choisir([])
          }}
        />
      ) : (
        <div className="notak-document-titre">{titreAffiche(c.titre) || t('document.nouveau')}</div>
      )}
      <div className="notak-document-mots">{tn('document.mots', mots)}</div>
    </>
  )
  return (
    <div
      className="notak-document"
      data-carte={c.carte || undefined}
      data-choisie={choisie || undefined}
      data-colonne={element.parent ? '' : undefined}
      onDoubleClick={lectureSeule ? () => setEnLecture(true) : undefined}
    >
      {c.carte ? (
        <>
          <div className="notak-document-apercu">
            {mots === 0 ? (
              <div className="notak-document-apercu-vide">
                <Papier taille={48} />
                <p>{t('document.ecrire')}</p>
              </div>
            ) : (
              <Lu texte={premiersBlocsApercu(c.texte)} />
            )}
          </div>
          <div className="notak-document-pied">
            <Papier taille={32} />
            <div className="notak-document-nom">{nom}</div>
          </div>
          {c.avecLegende && (
            <LegendeLocale
              classe="notak-document-legende"
              texte={c.legende ?? ''}
              choisie={choisie}
              modifiable={!lectureSeule}
              valider={(texte) => changer(avecTexteLegende(c, texte))}
            />
          )}
        </>
      ) : (
        <>
          <Papier choisie={choisie} />
          {nom}
        </>
      )}
      {enEdition &&
        (editable ? (
          <Grand contenu={c} ecrire={brouillon} finir={contexte.finirEdition} contexte={contexte} />
        ) : (
          <Lecture contenu={c} fermer={contexte.finirEdition} plusRecent />
        ))}
      {enLecture && <Lecture contenu={c} fermer={() => setEnLecture(false)} />}
    </div>
  )
}

/** L'aperçu d'une carte ne dessine que le début du texte : le reste est caché de toute façon. */
const premiersBlocsApercu = (doc: NoeudTexte): NoeudTexte => premiersBlocs(doc)

/**
 * « Export ▾ » : un panneau de 20 rem avec sa flèche, son titre et quatre lignes à pictogramme : le PDF (l'impression
 * du navigateur), Word, Markdown et le texte brut.
 */
function MenuExport({ titre, lireTexte }: { titre: string; lireTexte(): NoeudTexte }) {
  const [ouvert, setOuvert, ancre] = useMenu()
  const fichier = (format: FormatDocument) => {
    const texte = documentEnTexte(titre, lireTexte(), format)
    telecharger(nomFichier(titre, format), texte, format === 'md' ? 'text/markdown' : 'text/plain')
    setOuvert(false)
  }
  const word = () => {
    telechargerOctets(nomFichier(titre, 'docx'), documentEnDocx(titre, lireTexte()), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    setOuvert(false)
  }
  const pdf = () => {
    const corps = renderToStaticMarkup(renderToReactElement({ content: degrader(lireTexte(), SCHEMA), extensions: EXTENSIONS_BLOCS }))
    imprimer(pageImpression(titre.trim() || t('commun.sansTitre'), corps))
    setOuvert(false)
  }
  const lignes: { icone: 'fichierPdf' | 'fichierTexte' | 'fichier'; libelle: string; faire(): void }[] = [
    { icone: 'fichierPdf', libelle: t('document.exportPdf'), faire: pdf },
    { icone: 'fichier', libelle: t('document.exportWord'), faire: word },
    { icone: 'fichierTexte', libelle: t('document.exportMarkdown'), faire: () => fichier('md') },
    { icone: 'fichierTexte', libelle: t('document.exportTexte'), faire: () => fichier('txt') },
  ]
  return (
    <div className="notak-note-menu-ancre notak-document-export" ref={ancre}>
      <button type="button" className="notak-document-export-bouton" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {t('document.exporter')} <Icone nom="chevronBas" taille={14} />
      </button>
      {ouvert && (
        <div className="notak-note-menu notak-document-export-menu" role="menu">
          <div className="notak-document-export-titre">{t('document.exportTitre')}</div>
          {lignes.map((l) => (
            <button key={l.libelle} type="button" role="menuitem" className="notak-note-menu-ligne" onClick={l.faire}>
              <Icone nom={l.icone} taille={20} />
              {l.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface PropsModale {
  /** Ouvert pour lire seulement : la colonne d'outils se réduit à 35 px et le texte remonte de 9 px. */
  lecture?: boolean
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
function Modale({ titre, titreTexte, lireTexte, outils, fermer, children, lecture }: PropsModale) {
  return (
    <Surcouche
      etiquette={t('type.document')}
      className="notak-document-fond"
      fermer={fermer}
      surTouche={(e) => {
        // Échap ferme d'abord la liste de `[[` ou de `@`, sans quitter le document.
        if (e.key === 'Escape' && document.querySelector('.notak-propositions')) return true
        // Échap referme d'abord le menu ouvert, sans quitter le document.
        if (e.key !== 'Escape' || !(e.currentTarget as HTMLElement).querySelector('[aria-expanded="true"]')) return false
        e.preventDefault()
        fermerMenus()
        return true
      }}
    >
      <div className="notak-document-boite" data-marge-ancre data-lecture={lecture || undefined}>
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

/** Le document à lire seulement. `plusRecent` : il porte des blocs qu'une version plus récente de Notak sait écrire. */
function Lecture({ contenu, fermer, plusRecent }: { contenu: DocumentTexte; fermer(): void; plusRecent?: boolean }) {
  const titre = contenu.titre.trim() || t('commun.sansTitre')
  return (
    <Modale lecture titre={<span className="notak-document-titre-lu">{titre}</span>} titreTexte={contenu.titre} lireTexte={() => contenu.texte} fermer={fermer}>
      {plusRecent && (
        <p className="notak-document-plus-recent" role="status">
          {t('document.plusRecent')}
        </p>
      )}
      <Lu texte={contenu.texte} fils={contenu.fils} />
    </Modale>
  )
}

/**
 * Le document ouvert en grand. Ce qu'on tape part au brouillon (le titre en haut comme le texte) ; le curseur
 * est dans le texte dès l'ouverture.
 */
function Grand({ contenu, ecrire, finir, contexte }: { contenu: DocumentTexte; ecrire(c: DocumentTexte): void; finir(): void; contexte: ContexteToile }) {
  const [titre, setTitre] = useState(contenu.titre)
  const [lien, setLien] = useState<string | null>(null)
  // Le titre, le texte et les fils des passages changent chacun de leur côté : le brouillon porte toujours les derniers.
  const dernier = useRef<{ titre: string; texte: NoeudTexte; fils: Fils | undefined }>({ titre: contenu.titre, texte: contenu.texte, fils: contenu.fils })
  const [filsVus, setFilsVus] = useState<Fils | undefined>(contenu.fils)
  const [ouvert, setOuvert] = useState<Id | null>(null)
  const poser = (suite: Partial<typeof dernier.current>) => {
    dernier.current = { ...dernier.current, ...suite }
    setFilsVus(dernier.current.fils)
    const { fils: _, ...reste } = contenu
    ecrire({ ...reste, titre: dernier.current.titre, texte: dernier.current.texte, ...(dernier.current.fils ? { fils: dernier.current.fils } : {}) })
  }
  const commenterRef = useRef<() => void>(() => {})
  // `[[` propose les tableaux, `@` les personnes : la même liste que la note.
  const pont = useRef<Pont | null>(null)
  const extensions = useMemo(() => [...EXTENSIONS_BLOCS, extensionPropositions(pont)], [])
  const editeur = useEditor({
    extensions,
    content: contenu.texte,
    editorProps: {
      attributes: { class: 'notak-texte notak-blocs', 'aria-label': t('document.texte') },
      // ⌘⌥M : commenter le passage choisi, comme dans une note.
      handleKeyDown: (_, e) => {
        if (!(e.metaKey || e.ctrlKey) || !e.altKey || e.code !== 'KeyM') return false
        e.preventDefault()
        commenterRef.current()
        return true
      },
    },
    onUpdate: ({ editor, transaction }) => {
      // Les ids posés à l'ouverture ne sont pas une écriture : ils partiront avec la prochaine.
      if (transaction.getMeta(CLE_IDS)) return
      const texte = editor.getJSON() as NoeudTexte
      poser({ texte, fils: filsVivants(dernier.current.fils, texte) })
    },
  })
  const peutCommenter = !contexte.services.lectureSeule
  // Dans un passage déjà commenté : on ouvre son fil. Sinon, le passage choisi reçoit un fil neuf.
  commenterRef.current = () => {
    if (!editeur || !peutCommenter) return
    const present = editeur.isActive(MARQUE_FIL) ? (editeur.getAttributes(MARQUE_FIL).fil as Id | null) : null
    if (present) return setOuvert(present)
    if (editeur.state.selection.empty || editeur.isActive('code') || editeur.isActive('codeBlock')) return
    const id = nouvelId()
    editeur.chain().focus().setMark(MARQUE_FIL, { fil: id }).run()
    poser({ texte: editeur.getJSON() as NoeudTexte, fils: avecFil(dernier.current.fils, id, { type: 'commentaire', messages: [] }) })
    setOuvert(id)
  }
  useEffect(() => {
    if (!editeur || editeur.isDestroyed) return
    editeur.commands.focus('end')
    // Le caractère tapé sur la carte choisie ouvre le document et s'y écrit.
    const frappe = prendreTampon()
    if (frappe) editeur.commands.insertContent(frappe)
  }, [editeur])

  return (
    <Modale
      titre={
        <input
          className="notak-document-grand-titre"
          type="text"
          aria-label={t('document.titre')}
          placeholder={t('document.nouveau')}
          maxLength={TITRE_MAX}
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
      outils={editeur && <ColonneOutils editor={editeur} lien={lien} surLien={setLien} {...(peutCommenter ? { commenter: () => commenterRef.current() } : {})} />}
      fermer={finir}
    >
      {editeur && (
        <Marge
          editeur={editeur}
          fils={filsVus}
          ouvert={ouvert}
          surOuvert={setOuvert}
          ecrire={(id: Id, fil: Commentaire) =>
            poser({ texte: editeur.getJSON() as NoeudTexte, fils: avecFil(dernier.current.fils, id, fil) })
          }
          contexte={contexte}
        />
      )}
      {editeur && <Propositions editeur={editeur} contexte={contexte} pont={pont} />}
      <EditorContent editor={editeur} />
    </Modale>
  )
}

/** Vue carte (icône ou carte détaillée), puis Renommer (un seul document). */
export function OutilsDocument({ elements, contexte }: PropsOutils<DocumentTexte>) {
  if (contexte.services.lectureSeule) return null
  const tous = elements.every((e) => e.contenu.carte)
  const basculer = () =>
    contexte.magasin.faire(
      elements.flatMap((e) => {
        const carte = !tous
        const vers = carte ? LARGEUR_DOCUMENT_CARTE : LARGEUR_DOCUMENT
        const { carte: _, ...reste } = e.contenu
        return [
          { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: carte ? { ...reste, carte: true } : reste },
          ...(e.largeur !== vers ? [{ type: 'redimensionner' as const, id: e.id, de: e.largeur, vers }] : []),
        ]
      }),
    )
  return (
    <>
      <BoutonOutil icone="vueCarte" actif={tous} titre={t('document.vueCarte')} libelle={t('document.vueCarte')} onClick={basculer} />
      {tous && <OutilLegende elements={elements} contexte={contexte} />}
      {elements.length === 1 && <BoutonOutil icone="renommer" titre={t('menu.renommer')} libelle={t('menu.renommer')} onClick={() => demanderRenommer(elements[0]!.id)} />}
    </>
  )
}
