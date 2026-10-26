import { EditorContent, getSchema, useEditor, useEditorState } from '@tiptap/react'
import { type ReactNode, memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cleEntre, comparerOrdre } from '../../coeur/ordre'
import { type CouleurNote, type Element, type Id, type NoeudTexte, type Taches, aimanter, placeDe } from '../../coeur/tableau'
import { extensionsDuPartage, textePartage } from '../partage'
import { MenuCouleur } from '../note/MenuCouleur'
import type { Operation } from '../../coeur/tableau'
import type { ContexteToile, PropsOutils, PropsRendu, ServicePresence } from '../types'
import { EXTENSIONS_TACHES, EXTENSIONS_TACHES_PARTAGEE, type GestesTaches, clavierListe, gestesDe, ouvreursPuces, puceActive, remplacerListe } from './extensions'
import { MenuPuce, type OuverturePuce } from './MenuPuce'
import { type Personne, type Puce, attrsAllumes, attrsEteints, attrsVides, jourDe, personnes, puces } from './puces'
import { Case } from '../../communs'
import { ajouterTitre, avecTitre, contenuDepuis, curseurAuTitre, docEditeur, sansTitre } from './titre'
import { type Sortie, glisserTache } from './glisse'
import { type Chemin, type Place, basculer, emporteLaListe, compter, deplacer, detacher, docTaches, effacerFaites, estFaite, regler, retirer, sousTaches, transferer } from './liste'
import { t } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'
import { ContexteBarreEdition } from '../../barreEdition'
import { ouvrirFil } from '../decor/etat'
import { OutilsEdition } from './OutilsEdition'
import { BulleSuggestion } from './Suggestion'
import { type Suggestion, ecartee, nombreEnHaut, noterRefusDuTitre, suggestionA } from './suggestions'
import { adresseSure } from '../lien/adresse'

/** Les listes dont le titre vient d'être ajouté : leur édition y met le curseur. */
const titreAFocaliser = new Set<Id>()

/** Les listes dont une puce vient d'être allumée par la barre : leur rendu en ouvre le choix, sous la puce. */
const puceAOuvrir = new Map<Id, Puce['genre']>()

const sansCouleur = ({ couleur: _, ...reste }: Taches): Taches => reste

/** Alt+Retour sur une liste choisie : le titre s'affiche (vide s'il n'y en avait pas) et le curseur s'y met. */
export function afficherTitre(liste: Element<Taches>, contexte: ContexteToile) {
  const apres = avecTitre(liste.contenu)
  if (apres !== liste.contenu) contexte.magasin.faire([{ type: 'contenu', id: liste.id, avant: liste.contenu, apres }])
  titreAFocaliser.add(liste.id)
  contexte.commencerEdition(liste.id)
}

export function RenduTaches({ element, enEdition, seule, contexte, brouillon, changer }: PropsRendu<Taches>) {
  const { contenu } = element
  const jeter = () => {
    contexte.jeter([element.id])
    contexte.finirEdition()
  }
  if (enEdition) return <Edition id={element.id} contenu={contenu} largeur={element.largeur} contexte={contexte} surChangement={brouillon} jeter={jeter} />
  return (
    <div className="notak-taches" data-couleur={contenu.couleur}>
      <Figee id={element.id} contenu={contenu} largeur={element.largeur} seule={!!seule} changer={changer} contexte={contexte} />
    </div>
  )
}

// ———— Hors édition : la liste se dessine à partir du JSON, cases cliquables ————

/** La carte est assez large pour porter une bulle de suggestion (34 UG au moins). */
const LARGEUR_BULLE = 34

