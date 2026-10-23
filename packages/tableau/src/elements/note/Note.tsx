import { type Editor, EditorContent, getSchema, useEditor } from '@tiptap/react'
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Commentaire, type Id, type Note, type NoeudTexte, nouvelId } from '../../coeur/tableau'
import { extensionsDuPartage, textePartage } from '../partage'
import type { PropsRendu } from '../types'
import { ContexteBarreEdition } from '../../barreEdition'
import { BarreTexte } from './Barre'
import { OutilsTexteGauche } from './OutilsTexte'
import { FilOuvert, Marge } from './Marge'
import { MARQUE_FIL, type Fils, avecFil, filsVivants, sansPassagesMuets } from './fils'
import { type Pont, Propositions, extensionPropositions } from './Propositions'
import { adresseSeule, adressesEnLiens, caseSeule, couleurSeule, docEstVide } from './conversion'
import { docVide } from '../taches/liste'
import { fondDeNote, luminance, texteDuContenu } from './couleurs'
import { EXTENSIONS_NOTE, EXTENSIONS_NOTE_PARTAGEE, type GestesEdition, raccourcisEdition } from './extensions'
import { type ActionsLegende, LegendeEditeur, LegendeFigee } from './LegendeRiche'
import { docLegende, legendeNeuve, legendeVide } from './legende'

export function RenduNote(props: PropsRendu<Note>) {
  const { element, enEdition } = props
  const { contenu } = element
  const texte = texteDuContenu(contenu)
  // Un texte clair (sur un fond foncé) se teinte de blanc : code, citation, filets et texte d'attente le suivent.
  const clair = texte && /^#[0-9a-f]{6}$/i.test(texte) ? luminance(texte) > 0.5 : undefined
  const racine = useRef<HTMLDivElement>(null)
  // Un fond libre ne peut pas se dire en CSS : la carte, que `Cadre` pose, le reçoit d'ici.
  useLayoutEffect(() => {
    const carte = racine.current?.parentElement
    if (!carte || !contenu.fond) return
    carte.style.background = contenu.fond
    carte.style.setProperty('--notak-voile', contenu.fond)
    return () => {
      carte.style.background = ''
      carte.style.removeProperty('--notak-voile')
    }
  }, [contenu.fond])
  // Hors édition, un clic sur un passage commenté ouvre son fil.
  const [filOuvert, setFilOuvert] = useState<Id | null>(null)
  useEffect(() => {
    if (enEdition) setFilOuvert(null)
  }, [enEdition])
  const fermerFil = useCallback(() => setFilOuvert(null), [])
  // Sous un plafond de hauteur, le texte déborde en silence : le bas s'efface (voir `note.css`).
  const [deborde, setDeborde] = useState(false)
  useLayoutEffect(() => {
    const texteDom = racine.current?.querySelector<HTMLElement>(':scope > .notak-texte')
    if (!texteDom) return
    const mesurer = () => setDeborde(texteDom.scrollHeight > texteDom.clientHeight + 1)
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(texteDom)
    return () => obs.disconnect()
  }, [enEdition, contenu.texte])
  return (
    <div
      ref={racine}
      className="notak-note"
      data-couleur={contenu.fond ? undefined : contenu.couleur}
      data-variante={contenu.variante}
      data-barre={contenu.barre ? '' : undefined}
      data-lecture-seule={props.contexte.services.lectureSeule ? '' : undefined}
      data-teinte={fondDeNote(contenu) ? '' : undefined}
      data-ton={clair === undefined ? undefined : clair ? 'clair' : 'sombre'}
      data-deborde={deborde || undefined}
      style={texte ? { color: texte } : undefined}
      // Hors édition, un lien s'ouvre : l'appui ne doit pas lancer un glisser.
      onPointerDown={enEdition ? undefined : (e) => (e.target as HTMLElement).closest('a, [data-tableau], [data-fil]') && e.stopPropagation()}
      // Un tableau cité dans le texte s'ouvre d'un clic ; un passage commenté ouvre son fil.
      onClick={enEdition ? undefined : (e) => {
        const cible = (e.target as HTMLElement).closest<HTMLElement>('[data-tableau]')?.dataset.tableau
        if (cible) props.contexte.services.ouvrirTableau?.(cible)
        const fil = (e.target as HTMLElement).closest<HTMLElement>('[data-fil]')?.dataset.fil
        if (fil) setFilOuvert((avant) => (avant === fil ? null : fil))
      }}
    >
      {contenu.barre && <div className="notak-note-bande" style={{ background: contenu.barre }} aria-hidden />}
      {enEdition ? <Editeur {...props} /> : <TexteFige texte={contenu.texte} fils={contenu.fils} />}
      {filOuvert && !enEdition && racine.current?.parentElement && (
        <FilOuvert
          carte={racine.current.parentElement}
          id={filOuvert}
          fil={contenu.fils?.[filOuvert]}
          ecrire={(f) => props.changer({ ...contenu, fils: avecFil(contenu.fils, filOuvert, f) })}
          fermer={fermerFil}
          contexte={props.contexte}
        />
      )}
      {!enEdition && !legendeVide(contenu.legende) && (
        <div className="notak-note-legende">
          <LegendeFigee doc={docLegende(contenu.legende)!} />
        </div>
      )}
    </div>
  )
}

