import { EditorContent, getSchema, useEditor, useEditorState } from '@tiptap/react'
import { type ReactNode, memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type CouleurNote, type Element, type Id, type NoeudTexte, type Taches, aimanter } from '../../coeur/tableau'
import { extensionsDuPartage, textePartage } from '../partage'
import { MenuCouleur } from '../note/MenuCouleur'
import type { Operation } from '../../coeur/tableau'
import type { ContexteToile, PropsOutils, PropsRendu, ServicePresence } from '../types'
import { EXTENSIONS_TACHES, EXTENSIONS_TACHES_PARTAGEE, type GestesTaches, clavierListe, ouvreursPuces, puceActive } from './extensions'
import { MenuPuce, type OuverturePuce } from './MenuPuce'
import { type Personne, type Puce, attrsAllumes, attrsEteints, attrsVides, jourDe, personnes, puces } from './puces'
import { animerCase } from './animation'
import { avecTitre, contenuDepuis, curseurAuTitre, docEditeur, sansTitre } from './titre'
import { type Sortie, glisserTache } from './glisse'
import { type Chemin, basculer, compter, deplacer, detacher, docTaches, estFaite, regler, retirer, sousTaches, transferer } from './liste'
import { t } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'
import { ContexteBarreEdition } from '../../barreEdition'
import { ouvrirFil } from '../decor/etat'
import { OutilsEdition } from './OutilsEdition'

/** Les listes dont le titre vient d'être ajouté : leur édition y met le curseur. */
const titreAFocaliser = new Set<Id>()

/** Les listes dont une puce vient d'être allumée par la barre : leur rendu en ouvre le choix, sous la puce. */
const puceAOuvrir = new Map<Id, Puce['genre']>()

const sansCouleur = ({ couleur: _, ...reste }: Taches): Taches => reste

export function RenduTaches({ element, enEdition, contexte, brouillon, changer }: PropsRendu<Taches>) {
  const { contenu } = element
  const jeter = () => {
    contexte.jeter([element.id])
    contexte.finirEdition()
  }
  if (enEdition) return <Edition id={element.id} contenu={contenu} contexte={contexte} surChangement={brouillon} jeter={jeter} />
  return (
    <div className="notak-taches" data-couleur={contenu.couleur}>
      <Figee id={element.id} contenu={contenu} changer={changer} contexte={contexte} />
    </div>
  )
}

// ———— Hors édition : la liste se dessine à partir du JSON, cases cliquables ————

const Figee = memo(function Figee({ id, contenu, changer, contexte }: { id: Id; contenu: Taches; changer(apres: Taches): void; contexte: ContexteToile }) {
  const presence = contexte.services.presence
  const doc = docTaches(contenu.texte)
  const cocher = (chemin: Chemin, enCascade: boolean) =>
    changer({ ...contenu, texte: basculer(doc, chemin, enCascade) })
  const supprimer = (chemin: Chemin) => changer({ ...contenu, texte: retirer(doc, chemin) })
  const bouger = (de: number, vers: number, avant: boolean) => changer({ ...contenu, texte: deplacer(doc, de, vers, avant) })
  // Hors de sa liste : dans une autre liste du tableau, ou sur la toile (une nouvelle liste d'une tâche).
  const sortir = (de: number, ou: Sortie) => {
    if (contexte.services.lectureSeule || contexte.services.presentation) return
    const ops = operationsDeSortie(contexte, id, de, ou)
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
    </>
  )
})

interface PropsListe {
  noeud: NoeudTexte
  chemin: Chemin
  cocher(c: Chemin, cascade: boolean): void
  supprimer(c: Chemin): void
  ouvrir(c: Chemin, genre: Puce['genre'], ancre: HTMLElement): void
  deplacer(de: number, vers: number, avant: boolean): void
  sortir(de: number, ou: Sortie): void
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
            <button
              type="button"
              tabIndex={-1}
              className="notak-case"
              role="checkbox"
              aria-checked={faite}
              aria-label={t('taches.fait')}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => {
                animerCase(e.currentTarget, !faite)
                cocher(ici, e.shiftKey)
              }}
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
 * changent, ou la liste qui perd la tâche et celle qui naît sur la toile. `nouvelle` : l'id de la liste née.
 */
export function operationsDeSortie(
  contexte: ContexteToile,
  id: Id,
  de: number,
  ou: Sortie,
): { operations: Operation[]; nouvelle?: Id } | null {
  const elements = contexte.magasin.lire().elements
  const source = elements.find((e) => e.id === id)
  if (source?.contenu.type !== 'taches') return null
  const avant = source.contenu
  const docSource = docTaches(avant.texte)
  if (ou.genre === 'liste') {
    const cible = elements.find((e) => e.id === ou.carte)
    if (cible?.contenu.type !== 'taches' || cible.id === id) return null
    const r = transferer(docSource, de, docTaches(cible.contenu.texte), ou.vers, ou.avant)
    if (!r) return null
    return {
      operations: [
        { type: 'contenu', id, avant, apres: { ...avant, texte: r.source } },
        { type: 'contenu', id: cible.id, avant: cible.contenu, apres: { ...cible.contenu, texte: r.destination } },
      ],
    }
  }
  const [x, y] = aimanter(contexte.versTableau({ x: ou.x, y: ou.y }))
  const r = detacher(docSource, de, x, y)
  if (!r) return null
  return {
    operations: [
      { type: 'contenu', id, avant, apres: { ...avant, texte: r.source } },
      { type: 'creer', element: r.liste },
    ],
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

/** Où ouvrir le menu d'une puce : sous elle, dans la toile qui la porte. */
function ouverturePuce(chemin: Chemin, genre: Puce['genre'], ancre: HTMLElement) {
  const r = ancre.getBoundingClientRect()
  return { chemin, genre, ancre: { left: r.left, bottom: r.bottom }, hote: (ancre.closest('.notak-toile') as HTMLElement | null) ?? document.body }
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
      else if (m.type === 'link' && typeof m.attrs?.href === 'string')
        rendu = (
          <a href={m.attrs.href} target="_blank" rel="noopener noreferrer nofollow">
            {rendu}
          </a>
        )
    }
    return <span key={i}>{rendu}</span>
  })
}

// ———— En édition : Tiptap, le titre est le premier nœud du document ————

const SCHEMA = getSchema(EXTENSIONS_TACHES)

function Edition(props: { id: Id; contenu: Taches; contexte: ContexteToile; surChangement(apres: Taches): void; jeter(): void }) {
  const { id, contenu, contexte, surChangement, jeter } = props
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
  gestes.current = { jeter }

  const [menu, setMenu] = useState<(OuverturePuce & { pos: number }) | null>(null)
  useEffect(() => {
    if (!editeur) return
    ouvreursPuces.set(editeur, (genre, pos, ancre) => {
      const { chemin: _, ...o } = ouverturePuce([], genre, ancre)
      setMenu({ ...o, pos })
    })
    return () => void ouvreursPuces.delete(editeur)
  }, [editeur])
  // Les attributs de la tâche du menu, relus à chaque transaction : le menu les montre à jour.
  const attrsDuMenu = useEditorState({
    editor: editeur,
    selector: ({ editor }) => (menu && editor ? (editor.state.doc.nodeAt(menu.pos)?.attrs ?? null) : null),
  })

  return (
    <div className="notak-taches" data-couleur={couleur}>
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
