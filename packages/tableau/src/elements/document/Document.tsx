import { type Editor, EditorContent, getSchema, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { type ReactNode, type RefObject, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { type Commentaire, type DocumentTexte, type Id, type NoeudTexte, type PageDocument, nouvelId } from '../../coeur/tableau'
import { type Fils, MARQUE_FIL, avecFil, filsVivants, sansPassagesMuets } from '../note/fils'
import { Marge } from '../note/Marge'
import { type Pont, Propositions, extensionPropositions } from '../note/Propositions'
import { Surcouche } from '../surcouche'
import { BoutonIlot, FilEcran, ILOTS_APPLICATION, Ilot, IlotCompte, IlotHistorique, IlotPartage, fermerMenuDesIlots } from '../../Ilots'
import { CLE_IDS } from '../../blocs/ids'
import { degrader, lisible } from '../../blocs/lisible'
import { aplatir, deplier } from '../../blocs/migration'
import { annoterPage } from '../../blocs/structure'
import { EXTENSIONS_NOTE } from '../note/extensions'
import { Bulle } from '../../blocs/Bulle'
import type { Couleur } from '../../blocs/catalogue'
import { Invite } from '../../blocs/invite'
import { derniereCouleur } from '../../blocs/menuCouleurs'
import { type Demande, MenuBlocs, type PontMenu, extensionSlash } from '../../blocs/Menu'
import { Largeurs } from '../../blocs/Largeurs'
import { LienSurvol } from '../../blocs/LienSurvol'
import { Poignee } from '../../blocs/Poignee'
import { Sommaire } from '../../blocs/Sommaire'
import { CLE_CHOIX, choisir } from '../../blocs/selection'
import { blocDe } from '../../blocs/modele'
import { ApercuLien, ImageBloc, remplirImages } from '../../blocs/noeuds'
import { type GestesBlocs, raccourcisBlocs } from '../../blocs/saisie'
import { EXTENSIONS_BLOCS, EXTENSIONS_BLOCS_PARTAGEE, SCHEMA_BLOCS as SCHEMA } from '../../blocs/schema'
import { colorer, ecrireALaFin, insererImage } from '../../blocs/transformer'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { BLOCS_SANS_TEXTE, blocSansTexteChoisi, filDuBlocChoisi } from '../../blocs/commentaires'
import { LegendeLocale, OutilLegende, avecTexteLegende } from '../LegendeLocale'
import type { ContexteToile, DepotFichiers, PropsOutils, PropsRendu } from '../types'
import { EntetePage, OptionsPage, attributsPage, pageDe } from './Page'
import { extensionsDuPartage, textePartage } from '../partage'
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
const Lu = memo(function Lu({ texte, fils, adresse }: { texte: NoeudTexte; fils?: Fils | undefined; adresse?: Adresse | undefined }) {
  // Un passage dont le fil n'a aucun message (marqué, rien écrit) ne se souligne pas.
  const rendu = useMemo(() => renderToReactElement({ content: sansPassagesMuets(degrader(aplatir(texte), SCHEMA), fils), extensions: EXTENSIONS_BLOCS }), [texte, fils])
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!racine.current) return
    // Les numéros, les blocs qu'un dépliant fermé cache, le cadre des encadrés : ce que l'éditeur pose en décorations.
    annoterPage(racine.current)
    if (adresse) remplirImages(racine.current, adresse)
  }, [rendu, adresse])
  return (
    <div className="notak-texte notak-blocs" ref={racine}>
      {rendu}
    </div>
  )
})

/** Le schéma de la note, pour imprimer l'écriture imbriquée. */
const SCHEMA_NOTE = getSchema(EXTENSIONS_NOTE)

/** L'adresse affichable d'un fichier du tableau. */
type Adresse = (fichier: string) => Promise<string | null>

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
  const fichiers = contexte.services.fichiers
  // L'icône de la page se voit sur la carte, posée sur la feuille (NOTION.md § 9).
  const icone = pageDe(c.page).icone
  const adresse = useMemo(() => (fichiers ? (id: string) => fichiers.adresse(id) : undefined), [fichiers])
  // Un texte qu'une version plus récente a écrit ne s'édite pas ici : l'éditeur le viderait (docs/NOTION.md § 1).
  const editable = useMemo(() => lisible(aplatir(c.texte), SCHEMA), [c.texte])
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
              <Lu texte={premiersBlocsApercu(c.texte)} adresse={adresse} />
            )}
          </div>
          <div className="notak-document-pied">
            <Papier taille={32} />
            {icone && <span className="notak-document-icone" data-petite="" aria-hidden>{icone}</span>}
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
          {icone && <span className="notak-document-icone" aria-hidden>{icone}</span>}
          {nom}
        </>
      )}
      {enEdition &&
        (editable ? (
          <Grand id={element.id} contenu={c} ecrire={brouillon} finir={contexte.finirEdition} contexte={contexte} />
        ) : (
          <Lecture contenu={c} fermer={contexte.finirEdition} adresse={adresse} fichiers={fichiers} plusRecent />
        ))}
      {enLecture && <Lecture contenu={c} fermer={() => setEnLecture(false)} adresse={adresse} fichiers={fichiers} />}
    </div>
  )
}