const Figee = memo(function Figee({ id, contenu, largeur, seule, changer, contexte }: { id: Id; contenu: Taches; largeur: number; seule: boolean; changer(apres: Taches): void; contexte: ContexteToile }) {
  const presence = contexte.services.presence
  const doc = docTaches(contenu.texte)
  const cocher = (chemin: Chemin, enCascade: boolean) =>
    changer({ ...contenu, texte: basculer(doc, chemin, enCascade) })
  // La dernière tâche d'une liste sans titre emporte la liste ; avec un titre, une tâche vide reste.
  const supprimer = (chemin: Chemin) => {
    if (emporteLaListe(contenu, chemin)) contexte.jeter([id])
    else changer({ ...contenu, texte: retirer(doc, chemin) })
  }
  const bouger = (de: number, vers: number, place: Place, copie: boolean) => changer({ ...contenu, texte: deplacer(doc, de, vers, place, copie) })
  // Hors de sa liste : dans une autre liste du tableau, ou sur la toile (une nouvelle liste d'une tâche).
  const sortir = (de: number, ou: Sortie, copie: boolean) => {
    if (contexte.services.lectureSeule || contexte.services.presentation) return
    const ops = operationsDeSortie(contexte, id, de, ou, copie)
    if (!ops) return
    contexte.magasin.faire(ops.operations)
    if (ops.nouvelle) contexte.choisir([ops.nouvelle])
  }
  const [menu, setMenu] = useState<(OuverturePuce & { chemin: Chemin }) | null>(null)
  const ouvrir = (chemin: Chemin, genre: Puce['genre'], ancre: HTMLElement) => setMenu(ouverturePuce(chemin, genre, ancre))
  // Une puce que la barre vient d'allumer : son choix s'ouvre dès qu'elle est dessinée.
  useEffect(() => {
    const genre = puceAOuvrir.get(id)
    if (!genre) return
    puceAOuvrir.delete(id)
    const puce = document.querySelector<HTMLElement>(`[data-id="${id}"] .notak-puce[data-genre="${genre}"]`)
    if (puce) ouvrir([0], genre, puce)
  }, [contenu]) // eslint-disable-line react-hooks/exhaustive-deps
  const cible = menu && sousTachePar(doc, menu.chemin)
  return (
    <>
      {contenu.titre && <div className="notak-taches-titre">{contenu.titre}</div>}
      <Liste noeud={doc} chemin={[]} cocher={cocher} supprimer={supprimer} ouvrir={ouvrir} deplacer={bouger} sortir={sortir} />
      {menu && (
        <MenuPuce
          ouverture={menu}
          attrs={cible?.attrs}
          personnes={personnesPresentes(presence, contexte.services.membres)}
          regler={(attrs) => changer({ ...contenu, texte: regler(doc, menu.chemin, attrs) })}
          fermer={() => setMenu(null)}
        />
      )}
      {/* Choisie seule, la liste propose d'effacer ses tâches faites ; le titre ne se propose qu'en écrivant. */}
      {seule && largeur >= LARGEUR_BULLE && !contexte.services.lectureSeule && !contexte.services.presentation && (
        <SuggestionDe
          suggestion={suggestionA(contenu, false)}
          oui={() => changer({ ...contenu, texte: effacerFaites(doc) })}
          non={(s) => changer(ecartee(contenu, s))}
        />
      )}
    </>
  )
})

/** La bulle de la suggestion en cours, s'il y en a une. */
function SuggestionDe({ suggestion, oui, non }: { suggestion: Suggestion | null; oui(s: Suggestion): void; non(s: Suggestion): void }) {
  return suggestion ? <BulleSuggestion key={suggestion} suggestion={suggestion} oui={() => oui(suggestion)} non={() => non(suggestion)} /> : null
}

interface PropsListe {
  noeud: NoeudTexte
  chemin: Chemin
  cocher(c: Chemin, cascade: boolean): void
  supprimer(c: Chemin): void
  ouvrir(c: Chemin, genre: Puce['genre'], ancre: HTMLElement): void
  deplacer(de: number, vers: number, place: Place, copie: boolean): void
  sortir(de: number, ou: Sortie, copie: boolean): void
}

