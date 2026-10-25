import { type Editor, useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Commentaire, type Id, type NoeudTexte, annoter, nouvelId } from '../../coeur/tableau'
import { Ligne } from '../commentaire/Commentaire'
import { Compositeur, type PoigneeCompositeur } from '../commentaire/Compositeur'
import { filDuBlocChoisi, placeDuFil } from '../../blocs/commentaires'
import { AUTEUR_INCONNU, ajouterMessage, epinglerEn, initiales, modifierMessage, reagirAuMessage, retirerMessage } from '../commentaire/fil'
import type { ContexteToile } from '../types'
import { type Fils, MARQUE_FIL, filsDuTexte, placerEnMarge } from './fils'
import { t, tn } from '../../langue'
import { Icone } from '../../icones'

const garder = (e: React.SyntheticEvent) => e.stopPropagation()

/** Ôte la marque de ce fil de tout le texte : le passage redevient du texte, le fil n'a plus de passage. */
function retirerMarque(editeur: Editor, id: Id) {
  const type = editeur.state.schema.marks[MARQUE_FIL]
  if (!type) return
  const tr = editeur.state.tr
  editeur.state.doc.descendants((n, pos) => {
    // Le fil d'un bloc sans texte est son attribut.
    if (!n.isText) {
      if (n.attrs.fil === id) tr.setNodeAttribute(pos, 'fil', null)
      return
    }
    const m = n.marks.find((x) => x.type === type && x.attrs.fil === id)
    if (m) tr.removeMark(pos, pos + n.nodeSize, m)
  })
  if (tr.docChanged || tr.steps.length > 0) editeur.view.dispatch(tr)
}

/**
 * « Détacher » : le fil quitte son passage et devient l'épingle de la note (au bord droit, à la hauteur du passage).
 * `null` si la note porte déjà un fil, ou si l'on n'écrit pas.
 */
function detacheDansElement(editeur: Editor, contexte: ContexteToile, fil: Commentaire | undefined, id: Id, fin: () => void): (() => void) | null {
  if (contexte.services.lectureSeule || !fil || fil.messages.length === 0) return null
  const carte = editeur.view.dom.closest<HTMLElement>('.notak-carte[data-id]')
  const element = carte && contexte.magasin.lire().elements.find((e) => e.id === carte.dataset.id)
  if (!carte || !element || element.commentaire?.messages.length) return null
  return () => {
    let pos = -1
    editeur.state.doc.descendants((n, p) => {
      if (pos < 0 && n.isText && n.marks.some((m) => m.type.name === MARQUE_FIL && m.attrs.fil === id)) pos = p
      return pos < 0
    })
    const r = carte.getBoundingClientRect()
    const echelle = carte.offsetWidth > 0 ? r.width / carte.offsetWidth : 1
    const haut = pos < 0 ? 20 : (editeur.view.coordsAtPos(pos).top - r.top) / echelle + 5
    const { replie: _, ...ouvert } = fil
    const op = annoter(element, { commentaire: epinglerEn(ouvert, carte.offsetWidth, Math.max(0, Math.min(carte.offsetHeight, haut))) })
    if (op) contexte.magasin.faire([op])
    fin()
    retirerMarque(editeur, id)
  }
}

interface Props {
  editeur: Editor
  fils: Fils | undefined
  /** Le fil qu'on vient d'ouvrir (bouton « Commenter »), même si le curseur n'est pas dans son passage. */
  ouvert: Id | null
  surOuvert(id: Id | null): void
  /** Inscrit un fil changé. */
  ecrire(id: Id, fil: Commentaire): void
  contexte: ContexteToile
  /**
   * La marge d'une page (le document) : les gestes de Notion (NOTION.md § 9, relevé 4 § 7). Le passage et sa fiche
   * s'éclairent ensemble au survol ; les fiches glissent ; quand la marge manque, chaque fil n'est qu'une bulle au bord
   * de la colonne, qui ouvre le fil sous son passage.
   */
  enPage?: boolean
}

/** Où le texte de la fiche s'aligne : son haut est 18 px au-dessus du haut du passage (mesuré dans Notion). */
const AU_DESSUS_DU_PASSAGE = 18
/** La place qu'il faut à droite de la colonne pour y poser les fiches : 32 px d'écart, 308 de fiche, un peu d'air. */
const PLACE_MARGE = 32 + 308 + 16

/** Le premier passage d'un fil dans le texte (ou son bloc sans texte), et son texte. */
const passageDe = (editeur: Editor, id: Id) => placeDuFil(editeur.state.doc, id)

