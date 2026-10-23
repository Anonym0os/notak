import { type Editor, useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Commentaire, type Id, nouvelId } from '../../coeur/tableau'
import { Ligne } from '../commentaire/Commentaire'
import { AUTEUR_INCONNU, ajouterMessage, initiales, resoudre, retirerMessage } from '../commentaire/fil'
import type { ContexteToile } from '../types'
import { type Fils, MARQUE_FIL, filsDuTexte, placerEnMarge } from './fils'
import { t } from '../../langue'
import { Icone } from '../../icones'

const garder = (e: React.SyntheticEvent) => e.stopPropagation()

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
    const carte = editeur.view.dom.closest<HTMLElement>('.notak-carte, [data-marge-ancre]')
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
    // Un texte qui défile (le document ouvert en grand) emporte ses passages : les fiches les suivent.
    document.addEventListener('scroll', mesurer, true)
    return () => {
      editeur.off('update', mesurer)
      editeur.off('selectionUpdate', mesurer)
      document.removeEventListener('scroll', mesurer, true)
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
  contexte,
}: {
  ref: (n: HTMLElement | null) => void
  haut: number
  fil?: Commentaire
  actif: boolean
  ouvrir(): void
  fermer(): void
  ecrire(f: Commentaire): void
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
    <section ref={ref} className="notak-fil-marge" data-actif={actif || undefined} data-resolu={fil.resolu || undefined} style={{ top: haut }} onClick={actif ? undefined : ouvrir}>
      {fil.resolu && (
        <p className="notak-commentaire-resolu">
          <Icone nom="coche" taille={13} /> Résolu · {n} message{n > 1 ? 's' : ''}
        </p>
      )}
      {(!fil.resolu || actif) &&
        fil.messages.map((m) => (
          <Ligne key={m.id} message={m} retirer={peutEcrire && m.auteur.id === auteur.id ? () => ecrire(retirerMessage(fil, m.id)) : undefined} />
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
      {actif && peutEcrire && n > 0 && (
        <div className="notak-fil-marge-actions">
          <button type="button" onClick={() => ecrire(resoudre(fil, !fil.resolu))}>
            {fil.resolu ? t('commentaire.rouvrir') : t('commentaire.resoudre')}
          </button>
          <button type="button" onClick={fermer}>
            {t('commun.fermer')}
          </button>
        </div>
      )}
    </section>
  )
}