function Liste({ noeud, chemin, cocher, supprimer, ouvrir, deplacer, sortir }: PropsListe) {
  const aujourdhui = jourDe(new Date())
  const taches = sousTaches(noeud)
  if (taches.length === 0) return null
  return (
    <ul data-type="taskList">
      {taches.map((tache, i) => {
        const ici = [...chemin, i]
        const faite = estFaite(tache)
        return (
          <li key={i} data-type="taskItem" data-checked={faite}>
            <span
              className="notak-tache-poignee"
              title={t('taches.deplacer')}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const racine = e.currentTarget.closest<HTMLElement>('.notak-taches')
                const li = e.currentTarget.closest<HTMLElement>('li')
                if (racine && li) glisserTache(e.nativeEvent, racine, li, deplacer, sortir)
              }}
            />
            <Case
              large
              cochee={faite}
              aria-label={t('taches.fait')}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onDoubleClick={(e) => e.stopPropagation()}
              onChange={(_, e) => cocher(ici, e.shiftKey)}
            />
            <div>
              {(tache.content ?? []).map((n, k) =>
                n.type === 'paragraph' ? <p key={k}>{inline(n)}</p> : null,
              )}
              <Liste noeud={tache} chemin={ici} cocher={cocher} supprimer={supprimer} ouvrir={ouvrir} deplacer={deplacer} sortir={sortir} />
            </div>
            <span className="notak-puces">
              {puces(tache.attrs, aujourdhui).map((p) => (
                <button
                  key={p.genre}
                  type="button"
                  tabIndex={-1}
                  className="notak-puce"
                  data-genre={p.genre}
                  data-vide={p.vide ? '' : undefined}
                  data-statut={p.statut}
                  data-rappel={p.rappel ? '' : undefined}
                  title={p.titre}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => ouvrir(ici, p.genre, e.currentTarget)}
                >
                  {p.texte}
                </button>
              ))}
            </span>
            <button
              type="button"
              tabIndex={-1}
              className="notak-tache-suppr"
              title={t('taches.supprimer')}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={() => supprimer(ici)}
            />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Ce que change le tableau quand une tâche est lâchée hors de sa liste, d'un seul pas : les deux listes qui
 * changent, ou la liste qui perd la tâche et celle qui naît (sur la toile, ou rangée dans une colonne). `nouvelle` :
 * l'id de la liste née. Avec `copie`, la liste d'origine ne perd rien.
 */
export function operationsDeSortie(
  contexte: ContexteToile,
  id: Id,
  de: number,
  ou: Sortie,
  copie = false,
): { operations: Operation[]; nouvelle?: Id } | null {
  const tableau = contexte.magasin.lire()
  const elements = tableau.elements
  const source = elements.find((e) => e.id === id)
  if (source?.contenu.type !== 'taches') return null
  const avant = source.contenu
  const docSource = docTaches(avant.texte)
  // La seule tâche d'une liste sans titre emporte la liste : elle part à la corbeille au lieu de rester vide derrière.
  const emportee = !copie && de === 0 && emporteLaListe(avant, [0])
  const perte = (texte: NoeudTexte): Operation[] =>
    copie
      ? []
      : emportee
        ? [{ type: 'ranger', id, de: placeDe(source), vers: { x: source.x, y: source.y, corbeille: Date.now() } }]
        : [{ type: 'contenu', id, avant, apres: { ...avant, texte } }]
  if (ou.genre === 'liste') {
    const cible = elements.find((e) => e.id === ou.carte)
    if (cible?.contenu.type !== 'taches' || cible.id === id) return null
    const r = transferer(docSource, de, docTaches(cible.contenu.texte), ou.vers, ou.place, copie)
    if (!r) return null
    return {
      operations: [
        ...perte(r.source),
        { type: 'contenu', id: cible.id, avant: cible.contenu, apres: { ...cible.contenu, texte: r.destination } },
      ],
    }
  }
  if (ou.genre === 'colonne') {
    const colonne = elements.find((e) => e.id === ou.colonne)
    if (colonne?.contenu.type !== 'colonne') return null
    const r = detacher(docSource, de, colonne.x, colonne.y, copie)
    if (!r) return null
    // Rangée parmi les éléments de la colonne, à l'index visé.
    const freres = elements.filter((e) => e.parent === colonne.id && e.corbeille === undefined).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
    const i = Math.max(0, Math.min(ou.index, freres.length))
    const rangee: Element<Taches> = { ...r.liste, parent: colonne.id, ordre: cleEntre(freres[i - 1]?.ordre, freres[i]?.ordre) }
    return {
      operations: [...perte(r.source), { type: 'creer', element: rangee }],
      nouvelle: rangee.id,
    }
  }
  const [x, y] = aimanter(contexte.versTableau({ x: ou.x, y: ou.y }))
  const r = detacher(docSource, de, x, y, copie)
  if (!r) return null
  return {
    operations: [...perte(r.source), { type: 'creer', element: r.liste }],
    nouvelle: r.liste.id,
  }
}

/** La tâche à ce chemin, ou `undefined`. */
function sousTachePar(doc: NoeudTexte, chemin: Chemin): NoeudTexte | undefined {
  let n: NoeudTexte | undefined = doc
  for (const i of chemin) n = n && sousTaches(n)[i]
  return n
}

/** Soi, ceux qui sont là sur le tableau, puis les membres de l'espace : les noms qu'on propose d'assigner. */
function personnesPresentes(presence: ServicePresence | undefined, membres?: () => { nom: string; couleur?: string }[]): Personne[] {
  const vers = (u: { nom: string; couleur?: string | undefined }): Personne => ({ nom: u.nom, ...(u.couleur ? { couleur: u.couleur } : {}) })
  const moi = presence?.moi?.()
  return personnes(moi && vers(moi), [...(presence?.autres() ?? []).map((p) => vers(p.utilisateur)), ...(membres?.() ?? []).map(vers)])
}

/** Où ouvrir le menu d'une puce : accroché à elle, rangé dans la toile qui la porte (pour ses couleurs). */
function ouverturePuce(chemin: Chemin, genre: Puce['genre'], ancre: HTMLElement, retrouver?: () => HTMLElement | null | undefined) {
  return {
    chemin,
    genre,
    cible: () => retrouver?.() ?? (ancre.isConnected ? ancre : null),
    hote: (ancre.closest('.notak-toile') as HTMLElement | null) ?? document.body,
  }
}

function inline(paragraphe: NoeudTexte): ReactNode {
  return (paragraphe.content ?? []).map((n, i): ReactNode => {
    if (n.type === 'hardBreak') return <br key={i} />
    let rendu: ReactNode = n.text ?? ''
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') rendu = <strong>{rendu}</strong>
      else if (m.type === 'italic') rendu = <em>{rendu}</em>
      else if (m.type === 'strike') rendu = <s>{rendu}</s>
      else if (m.type === 'underline') rendu = <u>{rendu}</u>
      else if (m.type === 'code') rendu = <code>{rendu}</code>
      else if (m.type === 'link' && adresseSure(m.attrs?.href))
        rendu = (
          <a href={adresseSure(m.attrs?.href)} target="_blank" rel="noopener noreferrer nofollow">
            {rendu}
          </a>
        )
    }
    return <span key={i}>{rendu}</span>
  })
}

// ———— En édition : Tiptap, le titre est le premier nœud du document ————

const SCHEMA = getSchema(EXTENSIONS_TACHES)

function Edition(props: { id: Id; contenu: Taches; largeur: number; contexte: ContexteToile; surChangement(apres: Taches): void; jeter(): void }) {
  const { id, contenu, largeur, contexte, surChangement, jeter } = props
  // L'état courant vit ici : la toile ne remet l'élément à jour qu'à la sortie de l'édition.
  const courant = useRef(contenu)
  const focaliserTitre = useRef(titreAFocaliser.delete(id) && contenu.titre !== undefined)

  // La couleur se change pendant l'écriture : la bande suit tout de suite, la toile n'a que le brouillon.
  const [couleur, setCouleur] = useState(contenu.couleur)
  const poser = (apres: Taches) => {
    courant.current = apres
    surChangement(apres)
  }
  const gestes = useRef<GestesTaches>(null!)
  // Avec la barre de gauche, les outils de la liste y prennent la place ; sinon il n'y a pas de barre d'édition.
  const { attendue, cible } = useContext(ContexteBarreEdition)
  const [lien, setLien] = useState<string | null>(null)
  // Les tâches et le titre s'écrivent à plusieurs, comme le texte d'une note.
  const fragment = useMemo(() => textePartage(contexte, id, docEditeur(contenu), SCHEMA), [])
  const extensions = useMemo(
    () => [...(fragment ? [...EXTENSIONS_TACHES_PARTAGEE, ...extensionsDuPartage(fragment, contexte)] : EXTENSIONS_TACHES), clavierListe(gestes)],
    [fragment],
  )
  const editeur = useEditor({
    extensions,
    ...(fragment ? {} : { content: docEditeur(contenu) }),
    autofocus: false,
    editorProps: { attributes: { class: 'notak-taches-texte' } },
    onUpdate: ({ editor }) => poser(contenuDepuis(editor.getJSON() as NoeudTexte, courant.current)),
  })
  // Le curseur se pose là où l'on a cliqué, au bout du titre qu'on vient d'ajouter, sinon à la dernière tâche.
  useEffect(() => {
    if (!editeur || editeur.isDestroyed) return
    if (focaliserTitre.current) return void curseurAuTitre(editeur)
    const ou = contexte.prendrePointEdition()
    const pos = ou && editeur.view.posAtCoords({ left: ou.x, top: ou.y })
    if (pos) editeur.chain().setTextSelection(pos.pos).focus().run()
    else editeur.commands.focus('end')
  }, [editeur, contexte])
  gestes.current = { jeter, titreCache: () => courant.current.titreCache }
  useEffect(() => {
    if (!editeur) return
    gestesDe.set(editeur, gestes)
    return () => void gestesDe.delete(editeur)
  }, [editeur])

  // Les suggestions : une pause de frappe d'une seconde, et la liste dit ce qu'elle propose.
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const gagne = useRef(false)
  useEffect(() => {
    if (!editeur) return
    let minuteur: ReturnType<typeof setTimeout> | undefined
    const enHaut = () => nombreEnHaut(contenuDepuis(editeur.getJSON() as NoeudTexte, courant.current))
    let avant = enHaut()
    const surMaj = () => {
      const h = enHaut()
      if (h >= 2 && avant < 2) gagne.current = true
      avant = h
      clearTimeout(minuteur)
      minuteur = setTimeout(() => setSuggestion(suggestionA(courant.current, gagne.current)), 1000)
    }
    editeur.on('update', surMaj)
    return () => {
      editeur.off('update', surMaj)
      clearTimeout(minuteur)
    }
  }, [editeur])
  const ecarter = (s: Suggestion) => {
    if (s === 'titre') noterRefusDuTitre()
    poser(ecartee(courant.current, s))
    setSuggestion(null)
  }

  const [menu, setMenu] = useState<(OuverturePuce & { pos: number }) | null>(null)
  useEffect(() => {
    if (!editeur) return
    ouvreursPuces.set(editeur, (genre, pos, ancre) => {
      // L'éditeur redessine les puces à chaque changement : on relit celle de la tâche, là où elle est.
      const retrouver = () => {
        try {
          return (editeur.view.nodeDOM(pos) as HTMLElement | null)?.querySelector<HTMLElement>(`:scope > .notak-puces > .notak-puce[data-genre="${genre}"]`)
        } catch {
          return null
        }
      }
      const { chemin: _, ...o } = ouverturePuce([], genre, ancre, retrouver)
      setMenu({ ...o, pos })
    })
    return () => void ouvreursPuces.delete(editeur)
  }, [editeur])
  // Une plage de texte choisie : la corbeille de ligne ne réagit plus (voir `taches.css`).
  const texteChoisi = useEditorState({ editor: editeur, selector: ({ editor }) => !!editor && !editor.state.selection.empty })
  // Les attributs de la tâche du menu, relus à chaque transaction : le menu les montre à jour.
  const attrsDuMenu = useEditorState({
    editor: editeur,
    selector: ({ editor }) => (menu && editor ? (editor.state.doc.nodeAt(menu.pos)?.attrs ?? null) : null),
  })

  return (
    <div className="notak-taches" data-couleur={couleur} data-texte-choisi={texteChoisi ? '' : undefined}>
      <EditorContent editor={editeur} />
      {editeur && attendue && cible &&
        createPortal(
          <OutilsEdition
            editor={editeur}
            couleur={couleur}
            choisirCouleur={(c) => {
              setCouleur(c)
              poser(c ? { ...sansCouleur(courant.current), couleur: c } : sansCouleur(courant.current))
            }}
            titreCache={() => courant.current.titreCache}
            lien={lien}
            surLien={setLien}
            {...(contexte.services.lectureSeule ? {} : { commenter: () => ouvrirFil(id) })}
            finir={() => contexte.finirEdition()}
          />,
          cible,
        )}
      {menu && editeur && (
        <MenuPuce
          ouverture={menu}
          attrs={attrsDuMenu ?? undefined}
          personnes={personnesPresentes(contexte.services.presence, contexte.services.membres)}
          regler={(attrs) => {
            const t = editeur.state.doc.nodeAt(menu.pos)
            if (t?.type.name === 'taskItem') editeur.view.dispatch(editeur.state.tr.setNodeMarkup(menu.pos, undefined, { ...t.attrs, ...attrs }))
          }}
          fermer={() => setMenu(null)}
        />
      )}
      {suggestion && editeur && largeur >= LARGEUR_BULLE && (
        <BulleSuggestion
          key={suggestion}
          suggestion={suggestion}
          oui={() => {
            if (suggestion === 'titre') ajouterTitre(editeur, courant.current.titreCache)
            else remplacerListe(editeur, effacerFaites(docTaches(contenuDepuis(editeur.getJSON() as NoeudTexte, courant.current).texte)).content![0]!)
            setSuggestion(null)
          }}
          non={() => ecarter(suggestion)}
        />
      )}
    </div>
  )
}

// ———— La barre de sélection ————

export function OutilsTaches({ elements, contexte }: PropsOutils<Taches>) {
  const { faites, total } = elements.reduce(
    (cumul, e) => {
      const c = compter(e.contenu.texte)
      return { faites: cumul.faites + c.faites, total: cumul.total + c.total }
    },
    { faites: 0, total: 0 },
  )
  const toutesTitrees = elements.every((e) => e.contenu.titre !== undefined)

  const changerTout = (f: (e: Element<Taches>) => Taches) =>
    contexte.magasin.faire(
      elements.flatMap((e) => {
        const apres = f(e)
        return JSON.stringify(apres) === JSON.stringify(e.contenu)
          ? []
          : [{ type: 'contenu' as const, id: e.id, avant: e.contenu, apres }]
      }),
    )

  const basculerTitre = () => {
    changerTout((e) => (toutesTitrees ? sansTitre(e.contenu) : avecTitre(e.contenu)))
    if (!toutesTitrees && elements.length === 1) {
      titreAFocaliser.add(elements[0]!.id)
      contexte.commencerEdition(elements[0]!.id)
    }
  }

  // Une liste qui n'a qu'une tâche de premier niveau prête ses outils à cette tâche : Échéance, Assigner.
  const seule = elements.length === 1 ? elements[0]! : null
  const unique = seule && sousTaches(docTaches(seule.contenu.texte)).length === 1 ? sousTaches(docTaches(seule.contenu.texte))[0]! : null
  const basculerPuce = (genre: Puce['genre']) => {
    if (!seule || !unique) return
    const actif = puceActive(unique.attrs, genre)
    // Allumée, la puce de l'assigné repart vide ; éteinte, elle perd ce qu'elle portait.
    const patch = actif ? attrsEteints(genre) : { ...(genre === 'assigne' ? attrsVides('assigne') : {}), ...attrsAllumes(genre) }
    changerTout((e) => ({ ...e.contenu, texte: regler(docTaches(e.contenu.texte), [0], patch) }))
    if (!actif) puceAOuvrir.set(seule.id, genre)
  }

  return (
    <>
      {total > 0 && (
        <span className="notak-taches-compteur" title={t('taches.faites')}>
          {faites}/{total}
        </span>
      )}
      <MenuCouleur
        actuelle={elements.every((e) => e.contenu.couleur === elements[0]!.contenu.couleur) ? elements[0]!.contenu.couleur : undefined}
        choisir={(couleur: CouleurNote | undefined) =>
          changerTout((e) => (couleur ? { ...sansCouleur(e.contenu), couleur } : sansCouleur(e.contenu)))
        }
      />
      <BoutonOutil icone="titre" libelle={t('taches.titre')} actif={toutesTitrees} onClick={basculerTitre} />
      {/* Réaction et Étiquette de la tâche unique prendront ici leur place, avec les annotations par tâche (elements/decor). */}
      {unique && (
        <>
          <BoutonOutil icone="calendrier" libelle={t('decor.echeance')} actif={puceActive(unique.attrs, 'echeance')} onClick={() => basculerPuce('echeance')} />
          <BoutonOutil icone="personne" libelle={t('taches.assigner')} actif={puceActive(unique.attrs, 'assigne')} onClick={() => basculerPuce('assigne')} />
        </>
      )}
    </>
  )
}