/** Le haut et le bas d'un fil à l'écran : son passage, ou tout son bloc sans texte. */
function bornesDuFil(editeur: Editor, id: Id): { top: number; bottom: number } | null {
  const { pos, bloc } = passageDe(editeur, id)
  if (pos < 0) return null
  const dom = bloc ? editeur.view.nodeDOM(pos) : null
  if (dom instanceof HTMLElement) {
    const r = dom.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom }
  }
  return editeur.view.coordsAtPos(pos)
}

/** Le passage d'un fil éclairé, au survol ou ouvert : une règle de style, sans toucher au texte (ProseMirror). */
const reglePassage = (id: Id) =>
  `.notak-page .notak-fil-texte[data-fil="${CSS.escape(id)}"] { background: rgb(255 203 0 / 0.24); border-bottom-color: rgb(255 203 0); }
.notak-page [data-fil-bloc="${CSS.escape(id)}"] { outline: 2px solid rgb(255 203 0 / 0.8); outline-offset: 2px; border-radius: 4px; }`

/**
 * Les fils des passages commentés, en marge de la note en édition : chacun à la hauteur de son passage, sans
 * chevaucher le précédent. Le fil du passage où l'on est (ou qu'on vient d'ouvrir) reçoit la saisie.
 */
export function Marge({ editeur, fils, ouvert, surOuvert, ecrire, contexte, enPage = false }: Props) {
  const ids = useEditorState({
    editor: editeur,
    selector: ({ editor }) => filsDuTexte(editor.getJSON() as never).join('|'),
  })
  const liste = ids ? ids.split('|') : []
  const sous = useEditorState({
    editor: editeur,
    selector: ({ editor }) => (editor.isActive(MARQUE_FIL) ? ((editor.getAttributes(MARQUE_FIL).fil as string | null) ?? null) : filDuBlocChoisi(editor.state)),
  })
  const actif = ouvert ?? sous
  // Un fil sans message ne se montre que pendant qu'on l'écrit ; quitté vide, sa marque part (comme un commentaire
  // jamais envoyé chez Notion), et ceux qu'une version d'avant a laissés partent à l'ouverture.
  useEffect(() => {
    for (const id of liste) if (id !== actif && !fils?.[id]?.messages.length) retirerMarque(editeur, id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif])
  const visibles = liste.filter((id) => id === actif || !!fils?.[id]?.messages.length)
  const fiches = useRef(new Map<Id, HTMLElement>())
  const [places, setPlaces] = useState<number[]>([])
  // Le fil que la souris désigne, par sa fiche ou par son passage.
  const [survol, setSurvol] = useState<Id | null>(null)
  // Une page sans place à droite de la colonne : les fils deviennent des bulles au bord de la colonne.
  const [etroit, setEtroit] = useState(false)
  // Le haut et le bas du passage de chaque fil, et le centre de la colonne : où poser bulles et fil ouvert.
  const [passages, setPassages] = useState<{ haut: number; bas: number }[]>([])
  const [colonne, setColonne] = useState({ droite: 0, centre: 0 })
  const attente = useRef(0)
  const mesurerRef = useRef(() => {})

  const mesurer = useCallback(() => {
    const carte = editeur.view.dom.closest<HTMLElement>('.notak-carte, [data-marge-ancre]')
    if (!carte) {
      // L'éditeur n'est pas encore accroché à sa carte (premier rendu) : on réessaie un peu plus tard.
      if (attente.current < 60) {
        attente.current++
        window.setTimeout(() => mesurerRef.current(), 50)
      }
      return
    }
    attente.current = 0
    const rect = carte.getBoundingClientRect()
    // La toile peut être zoomée : la marge vit dans le plan, pas à l'écran.
    const echelle = carte.offsetWidth > 0 ? rect.width / carte.offsetWidth : 1
    const bornes = visibles.map((id) => {
      const c = bornesDuFil(editeur, id)
      if (!c) return { haut: 0, bas: 0 }
      return { haut: (c.top - rect.top) / echelle, bas: (c.bottom - rect.top) / echelle }
    })
    const voulues = bornes.map((b) => (enPage ? Math.max(0, b.haut - AU_DESSUS_DU_PASSAGE) : b.haut))
    const hauteurs = visibles.map((id) => fiches.current.get(id)?.offsetHeight ?? 0)
    const apres = placerEnMarge(voulues, hauteurs, enPage ? 10 : 8)
    setPlaces((avant) => (avant.length === apres.length && avant.every((v, i) => Math.abs(v - apres[i]!) < 0.5) ? avant : apres))
    if (enPage) {
      const texte = editeur.view.dom.getBoundingClientRect()
      const droite = (texte.right - rect.left) / echelle
      const etroite = rect.right - texte.right < PLACE_MARGE * echelle
      setEtroit(etroite)
      setColonne((avant) => (Math.abs(avant.droite - droite) < 0.5 ? avant : { droite, centre: (texte.left + texte.width / 2 - rect.left) / echelle }))
      setPassages((avant) => (avant.length === bornes.length && avant.every((b, i) => Math.abs(b.haut - bornes[i]!.haut) < 0.5) ? avant : bornes))
    }
  }, [editeur, ids, visibles.join('|'), enPage])

  mesurerRef.current = mesurer
  // Après chaque rendu (une fiche qui grandit pousse les suivantes), et quand le texte bouge.
  useLayoutEffect(mesurer)
  // Une fiche qui s'ouvre ou reçoit un message grandit quand son champ est monté, un peu après le rendu.
  const nbMessages = visibles.map((id) => fils?.[id]?.messages.length ?? 0).join('|')
  useEffect(() => {
    const t = [30, 160].map((ms) => window.setTimeout(() => mesurerRef.current(), ms))
    return () => t.forEach((x) => window.clearTimeout(x))
  }, [actif, nbMessages])
  useEffect(() => {
    editeur.on('update', mesurer)
    editeur.on('selectionUpdate', mesurer)
    // Un texte qui défile (le document ouvert en grand) emporte ses passages : les fiches les suivent.
    document.addEventListener('scroll', mesurer, true)
    // La mise en page qui change (ouverture, polices chargées, fenêtre retaillée) déplace les passages.
    // Une fiche qui grandit (son champ qui s'ouvre, une réponse) pousse les suivantes : on observe aussi les fiches.
    const taille = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => mesurer())
    taille?.observe(editeur.view.dom)
    const carte = editeur.view.dom.closest('.notak-carte, [data-marge-ancre]')
    if (carte) taille?.observe(carte)
    for (const f of fiches.current.values()) taille?.observe(f)
    const image = window.setTimeout(() => mesurer(), 0)
    // Le passage survolé désigne sa fiche (NOTION.md § 9).
    const dessus = (e: MouseEvent) => {
      const fil = (e.target as Element).closest?.('.notak-fil-texte[data-fil]')?.getAttribute('data-fil') ?? null
      setSurvol(fil)
    }
    if (enPage) editeur.view.dom.addEventListener('mouseover', dessus)
    return () => {
      window.clearTimeout(image)
      editeur.view.dom.removeEventListener('mouseover', dessus)
      editeur.off('update', mesurer)
      editeur.off('selectionUpdate', mesurer)
      document.removeEventListener('scroll', mesurer, true)
      taille?.disconnect()
    }
  }, [editeur, mesurer, enPage])

  // Page étroite : un clic hors du fil ouvert, ou Échap, le referme.
  useEffect(() => {
    if (!enPage || !etroit || !actif) return
    const hors = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.notak-note-marge, .notak-fil-texte')) surOuvert(null)
    }
    document.addEventListener('pointerdown', hors, true)
    return () => document.removeEventListener('pointerdown', hors, true)
  }, [enPage, etroit, actif, surOuvert])

  if (visibles.length === 0) return null
  const regles = enPage && [survol, actif].filter((x, i, t): x is Id => !!x && t.indexOf(x) === i).map(reglePassage).join('\n')
  return (
    <aside className="notak-note-marge" data-page={enPage || undefined} data-etroit={(enPage && etroit) || undefined} aria-label={t('commentaire.dutexte')} onPointerDown={garder} onDoubleClick={garder}>
      {regles && <style>{regles}</style>}
      {enPage &&
        etroit &&
        visibles.map((id, i) =>
          fils?.[id]?.messages.length ? (
            <button
              key={`bulle-${id}`}
              type="button"
              className="notak-fil-bulle"
              data-actif={actif === id || undefined}
              style={{ top: (passages[i]?.haut ?? 0) - 2, left: colonne.droite }}
              aria-label={tn('commentaire.messages', fils[id]!.messages.length)}
              onPointerEnter={() => setSurvol(id)}
              onPointerLeave={() => setSurvol(null)}
              onClick={() => surOuvert(actif === id ? null : id)}
            >
              <Icone nom="commentaire" taille={16} />
              {fils[id]!.messages.length}
            </button>
          ) : null,
        )}
      {visibles.map((id, i) => {
        if (enPage && etroit && actif !== id) return null
        const passage = passages[i]
        const flottant = enPage && etroit
        return (
        <Fiche
          key={id}
          ref={(n) => {
            if (n) fiches.current.set(id, n)
            else fiches.current.delete(id)
          }}
          haut={flottant ? (passage ? passage.bas + 6 : undefined) : places[i]}
          {...(flottant ? { centre: colonne.centre, ...(passageDe(editeur, id).texte ? { citation: passageDe(editeur, id).texte } : {}) } : {})}
          survolee={survol === id}
          surSurvol={(oui) => setSurvol(oui ? id : null)}
          fil={fils?.[id]}
          actif={actif === id}
          ouvrir={() => surOuvert(id)}
          fermer={() => {
            surOuvert(null)
            // Un fil jamais écrit part avec sa marque ; le curseur quitte le passage, sinon le fil se rouvrirait.
            if (!fils?.[id]?.messages.length) retirerMarque(editeur, id)
            editeur.chain().focus().setTextSelection(editeur.state.selection.to).run()
          }}
          ecrire={(f) => ecrire(id, f)}
          retirer={() => {
            surOuvert(null)
            retirerMarque(editeur, id)
          }}
          detacher={detacheDansElement(editeur, contexte, fils?.[id], id, () => surOuvert(null))}
          contexte={contexte}
        />
        )
      })}
    </aside>
  )
}