/** L'aperçu d'une carte ne dessine que le début du texte : le reste est caché de toute façon. */
const premiersBlocsApercu = (doc: NoeudTexte): NoeudTexte => premiersBlocs(aplatir(doc))

/**
 * « Export ▾ » : un panneau de 20 rem avec sa flèche, son titre et quatre lignes à pictogramme : le PDF (l'impression
 * du navigateur), Word, Markdown et le texte brut.
 */
function MenuExport({ titre, lireTexte }: { titre: string; lireTexte(): NoeudTexte }) {
  const [ouvert, setOuvert, ancre] = useMenu()
  const fichier = (format: FormatDocument) => {
    const texte = documentEnTexte(titre, deplier(aplatir(lireTexte())), format)
    telecharger(nomFichier(titre, format), texte, format === 'md' ? 'text/markdown' : 'text/plain')
    setOuvert(false)
  }
  const word = () => {
    telechargerOctets(nomFichier(titre, 'docx'), documentEnDocx(titre, deplier(aplatir(lireTexte()))), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    setOuvert(false)
  }
  const pdf = () => {
    // L'impression lit l'écriture imbriquée : les listes s'y numérotent seules.
    const corps = renderToStaticMarkup(renderToReactElement({ content: degrader(deplier(aplatir(lireTexte())), SCHEMA_NOTE), extensions: EXTENSIONS_NOTE }))
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
      <button type="button" className="notak-document-export-bouton" aria-label={t('document.exporter')} title={t('document.exporter')} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        <Icone nom="exporter" taille={20} trait={1.5} />
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
  /** Ouvert pour lire seulement. */
  lecture?: boolean
  /** Le titre en petit, dans la barre du haut. */
  titre: ReactNode
  lireTexte(): NoeudTexte
  titreTexte: string
  fermer(): void
  /** Un appui sous le dernier bloc : on écrit à la fin de la page. */
  finDePage?(e: React.MouseEvent): void
  children: ReactNode
  /** La zone du texte, qui défile : la poignée des blocs s'y place. */
  corps?: RefObject<HTMLDivElement | null>
  /** L'habillage de la page (police, petit texte, pleine largeur), et le menu qui le règle. */
  page?: PageDocument
  options?: ReactNode
  /** L'éditeur du document en édition : le sommaire en lit les titres (en lecture, il les lit dans le rendu). */
  editeur?: Editor | null
}

/**
 * Le document en grand, comme une page de Notion (docs/NOTION.md § 9) : toute la fenêtre, la barre d'îlots du tableau
 * et de la carte en haut (Ilots.tsx : le retour, le fil ; l'historique, le partage, puis les options, l'export et le
 * compte), puis la page qui défile. Échap referme aussi.
 */
function Modale({ titre, titreTexte, lireTexte, fermer, children, lecture, corps, page, options, finDePage, editeur }: PropsModale) {
  return (
    <Surcouche
      etiquette={t('type.document')}
      className="notak-document-fond"
      fermer={fermer}
      surTouche={(e) => {
        // Échap ferme d'abord la liste de `[[` ou de `@`, sans quitter le document.
        if (e.key === 'Escape' && document.querySelector('.notak-propositions, .notak-menu-blocs')) return true
        // Échap que l'éditeur a pris (il a choisi le bloc du curseur, NOTION.md § 7) ne ferme pas le document.
        if (e.key === 'Escape' && e.defaultPrevented) return true
        // Échap ferme d'abord le menu ouvert dans un îlot de l'application (partage, compte), et ses touches restent les siennes.
        if (e.key === 'Escape' && fermerMenuDesIlots(e.currentTarget as HTMLElement)) return true
        if (e.key !== 'Escape' && (e.target as Element).closest?.(ILOTS_APPLICATION)) return true
        // Échap referme d'abord le menu ouvert, sans quitter le document.
        if (e.key !== 'Escape' || !(e.currentTarget as HTMLElement).querySelector('[aria-expanded="true"]')) return false
        e.preventDefault()
        fermerMenus()
        return true
      }}
    >
      <div className="notak-document-boite" data-lecture={lecture || undefined} {...attributsPage(page ?? {})}>
        <header className="notak-document-entete" data-tauri-drag-region="deep">
          <Ilot>
            <BoutonIlot icone="gauche" className="notak-document-fermer" libelle={t('espace.retourTableau')} onClick={fermer} />
          </Ilot>
          <FilEcran titre={titre} fermer={fermer} />
          <div className="notak-document-entete-droite">
            {!lecture && editeur && <IlotHistorique annuler={() => editeur.chain().focus().undo().run()} retablir={() => editeur.chain().focus().redo().run()} />}
            <IlotPartage />
            <IlotCompte>
              {options}
              <MenuExport titre={titreTexte} lireTexte={lireTexte} />
            </IlotCompte>
          </div>
        </header>
        <div className="notak-document-corps" ref={corps}>
          {/* La page est l'ancre des fils de commentaires : ils vivent dans sa marge droite (voir `document.css`). */}
          <div className="notak-page" data-marge-ancre>
            {children}
            <div className="notak-page-fin" onMouseDown={finDePage} />
          </div>
          <Sommaire editeur={editeur} lecture={lecture} />
        </div>
      </div>
    </Surcouche>
  )
}

/** Le titre en petit dans la barre du haut : l'icône de la page, puis son titre (ou « Sans titre », pâle). */
function FilDuTitre({ icone, titre }: { icone?: string | undefined; titre: string }) {
  return (
    <>
      {icone && <span aria-hidden>{icone}</span>}
      <span {...(titre.trim() ? {} : { 'data-vide': '' })}>{titre.trim() || t('commun.sansTitre')}</span>
    </>
  )
}

/** Le titre de la page : 40 px, il passe à la ligne ; Entrée descend dans le texte. */
function TitrePage({ valeur, changer, entree }: { valeur: string; changer(v: string): void; entree(): void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${el.scrollHeight}px`
  }, [valeur])
  return (
    <textarea
      ref={ref}
      className="notak-page-titre"
      rows={1}
      aria-label={t('document.titre')}
      placeholder={t('document.nouveau')}
      maxLength={TITRE_MAX}
      spellCheck={false}
      value={valeur}
      onChange={(e) => changer(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          entree()
        }
      }}
    />
  )
}

/** Le document à lire seulement. `plusRecent` : il porte des blocs qu'une version plus récente de Notak sait écrire. */
function Lecture({ contenu, fermer, plusRecent, adresse, fichiers }: { contenu: DocumentTexte; fermer(): void; plusRecent?: boolean; adresse?: Adresse | undefined; fichiers?: DepotFichiers | undefined }) {
  const titre = contenu.titre.trim() || t('commun.sansTitre')
  const page = pageDe(contenu.page)
  return (
    <Modale lecture titre={<FilDuTitre icone={page.icone} titre={contenu.titre} />} titreTexte={contenu.titre} lireTexte={() => contenu.texte} fermer={fermer} page={page}>
      <EntetePage page={page} changer={() => {}} fichiers={fichiers} lectureSeule>
        <h1 className="notak-page-titre notak-document-titre-lu">{titre}</h1>
      </EntetePage>
      {plusRecent && (
        <p className="notak-document-plus-recent" role="status">
          {t('document.plusRecent')}
        </p>
      )}
      <Lu texte={contenu.texte} fils={contenu.fils} adresse={adresse} />
    </Modale>
  )
}

/**
 * Le document ouvert en grand. Ce qu'on tape part au brouillon (le titre en haut comme le texte) ; le curseur
 * est dans le texte dès l'ouverture.
 */
function Grand({ id, contenu, ecrire, finir, contexte }: { id: Id; contenu: DocumentTexte; ecrire(c: DocumentTexte): void; finir(): void; contexte: ContexteToile }) {
  const [titre, setTitre] = useState(contenu.titre)
  // Le titre, le texte et les fils des passages changent chacun de leur côté : le brouillon porte toujours les derniers.
  // Un document d'avant les blocs à plat (ou une note convertie) s'ouvre aplati (NOTION.md § 1).
  const initial = useMemo(() => aplatir(contenu.texte), [])
  const dernier = useRef<{ titre: string; texte: NoeudTexte; fils: Fils | undefined; page: PageDocument }>({
    titre: contenu.titre,
    texte: initial,
    fils: contenu.fils,
    page: pageDe(contenu.page),
  })
  const [page, setPage] = useState(dernier.current.page)
  const [filsVus, setFilsVus] = useState<Fils | undefined>(contenu.fils)
  const [ouvert, setOuvert] = useState<Id | null>(null)
  const poser = (suite: Partial<typeof dernier.current>) => {
    dernier.current = { ...dernier.current, ...suite }
    setFilsVus(dernier.current.fils)
    const { fils: _, ...reste } = contenu
    const { page: _p, ...sansPage } = reste
    const p = dernier.current.page
    ecrire({
      ...sansPage,
      titre: dernier.current.titre,
      texte: dernier.current.texte,
      ...(dernier.current.fils ? { fils: dernier.current.fils } : {}),
      ...(Object.keys(p).length ? { page: p } : {}),
    })
  }
  const commenterRef = useRef<() => void>(() => {})
  // `[[` propose les tableaux, `@` les personnes : la même liste que la note.
  const pont = useRef<Pont | null>(null)
  // `/` ouvre le menu des blocs ; ⌘/ et la bulle, « Transformer en » (docs/NOTION.md § 3).
  const pontMenu = useRef<PontMenu | null>(null)
  const [demande, setDemande] = useState<Demande | null>(null)
  const demander = (mode: Demande['mode']) => setDemande((d) => ({ mode, n: (d?.n ?? 0) + 1 }))
  const corps = useRef<HTMLDivElement>(null)
  // La dernière couleur employée (⌘⇧H), gardée d'une ouverture à l'autre.
  const [derniere, setDerniere] = useState<Couleur | null>(() => derniereCouleur())
  const gestes = useRef<GestesBlocs>({ transformerEn: () => {}, derniereCouleur: () => {} })
  const fichiers = contexte.services.fichiers
  const chercherApercu = contexte.services.apercu
  // À plusieurs, le texte vit dans le fragment Yjs du document ; lu une fois, à l'entrée en édition (NOTION.md § 9).
  const fragment = useMemo(() => textePartage(contexte, id, initial, SCHEMA), [])
  const extensions = useMemo(
    () => [
      ...(fragment ? [...EXTENSIONS_BLOCS_PARTAGEE, ...extensionsDuPartage(fragment, contexte)] : EXTENSIONS_BLOCS).map((x) => (x.name === 'image' && fichiers ? ImageBloc.configure({ adresse: (id) => fichiers.adresse(id) }) : x.name === 'apercuLien' && chercherApercu ? ApercuLien.configure({ chercher: chercherApercu }) : x)),
      Invite,
      extensionPropositions(pont),
      extensionSlash(pontMenu),
      raccourcisBlocs(gestes),
    ],
    [fichiers, chercherApercu, fragment],
  )
  const editeur = useEditor({
    extensions,
    ...(fragment ? {} : { content: initial }),
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
    const present = editeur.isActive(MARQUE_FIL) ? (editeur.getAttributes(MARQUE_FIL).fil as Id | null) : filDuBlocChoisi(editeur.state)
    if (present) return setOuvert(present)
    // Un bloc sans texte (image, séparateur, aperçu) porte son fil ; un passage, même de code, reçoit la marque.
    const bloc = blocSansTexteChoisi(editeur.state)
    if (!bloc && editeur.state.selection.empty) return
    const id = nouvelId()
    if (bloc) editeur.view.dispatch(editeur.state.tr.setNodeAttribute(bloc.pos, 'fil', id))
    else editeur.chain().focus().setMark(MARQUE_FIL, { fil: id }).run()
    poser({ texte: editeur.getJSON() as NoeudTexte, fils: avecFil(dernier.current.fils, id, { type: 'commentaire', messages: [] }) })
    setOuvert(id)
  }
  gestes.current = {
    transformerEn: () => demander('transformer'),
    derniereCouleur: () => {
      if (editeur && derniere) colorer(editeur, derniere)
    },
  }
  // L'image du menu « / » : un fichier choisi sur l'appareil, rangé avec ceux du tableau.
  const choisirImage = fichiers
    ? () => {
        const champ = document.createElement('input')
        champ.type = 'file'
        champ.accept = 'image/*'
        champ.onchange = async () => {
          const fichier = champ.files?.[0]
          if (!fichier || !editeur) return
          insererImage(editeur, await fichiers.enregistrer(fichier))
        }
        champ.click()
      }
    : undefined
  // « Copier le lien du bloc » : l'adresse du document ouvert, l'id du bloc en ancre (NOTION.md § 6).
  const copierLien = (id: string) => {
    void navigator.clipboard?.writeText(`${location.origin}${location.pathname}#${id}`)
  }
  // « Commenter » sur un bloc : son texte est choisi, puis commenté comme un passage.
  const commenterBloc = (id: string) => {
    if (!editeur) return
    const b = blocDe(editeur.state.doc, id)
    if (!b) return
    const { doc } = editeur.state
    const noeud = doc.nodeAt(b.pos)
    // Un bloc sans texte est choisi tout entier : son fil sera son attribut.
    const choix = noeud && BLOCS_SANS_TEXTE.has(noeud.type.name) ? NodeSelection.create(doc, b.pos) : TextSelection.between(doc.resolve(b.pos), doc.resolve(b.pos + b.taille))
    editeur.view.dispatch(editeur.state.tr.setMeta(CLE_CHOIX, null).setSelection(choix))
    commenterRef.current()
  }
  // La barre d'une image demande ce qui n'est pas à elle : commenter le bloc, ouvrir son menu (« ••• »).
  const gestesImage = useRef({ commenter: (_id: string) => {}, menu: (_id: string) => {} })
  gestesImage.current = {
    commenter: (id) => peutCommenter && commenterBloc(id),
    menu: (id) => {
      if (!editeur) return
      editeur.view.dispatch(choisir(editeur.state, { ancre: id, tete: id }))
      demander('bloc')
    },
  }
  useEffect(() => {
    if (!editeur || editeur.isDestroyed) return
    const dom = editeur.view.dom
    const id = (e: Event) => String((e as CustomEvent<{ id: string }>).detail?.id ?? '')
    const commenter = (e: Event) => gestesImage.current.commenter(id(e))
    const menu = (e: Event) => gestesImage.current.menu(id(e))
    dom.addEventListener('notak-commenter-bloc', commenter)
    dom.addEventListener('notak-menu-bloc', menu)
    return () => {
      dom.removeEventListener('notak-commenter-bloc', commenter)
      dom.removeEventListener('notak-menu-bloc', menu)
    }
  }, [editeur])
  // Une adresse qui nomme un bloc l'amène à l'écran et le fait clignoter.
  useEffect(() => {
    if (!editeur || editeur.isDestroyed) return
    const id = decodeURIComponent(location.hash.slice(1))
    if (!id) return
    const el = editeur.view.dom.querySelector<HTMLElement>(`[data-bloc="${CSS.escape(id)}"]`)
    if (!el) return
    el.scrollIntoView?.({ block: 'center' })
    el.classList.add('notak-bloc-signale')
    const fin = setTimeout(() => el.classList.remove('notak-bloc-signale'), 1600)
    return () => clearTimeout(fin)
  }, [editeur])
  useEffect(() => {
    if (!editeur || editeur.isDestroyed) return
    editeur.commands.focus('end')
    // Le caractère tapé sur la carte choisie ouvre le document et s'y écrit.
    const frappe = prendreTampon()
    if (frappe) editeur.commands.insertContent(frappe)
  }, [editeur])

  return (
    <Modale
      titre={<FilDuTitre icone={page.icone} titre={titre} />}
      titreTexte={titre}
      lireTexte={() => (editeur ? (editeur.getJSON() as NoeudTexte) : dernier.current.texte)}
      fermer={finir}
      finDePage={(e) => {
        e.preventDefault()
        if (editeur) ecrireALaFin(editeur)
      }}
      corps={corps}
      page={page}
      editeur={editeur}
      options={
        <OptionsPage
          page={page}
          changer={(p) => {
            setPage(p)
            poser({ page: p })
          }}
        />
      }
    >
      <EntetePage
        page={page}
        changer={(p) => {
          setPage(p)
          poser({ page: p })
        }}
        fichiers={fichiers}
      >
        <TitrePage
          valeur={titre}
          changer={(v) => {
            setTitre(v)
            poser({ titre: v })
          }}
          entree={() => editeur?.commands.focus('start')}
        />
      </EntetePage>
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
          enPage
        />
      )}
      {editeur && <Propositions editeur={editeur} contexte={contexte} pont={pont} />}
      {editeur && (
        <MenuBlocs
          editeur={editeur}
          pont={pontMenu}
          demande={demande}
          surCouleur={setDerniere}
          copierLien={copierLien}
          {...(peutCommenter ? { commenterBloc } : {})}
          {...(choisirImage ? { choisirImage } : {})}
        />
      )}
      {editeur && <Poignee editeur={editeur} zone={corps} ouvrirMenu={() => demander('bloc')} />}
      {editeur && <Largeurs editeur={editeur} zone={corps} />}
      {editeur && <LienSurvol editeur={editeur} />}
      {editeur && (
        <Bulle
          editeur={editeur}
          menuBloc={() => demander('bloc')}
          {...(peutCommenter ? { commenter: () => commenterRef.current() } : {})}
          derniere={derniere}
          surCouleur={setDerniere}
        />
      )}
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