const TexteFige = memo(function TexteFige({ texte, fils }: { texte: NoeudTexte; fils?: Fils }) {
  // Un passage dont le fil n'a aucun message (marqué, rien écrit) ne se souligne pas.
  const rendu = useMemo(
    () => renderToReactElement({ content: adressesEnLiens(sansPassagesMuets(texte, fils)), extensions: EXTENSIONS_NOTE }),
    [texte, fils],
  )
  return <div className="notak-texte">{rendu}</div>
})

const SCHEMA = getSchema(EXTENSIONS_NOTE)

function Editeur(props: PropsRendu<Note>) {
  const { element, contexte, brouillon } = props
  const { contenu } = element
  const [lien, setLien] = useState<string | null>(null)
  // Avec la barre de gauche, les outils de texte y prennent sa place ; sinon ils flottent au-dessus de la note.
  const { attendue, cible } = useContext(ContexteBarreEdition)
  const gestes = useRef<GestesEdition>(null!)
  // Les fils du texte vivent à côté de lui : la note les garde en brouillon avec le texte.
  const fils = useRef<Fils | undefined>(contenu.fils)
  const [filsVus, setFilsVus] = useState<Fils | undefined>(contenu.fils)
  const [ouvert, setOuvert] = useState<Id | null>(null)
  const ecrire = (texte: NoeudTexte, apres: Fils | undefined) => {
    fils.current = apres
    setFilsVus(apres)
    const { fils: _, ...reste } = courant.current
    poser({ ...reste, texte, ...(apres ? { fils: apres } : {}) })
  }
  const pont = useRef<Pont | null>(null)
  // Le dernier contenu écrit : le texte et la légende s'écrivent chacun de son côté, sans se défaire l'un l'autre.
  const courant = useRef(contenu)
  courant.current = contenu
  const poser = (apres: Note) => {
    courant.current = apres
    brouillon(apres)
  }
  // La légende a son propre éditeur ; la barre de gauche suit celui qui a le focus.
  const [editeurLegende, setEditeurLegende] = useState<Editor | null>(null)
  const [surLegende, setSurLegende] = useState(false)
  const [legendeOuverte, setLegendeOuverte] = useState(contenu.legende !== undefined)
  const actionsLegende = useRef<ActionsLegende | null>(null)
  const pointDepart = useRef<{ x: number; y: number } | null>(null)
  // Lu une fois, à l'entrée en édition : la suite du texte arrive par le fragment.
  const fragment = useMemo(() => textePartage(contexte, element.id, contenu.texte, SCHEMA), [])
  const extensions = useMemo(
    () => [
      ...(fragment ? [...EXTENSIONS_NOTE_PARTAGEE, ...extensionsDuPartage(fragment, contexte)] : EXTENSIONS_NOTE),
      raccourcisEdition(gestes),
      extensionPropositions(pont),
    ],
    [fragment],
  )
  const editeur = useEditor({
    extensions,
    ...(fragment ? {} : { content: contenu.texte }),
    editorProps: { attributes: { class: 'notak-texte' } },
    // Le texte copié sépare les blocs par un seul saut de ligne.
    coreExtensionOptions: { clipboardTextSerializer: { blockSeparator: '\n' } },
    onUpdate: ({ editor }) => {
      const texte = editor.getJSON() as NoeudTexte
      ecrire(texte, filsVivants(fils.current, texte))
    },
  })

  // Le curseur se pose là où l'on a cliqué, sinon à la fin : une fois l'éditeur accroché à la page
  // (les effets des enfants passent avant, `EditorContent` y accroche la vue).
  useEffect(() => {
    if (!editeur || editeur.isDestroyed) return
    const ou = (pointDepart.current = contexte.prendrePointEdition())
    const pos = ou && editeur.view.posAtCoords({ left: ou.x, top: ou.y })
    // Tout de suite, sans la focalisation différée de Tiptap : ce qu'on tape aussitôt arrive dans la note.
    editeur.commands.setTextSelection(pos ? pos.pos : editeur.state.doc.content.size)
    editeur.view.focus()
  }, [editeur, contexte])

  // Un clic dans la légende, ou une légende neuve et vide : l'écriture commence dans la légende.
  const legendeFaite = useRef(false)
  useEffect(() => {
    if (!editeurLegende || editeurLegende.isDestroyed || legendeFaite.current) return
    legendeFaite.current = true
    const ou = pointDepart.current
    const zone = editeurLegende.view.dom.getBoundingClientRect()
    if (ou && ou.x >= zone.left && ou.x <= zone.right && ou.y >= zone.top && ou.y <= zone.bottom) {
      editeurLegende.commands.focus(editeurLegende.view.posAtCoords({ left: ou.x, top: ou.y })?.pos ?? 'end')
    } else if (!ou && legendeVide(contenu.legende)) editeurLegende.commands.focus('end')
  }, [editeurLegende])
  useEffect(() => {
    if (!editeur || !editeurLegende) return
    const surTexte = () => setSurLegende(false)
    const surLeg = () => setSurLegende(true)
    editeur.on('focus', surTexte)
    editeurLegende.on('focus', surLeg)
    return () => {
      editeur.off('focus', surTexte)
      editeurLegende.off('focus', surLeg)
    }
  }, [editeur, editeurLegende])
  // L'éditeur dont la barre de gauche montre les outils : celui qui a le focus.
  const actif = surLegende && editeurLegende ? editeurLegende : editeur
  actionsLegende.current = {
    lien: () => gestes.current.lien(),
    noteDessous: () => gestes.current.noteDessous(),
    retirer: () => {
      const { legende: _, ...reste } = courant.current
      poser(reste)
      setLegendeOuverte(false)
      setSurLegende(false)
      editeur?.commands.focus('end')
    },
  }

  gestes.current = {
    lien: () => {
      if (actif && (!actif.state.selection.empty || actif.isActive('link')))
        setLien((actif.getAttributes('link').href as string | undefined) ?? '')
    },
    estVide: () => !!editeur && docEstVide(editeur.getJSON() as NoeudTexte),
    supprimerNote: () => {
      // À la corbeille d'abord : la sortie de l'édition n'inscrit plus rien d'une note partie,
      // et l'annulation rend la note telle qu'elle était avant l'édition.
      contexte.jeter([element.id])
      contexte.finirEdition()
    },
    noteDessous: () => contexte.creerSuivant(element.id, true),
    commenter: () => {
      if (!editeur || contexte.services.lectureSeule) return
      // Dans un passage déjà commenté : on ouvre son fil. Sinon, le passage choisi reçoit un fil neuf.
      const present = editeur.isActive(MARQUE_FIL) ? (editeur.getAttributes(MARQUE_FIL).fil as Id | null) : null
      if (present) return setOuvert(present)
      if (editeur.state.selection.empty) return
      const id = nouvelId()
      editeur.chain().focus().setMark(MARQUE_FIL, { fil: id }).run()
      ecrire(editeur.getJSON() as NoeudTexte, avecFil(fils.current, id, { type: 'commentaire', messages: [] }))
      setOuvert(id)
    },
    // Une note qui n'est qu'une adresse devient un lien en sortant, qui n'est qu'un code couleur un nuancier,
    // qui n'est qu'une case une liste de tâches.
    entree: () => {
      if (!editeur) return false
      const doc = editeur.getJSON() as NoeudTexte
      if (adresseSeule(doc) || couleurSeule(doc)) {
        contexte.finirEdition()
        return true
      }
      return gestes.current.enTaches()
    },
    enTaches: () => {
      const cochee = editeur && caseSeule(editeur.getJSON() as NoeudTexte)
      if (cochee === null || cochee === undefined) return false
      const texte = docVide()
      texte.content![0]!.content![0]!.attrs = { checked: cochee }
      brouillon({ type: 'taches', texte } as never)
      contexte.finirEdition()
      contexte.commencerEdition(element.id)
      return true
    },
  }

  return (
    <>
      {/* Le bloc « barre de gauche en édition » : le portail de l'éditeur vers l'emplacement que la toile prête. */}
      {actif && !attendue && <BarreTexte editor={actif} lien={lien} surLien={setLien} commenter={contexte.services.lectureSeule || surLegende ? undefined : () => gestes.current.commenter()} />}
      {actif && attendue && cible &&
        createPortal(
          <OutilsTexteGauche
            editor={actif}
            variante={surLegende ? 'legende' : 'note'}
            lien={lien}
            surLien={setLien}
            finir={() => contexte.finirEdition()}
            commenter={contexte.services.lectureSeule || surLegende ? undefined : () => gestes.current.commenter()}
          />,
          cible,
        )}
      {editeur && (
        <Marge
          editeur={editeur}
          fils={filsVus}
          ouvert={ouvert}
          surOuvert={setOuvert}
          ecrire={(id: Id, fil: Commentaire) => ecrire(editeur.getJSON() as NoeudTexte, avecFil(fils.current, id, fil))}
          contexte={contexte}
        />
      )}
      {editeur && <Propositions editeur={editeur} contexte={contexte} pont={pont} />}
      <EditorContent editor={editeur} />
      {legendeOuverte && (
        <div className="notak-note-legende">
          <LegendeEditeur
            depart={docLegende(contenu.legende) ?? legendeNeuve()}
            ecrire={(doc) => poser({ ...courant.current, legende: doc })}
            surEditeur={setEditeurLegende}
            actions={actionsLegende}
          />
        </div>
      )}
    </>
  )
}