const VIDE: Commentaire = { type: 'commentaire', messages: [] }

function Fiche({
  ref,
  haut,
  centre,
  citation,
  survolee = false,
  surSurvol,
  fil = VIDE,
  actif,
  ouvrir,
  fermer,
  ecrire,
  retirer,
  detacher,
  contexte,
}: {
  ref: (n: HTMLElement | null) => void
  /** Sa place ; inconnue au premier rendu, la fiche attend d'être mesurée, cachée (elle ne glisse pas depuis le haut). */
  haut: number | undefined
  /** Le fil ouvert sous son passage (page étroite) : centré sur la colonne, le passage cité en tête. */
  centre?: number
  citation?: string
  survolee?: boolean
  surSurvol?(oui: boolean): void
  fil?: Commentaire
  actif: boolean
  ouvrir(): void
  fermer(): void
  ecrire(f: Commentaire): void
  /** Retire le fil, et la marque de son passage ; absent hors édition (la marque n'est pas à portée). */
  retirer: (() => void) | null
  /** Le fil devient l'épingle de la note ; absent si la note porte déjà un fil. */
  detacher: (() => void) | null
  contexte: ContexteToile
}) {
  const champ = useRef<PoigneeCompositeur>(null)
  const [vide, setVide] = useState(true)
  const auteur = contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU
  const peutEcrire = !contexte.services.lectureSeule
  const envoyer = (texte: string, riche?: NoeudTexte) => {
    if (!texte.trim()) return
    ecrire(ajouterMessage(fil, { id: nouvelId(), auteur, date: Date.now(), texte, ...(riche ? { riche } : {}) }))
    champ.current?.vider()
    setVide(true)
  }
  const n = fil.messages.length
  // Les gestes du fil (NOTION.md § 9) : sur son premier message, à côté de ceux du message ; plus de pied « Fermer » :
  // Échap, ou le curseur hors du passage, ferment la fiche.
  const gestesFil = peutEcrire && (
    <>
      {detacher && n > 0 && (
        <button type="button" className="notak-commentaire-geste" aria-label={t('commentaire.detacher')} title={t('commentaire.detacher')} onClick={detacher}>
          <Icone nom="detacher" taille={16} />
        </button>
      )}
      {retirer && (
        <button type="button" className="notak-commentaire-geste" aria-label={t('commentaire.retirerFil')} title={t('commentaire.retirerFil')} onClick={retirer}>
          <Icone nom="resoudre" taille={16} />
        </button>
      )}
    </>
  )
  return (
    <section
      ref={ref}
      className="notak-fil-marge"
      data-actif={actif || undefined}
      data-survol={(survolee && !actif) || undefined}
      data-flottant={centre !== undefined || undefined}
      data-neuf={n === 0 || undefined}
      style={haut === undefined ? { visibility: 'hidden' } : centre !== undefined ? { top: haut, left: centre } : { top: haut }}
      onClick={actif ? undefined : ouvrir}
      onPointerEnter={() => surSurvol?.(true)}
      onPointerLeave={() => surSurvol?.(false)}
    >
      {fil.messages.map((m, i) => (
        <Ligne
          key={m.id}
          message={m}
          contexte={contexte}
          enMarge
          {...(i === 0 && citation ? { citation } : {})}
          {...(i === 0 && actif ? { actionsFil: gestesFil } : {})}
          {...(peutEcrire ? { reagir: (emoji: string) => ecrire(reagirAuMessage(fil, m.id, emoji, auteur.id)) } : {})}
          {...(peutEcrire && m.auteur.id === auteur.id
            ? { modifier: (texte: string, riche?: NoeudTexte) => ecrire(modifierMessage(fil, m.id, texte, riche)), ...(i > 0 ? { retirer: () => ecrire(retirerMessage(fil, m.id)) } : {}) }
            : {})}
        />
      ))}
      {actif && peutEcrire && (
        <div className="notak-commentaire-saisie">
          <span className="notak-commentaire-pastille" style={auteur.couleur ? { background: auteur.couleur } : undefined} aria-hidden>
            {initiales(auteur.nom)}
          </span>
          <Compositeur
            contexte={contexte}
            poignee={champ}
            autoFocus
            placeholder={n > 0 && centre === undefined ? t('commentaire.repondrePoints') : t('commentaire.ecrire')}
            className="notak-fil-marge-champ"
            surChangement={(texte) => setVide(!texte)}
            envoyer={envoyer}
            echapper={() => {
              fermer()
              return true
            }}
          >
            <span className="notak-compositeur-gestes">
              <button
                type="button"
                className="notak-compositeur-rond"
                data-genre="envoyer"
                disabled={vide}
                aria-label={t('commentaire.envoyer')}
                title={t('commentaire.envoyer')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => champ.current?.envoyer?.()}
              >
                <Icone nom="haut" taille={14} trait={2.5} />
              </button>
            </span>
          </Compositeur>
        </div>
      )}
    </section>
  )
}

