import { type Editor, useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Commentaire, type Id, type NoeudTexte, annoter, nouvelId } from '../../coeur/tableau'
import { Ligne } from '../commentaire/Commentaire'
import { AUTEUR_INCONNU, ajouterMessage, epinglerEn, initiales, modifierMessage, reagirAuMessage, retirerMessage } from '../commentaire/fil'
import type { ContexteToile } from '../types'
import { type Fils, MARQUE_FIL, filsDuTexte, placerEnMarge } from './fils'
import { t } from '../../langue'
import { Icone } from '../../icones'

const garder = (e: React.SyntheticEvent) => e.stopPropagation()

/** Ôte la marque de ce fil de tout le texte : le passage redevient du texte, le fil n'a plus de passage. */
function retirerMarque(editeur: Editor, id: Id) {
  const type = editeur.state.schema.marks[MARQUE_FIL]
  if (!type) return
  const tr = editeur.state.tr
  editeur.state.doc.descendants((n, pos) => {
    if (!n.isText) return
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
}

/**
 * Les fils des passages commentés, en marge de la note en édition : chacun à la hauteur de son passage, sans
 * chevaucher le précédent. Le fil du passage où l'on est (ou qu'on vient d'ouvrir) reçoit la saisie.
 */
export function Marge({ editeur, fils, ouvert, surOuvert, ecrire, contexte }: Props) {
  const ids = useEditorState({
    editor: editeur,
    selector: ({ editor }) => filsDuTexte(editor.getJSON() as never).join('|'),
  })
  const liste = ids ? ids.split('|') : []
  const sous = useEditorState({
    editor: editeur,
    selector: ({ editor }) => (editor.isActive(MARQUE_FIL) ? ((editor.getAttributes(MARQUE_FIL).fil as string | null) ?? null) : null),
  })
  const actif = ouvert ?? sous
  const fiches = useRef(new Map<Id, HTMLElement>())
  const [places, setPlaces] = useState<number[]>([])

  const mesurer = useCallback(() => {
    const carte = editeur.view.dom.closest<HTMLElement>('.notak-carte')
    if (!carte) return
    const rect = carte.getBoundingClientRect()
    // La toile peut être zoomée : la marge vit dans le plan, pas à l'écran.
    const echelle = carte.offsetWidth > 0 ? rect.width / carte.offsetWidth : 1
    const voulues = liste.map((id) => {
      let pos = -1
      editeur.state.doc.descendants((n, p) => {
        if (pos < 0 && n.isText && n.marks.some((m) => m.type.name === MARQUE_FIL && m.attrs.fil === id)) pos = p
        return pos < 0
      })
      return pos < 0 ? 0 : (editeur.view.coordsAtPos(pos).top - rect.top) / echelle
    })
    const hauteurs = liste.map((id) => fiches.current.get(id)?.offsetHeight ?? 0)
    const apres = placerEnMarge(voulues, hauteurs)
    setPlaces((avant) => (avant.length === apres.length && avant.every((v, i) => Math.abs(v - apres[i]!) < 0.5) ? avant : apres))
  }, [editeur, ids])

  // Après chaque rendu (une fiche qui grandit pousse les suivantes), et quand le texte bouge.
  useLayoutEffect(mesurer)
  useEffect(() => {
    editeur.on('update', mesurer)
    editeur.on('selectionUpdate', mesurer)
    return () => {
      editeur.off('update', mesurer)
      editeur.off('selectionUpdate', mesurer)
    }
  }, [editeur, mesurer])

  if (liste.length === 0) return null
  return (
    <aside className="notak-note-marge" aria-label={t('commentaire.dutexte')} onPointerDown={garder} onDoubleClick={garder}>
      {liste.map((id, i) => (
        <Fiche
          key={id}
          ref={(n) => {
            if (n) fiches.current.set(id, n)
            else fiches.current.delete(id)
          }}
          haut={places[i] ?? 0}
          fil={fils?.[id]}
          actif={actif === id}
          ouvrir={() => surOuvert(id)}
          fermer={() => {
            surOuvert(null)
            editeur.commands.focus()
          }}
          ecrire={(f) => ecrire(id, f)}
          retirer={() => {
            surOuvert(null)
            retirerMarque(editeur, id)
          }}
          detacher={detacheDansElement(editeur, contexte, fils?.[id], id, () => surOuvert(null))}
          contexte={contexte}
        />
      ))}
    </aside>
  )
}

const VIDE: Commentaire = { type: 'commentaire', messages: [] }

function Fiche({
  ref,
  haut,
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
  haut: number
  fil?: Commentaire
  actif: boolean
  ouvrir(): void
  fermer(): void
  ecrire(f: Commentaire): void
  /** Retire le fil, et la marque de son passage. */
  retirer(): void
  /** Le fil devient l'épingle de la note ; absent si la note porte déjà un fil. */
  detacher: (() => void) | null
  contexte: ContexteToile
}) {
  const [texte, setTexte] = useState('')
  const champ = useRef<HTMLTextAreaElement>(null)
  const auteur = contexte.services.presence?.moi?.() ?? AUTEUR_INCONNU
  const peutEcrire = !contexte.services.lectureSeule
  useEffect(() => {
    if (actif && peutEcrire) champ.current?.focus()
  }, [actif, peutEcrire])
  const envoyer = () => {
    if (!texte.trim()) return
    ecrire(ajouterMessage(fil, { id: nouvelId(), auteur, date: Date.now(), texte }))
    setTexte('')
  }
  const n = fil.messages.length
  return (
    <section ref={ref} className="notak-fil-marge" data-actif={actif || undefined} style={{ top: haut }} onClick={actif ? undefined : ouvrir}>
      {fil.messages.map((m) => (
        <Ligne
          key={m.id}
          message={m}
          contexte={contexte}
          {...(peutEcrire ? { reagir: (emoji: string) => ecrire(reagirAuMessage(fil, m.id, emoji, auteur.id)) } : {})}
          {...(peutEcrire && m.auteur.id === auteur.id
            ? { retirer: () => ecrire(retirerMessage(fil, m.id)), modifier: (texte: string, riche?: NoeudTexte) => ecrire(modifierMessage(fil, m.id, texte, riche)) }
            : {})}
        />
      ))}
      {actif && peutEcrire && (
        <div className="notak-commentaire-saisie">
          <span className="notak-commentaire-pastille" style={auteur.couleur ? { background: auteur.couleur } : undefined} aria-hidden>
            {initiales(auteur.nom)}
          </span>
          <textarea
            ref={champ}
            rows={1}
            value={texte}
            maxLength={5000}
            placeholder={n > 0 ? t('commentaire.repondrePoints') : t('commentaire.ecrire')}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              // Le champ garde ses touches : la note n'en sort pas, et Échap ne ferme que le fil.
              e.stopPropagation()
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                envoyer()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                fermer()
              }
            }}
          />
        </div>
      )}
      {actif && peutEcrire && (
        <div className="notak-fil-marge-actions">
          {detacher && n > 0 && (
            <button type="button" onClick={detacher}>
              <Icone nom="detacher" taille={14} /> {t('commentaire.detacher')}
            </button>
          )}
          <button type="button" onClick={retirer}>
            <Icone nom="corbeille" taille={14} /> {t('commentaire.retirer')}
          </button>
          <button type="button" onClick={fermer}>
            {t('commun.fermer')}
          </button>
        </div>
      )}
    </section>
  )
}
