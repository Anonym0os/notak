import { EditorContent, getSchema, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { type KeyboardEvent, type ReactNode, memo, useEffect, useMemo, useRef, useState } from 'react'
import { type CouleurNote, type Element, type Id, type NoeudTexte, type Taches, aimanter } from '../../coeur/tableau'
import { useLignePartagee } from '../lignePartagee'
import { extensionsDuPartage, textePartage } from '../partage'
import { MenuCouleur } from '../note/MenuCouleur'
import type { Operation } from '../../coeur/tableau'
import type { ContexteToile, PropsOutils, PropsRendu, ServicePresence } from '../types'
import { EXTENSIONS_TACHES, EXTENSIONS_TACHES_PARTAGEE, type GestesTaches, clavierListe, ouvreursPuces } from './extensions'
import { MenuPuce, type OuverturePuce } from './MenuPuce'
import { type Personne, type Puce, assigneDe, attrsPuce, echeanceDe, jourDe, personnes, puces } from './puces'
import { animerCase } from './animation'
import { type Sortie, glisserTache } from './glisse'
import { type Chemin, basculer, compter, deplacer, detacher, docTaches, effacerFaites, estFaite, regler, retirer, sousTaches, transferer } from './liste'
import { t } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'

/** Les listes dont le titre vient d'être ajouté : leur édition y met le curseur. */
const titreAFocaliser = new Set<Id>()

const sansTitre = ({ titre: _, ...reste }: Taches): Taches => reste

const sansCouleur = ({ couleur: _, ...reste }: Taches): Taches => reste

export function RenduTaches({ element, enEdition, contexte, brouillon, changer }: PropsRendu<Taches>) {
  const { contenu } = element
  const jeter = () => {
    contexte.jeter([element.id])
    contexte.finirEdition()
  }
  return (
    <div className="notak-taches" data-couleur={contenu.couleur}>
      {enEdition ? (
        <Edition id={element.id} contenu={contenu} contexte={contexte} surChangement={brouillon} jeter={jeter} />
      ) : (
        <Figee id={element.id} contenu={contenu} changer={changer} contexte={contexte} />
      )}
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
  const cible = menu && sousTachePar(doc, menu.chemin)
  return (
    <>
      {contenu.titre && <div className="notak-taches-titre">{contenu.titre}</div>}
      <Liste noeud={doc} chemin={[]} cocher={cocher} supprimer={supprimer} ouvrir={ouvrir} deplacer={bouger} sortir={sortir} />
      {menu && (
        <MenuPuce
          ouverture={menu}
          valeur={valeurPuce(menu.genre, cible?.attrs)}
          personnes={personnesPresentes(presence)}
          regler={(v) => changer({ ...contenu, texte: regler(doc, menu.chemin, attrsPuce(menu.genre, v, valeurPuce(menu.genre, cible?.attrs))) })}
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

/** Ce que la puce de ce genre porte déjà. */
const valeurPuce = (genre: Puce['genre'], attrs: Record<string, unknown> | undefined) =>
  genre === 'echeance' ? echeanceDe(attrs) : assigneDe(attrs)

/** Soi et ceux qui sont là sur le tableau : les noms qu'on propose d'assigner. */
function personnesPresentes(presence: ServicePresence | undefined): Personne[] {
  const vers = (u: { nom: string; couleur: string }): Personne => ({ nom: u.nom, couleur: u.couleur })
  const moi = presence?.moi?.()
  return personnes(moi && vers(moi), (presence?.autres() ?? []).map((p) => vers(p.utilisateur)))
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

// ———— En édition : Tiptap, et le titre dans un champ simple ————

const CASE_EN_TETE = /^\[([ xX]?)\]\s/

const SCHEMA = getSchema(EXTENSIONS_TACHES)

function Edition(props: { id: Id; contenu: Taches; contexte: ContexteToile; surChangement(apres: Taches): void; jeter(): void }) {
  const { id, contenu, contexte, surChangement, jeter } = props
  // L'état courant vit ici : la toile ne remet l'élément à jour qu'à la sortie de l'édition.
  const courant = useRef(contenu)
  const [titre, setTitre] = useState(contenu.titre)
  const champ = useRef<HTMLInputElement>(null)
  const editeurRef = useRef<Editor | null>(null)
  const focaliserTitre = useRef(titreAFocaliser.delete(id) && contenu.titre !== undefined)

  const poser = (apres: Taches) => {
    courant.current = apres
    surChangement(apres)
  }
  const gestes = useRef<GestesTaches>(null!)
  // Les tâches s'écrivent à plusieurs, comme le texte d'une note ; le titre aussi, par une ligne partagée.
  const fragment = useMemo(() => textePartage(contexte, id, docTaches(contenu.texte), SCHEMA), [])
  const extensions = useMemo(
    () => [...(fragment ? [...EXTENSIONS_TACHES_PARTAGEE, ...extensionsDuPartage(fragment, contexte)] : EXTENSIONS_TACHES), clavierListe(gestes)],
    [fragment],
  )
  const editeur = useEditor({
    extensions,
    ...(fragment ? {} : { content: docTaches(contenu.texte) }),
    autofocus: focaliserTitre.current ? false : 'end',
    editorProps: { attributes: { class: 'notak-taches-texte' } },
    onUpdate: ({ editor }) => poser({ ...courant.current, texte: editor.getJSON() as NoeudTexte }),
  })
  editeurRef.current = editeur
  const [menu, setMenu] = useState<(OuverturePuce & { pos: number }) | null>(null)
  useEffect(() => {
    if (!editeur) return
    ouvreursPuces.set(editeur, (genre, pos, ancre) => {
      const { chemin: _, ...o } = ouverturePuce([], genre, ancre)
      setMenu({ ...o, pos })
    })
    return () => void ouvreursPuces.delete(editeur)
  }, [editeur])
  const tacheDuMenu = menu && editeur?.state.doc.nodeAt(menu.pos)

  useEffect(() => {
    if (focaliserTitre.current) champ.current?.focus()
  }, [])

  const changerTitre = (valeur: string | undefined) => {
    setTitre(valeur)
    inscrireTitre(valeur ?? '')
    poser(valeur === undefined ? sansTitre(courant.current) : { ...courant.current, titre: valeur })
  }
  const inscrireTitre = useLignePartagee(contexte, id, contenu.titre, champ, (valeur) => {
    // Un autre a écrit dans le titre : on le suit tant qu'on en a un.
    if (courant.current.titre === undefined) return
    setTitre(valeur)
    poser({ ...courant.current, titre: valeur })
  })
  gestes.current = {
    aUnTitre: () => courant.current.titre !== undefined,
    versTitre: () => {
      if (courant.current.titre === undefined) changerTitre('')
      // Le champ naît au rendu suivant.
      setTimeout(() => {
        const c = champ.current
        c?.focus()
        c?.setSelectionRange(c.value.length, c.value.length)
      }, 0)
    },
    jeter,
  }
  // `[] ` en tête du titre le change en tâche, posée en haut de la liste.
  const titreTape = (valeur: string) => {
    const c = CASE_EN_TETE.exec(valeur)
    const ed = editeurRef.current
    if (!c || !ed) return changerTitre(valeur)
    const reste = valeur.slice(c[0].length)
    changerTitre(undefined)
    ed.chain()
      .insertContentAt(1, {
        type: 'taskItem',
        attrs: { checked: c[1]!.toLowerCase() === 'x' },
        content: [reste ? { type: 'paragraph', content: [{ type: 'text', text: reste }] } : { type: 'paragraph' }],
      })
      .setTextSelection(3 + reste.length)
      .run()
    // Tout de suite, sans la focalisation différée de Tiptap.
    ed.view.focus()
  }
  const clavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Une tâche neuve en tête de liste, curseur dedans (la première tâche ne sert pas).
      const ed = editeurRef.current
      if (!ed) return
      ed.chain().insertContentAt(1, { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }).setTextSelection(3).run()
      ed.view.focus()
    } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault()
      changerTitre(undefined)
      editeurRef.current?.commands.focus('start')
    }
  }

  return (
    <>
      {titre !== undefined && (
        <input
          ref={champ}
          className="notak-taches-titre"
          value={titre}
          placeholder={t('taches.titre')}
          onChange={(e) => titreTape(e.target.value)}
          onKeyDown={clavier}
        />
      )}
      <EditorContent editor={editeur} />
      {menu && editeur && (
        <MenuPuce
          ouverture={menu}
          valeur={valeurPuce(menu.genre, tacheDuMenu ? tacheDuMenu.attrs : undefined)}
          personnes={personnesPresentes(contexte.services.presence)}
          regler={(v) => {
            const t = editeur.state.doc.nodeAt(menu.pos)
            if (t?.type.name === 'taskItem')
              editeur.view.dispatch(
                editeur.state.tr.setNodeMarkup(menu.pos, undefined, { ...t.attrs, ...attrsPuce(menu.genre, v, valeurPuce(menu.genre, t.attrs)) }),
              )
          }}
          fermer={() => setMenu(null)}
        />
      )}
    </>
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
    changerTout((e) =>
      toutesTitrees ? sansTitre(e.contenu) : e.contenu.titre === undefined ? { ...e.contenu, titre: '' } : e.contenu,
    )
    if (!toutesTitrees && elements.length === 1) {
      titreAFocaliser.add(elements[0]!.id)
      contexte.commencerEdition(elements[0]!.id)
    }
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
      {faites >= 2 && (
        <BoutonOutil
          icone="gomme"
          secondaire
          libelle={t('taches.effacerFaites')}
          onClick={() => changerTout((e) => ({ ...e.contenu, texte: effacerFaites(docTaches(e.contenu.texte)) }))}
        />
      )}
    </>
  )
}