/**
 * Le fil d'un passage commenté, ouvert d'un clic hors édition : la même fiche que dans la marge, posée à droite de la
 * note à la hauteur du passage. Elle vit dans le plan de la toile (la carte d'une note bornée rogne ce qui dépasse).
 * Un clic ailleurs, ou Échap, la referme.
 */
export function FilOuvert({
  carte,
  id,
  fil,
  ecrire,
  fermer,
  contexte,
}: {
  /** La carte de la note : on y retrouve le passage. */
  carte: HTMLElement
  id: Id
  fil: Commentaire | undefined
  ecrire(f: Commentaire): void
  fermer(): void
  contexte: ContexteToile
}) {
  const plan = carte.closest<HTMLElement>('.notak-plan')
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (!plan) return
    const passage = [...carte.querySelectorAll<HTMLElement>('[data-fil]')].find((n) => n.dataset.fil === id)
    const rc = carte.getBoundingClientRect()
    const rp = plan.getBoundingClientRect()
    const echelle = carte.offsetWidth > 0 ? rc.width / carte.offsetWidth : 1
    const haut = passage ? passage.getBoundingClientRect().top : rc.top
    const x = (rc.right - rp.left) / echelle + 16
    const y = (haut - rp.top) / echelle
    setPlace((avant) => (avant && Math.abs(avant.x - x) < 0.5 && Math.abs(avant.y - y) < 0.5 ? avant : { x, y }))
  })
  useEffect(() => {
    const hors = (e: PointerEvent) => {
      const cible = e.target as HTMLElement | null
      if (!cible?.closest?.('.notak-note-marge, [data-fil]')) fermer()
    }
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('pointerdown', hors, true)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('pointerdown', hors, true)
      document.removeEventListener('keydown', touche)
    }
  }, [fermer])
  if (!plan || !place) return null
  return createPortal(
    <aside className="notak-note-marge" data-fige aria-label={t('commentaire.dutexte')} style={{ left: place.x, top: place.y }} onPointerDown={garder} onPointerUp={garder} onDoubleClick={garder} onClick={garder}>
      <Fiche ref={() => {}} haut={0} {...(fil ? { fil } : {})} actif ouvrir={() => {}} fermer={fermer} ecrire={ecrire} retirer={null} detacher={null} contexte={contexte} />
    </aside>,
    plan,
  )
}
