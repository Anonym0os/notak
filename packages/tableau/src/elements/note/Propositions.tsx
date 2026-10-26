import { type Editor, Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { type RefObject, useEffect, useState } from 'react'
import { PanneauFlottant } from '../../PanneauFlottant'
import { PastillePersonne } from '../../pastille'
import { t as translate } from '../../langue'
import type { ContexteToile } from '../types'
import { type Declencheur, MAX_MENTION, type Proposition, declencheurDans, filtrer, sansDoublons } from './suggestion'

/** Ce que l'éditeur dit à la liste : où est le déclencheur, et où poser la liste. */
export interface EtatProposition extends Declencheur {
  de: number
  a: number
  x: number
  y: number
  /** Le curseur à l'écran, relu à chaque image : la liste le suit quand la toile bouge. */
  ou?(): { left: number; top: number; right: number; bottom: number } | null
}

/** Le pont entre le plugin (ProseMirror) et la liste (React). */
export interface Pont {
  proposer(etat: EtatProposition | null): void
  /** Rend vrai si la touche a servi à la liste. */
  touche(cle: string): boolean
}

const CLE = new PluginKey('propositions')

/** Lit, à chaque changement, le texte devant le curseur ; ne dit rien tant qu'on n'a pas tapé `@` ou `[[`. */
export const extensionPropositions = (pont: RefObject<Pont | null>) =>
  Extension.create({
    name: 'propositions',
    priority: 1200,
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: CLE,
          view: () => ({
            update(vue) {
              const { selection } = vue.state
              if (!selection.empty || !vue.hasFocus()) return pont.current?.proposer(null)
              const { $from } = selection
              const avant = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
              const d = declencheurDans(avant)
              if (!d) return pont.current?.proposer(null)
              const c = vue.coordsAtPos(selection.from)
              const ou = () => {
                try {
                  return vue.coordsAtPos(selection.from)
                } catch {
                  return null
                }
              }
              pont.current?.proposer({ ...d, de: selection.from - d.longueur, a: selection.from, x: c.left, y: c.bottom, ou })
            },
            destroy: () => pont.current?.proposer(null),
          }),
          props: {
            handleKeyDown: (_vue, e) => ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key) && !!pont.current?.touche(e.key),
          },
        }),
      ]
    },
  })

/** Les personnes qu'on peut citer : celles qui sont là, soi, et les membres que l'hôte connaît. */
export function personnesProposees(contexte: ContexteToile): Proposition[] {
  const { presence, membres } = contexte.services
  const moi = presence?.moi?.()
  return sansDoublons([
    ...(presence?.autres() ?? []).map((p) => ({ id: p.utilisateur.id, libelle: p.utilisateur.nom, teinte: p.utilisateur.couleur, ...(p.utilisateur.photo ? { photo: p.utilisateur.photo } : {}) })),
    ...(moi ? [{ id: moi.id, libelle: moi.nom, teinte: moi.couleur, ...(moi.photo ? { photo: moi.photo } : {}) }] : []),
    ...(membres?.() ?? []).map((m) => ({
      id: m.id,
      libelle: m.nom,
      ...(m.couleur ? { teinte: m.couleur } : {}),
      ...(m.photo ? { photo: m.photo } : {}),
      ...(m.courriel ? { courriel: m.courriel } : {}),
    })),
  ])
}

const sansTitre = () => translate('commun.sansTitre')

/** Les tableaux qu'on peut citer : ceux de l'espace si l'hôte les liste, sinon ceux posés sur ce tableau. */
export function tableauxProposes(contexte: ContexteToile): Proposition[] {
  const { listerTableaux, tableau } = contexte.services
  if (listerTableaux) return listerTableaux().map((t) => ({ id: t.id, libelle: t.titre || sansTitre() }))
  const ids = new Set(contexte.magasin.lire().elements.flatMap((e) => (e.contenu.type === 'tableau' ? [e.contenu.cible] : [])))
  return [...ids].flatMap((id) => {
    const t = tableau?.(id)
    return t ? [{ id, libelle: t.titre || sansTitre() }] : []
  })
}

/** La liste qui se pose sous le curseur ; Entrée ou Tab choisit, Échap ferme, un clic choisit. */
export function Propositions({ editeur, contexte, pont }: { editeur: Editor; contexte: ContexteToile; pont: RefObject<Pont | null> }) {
  const [etat, setEtat] = useState<EtatProposition | null>(null)
  const [rang, setRang] = useState(0)
  const [ferme, setFerme] = useState<string | null>(null)
  const toutes = etat ? (etat.genre === 'mention' ? personnesProposees(contexte) : tableauxProposes(contexte)) : []
  const items = etat ? filtrer(toutes, etat.requete, etat.genre === 'mention' ? MAX_MENTION : 6) : []
  const cle = etat ? `${etat.genre}:${etat.de}` : null
  const visible = !!etat && items.length > 0 && ferme !== cle

  const choisir = (p: Proposition) => {
    if (!etat) return
    editeur
      .chain()
      .focus()
      .insertContentAt({ from: etat.de, to: etat.a }, [
        { type: etat.genre === 'mention' ? 'mention' : 'lienTableau', attrs: { id: p.id, label: p.libelle } },
        { type: 'text', text: ' ' },
      ])
      .run()
  }

  // Le pont est relu à chaque frappe : il doit toujours voir l'état d'aujourd'hui.
  useEffect(() => {
    pont.current = {
      proposer: (e) => {
        setEtat(e)
        setRang(0)
      },
      touche: (k) => {
        if (!visible) return false
        if (k === 'ArrowDown') setRang((r) => (r + 1) % items.length)
        else if (k === 'ArrowUp') setRang((r) => (r + items.length - 1) % items.length)
        else if (k === 'Escape') setFerme(cle)
        else choisir(items[Math.min(rang, items.length - 1)]!)
        return true
      },
    }
  })
  useEffect(() => () => void (pont.current = null), [pont])

  if (!visible || !etat) return null
  const mention = etat.genre === 'mention'
  const curseur = { left: etat.x, top: etat.y, right: etat.x, bottom: etat.y }
  return (
    <PanneauFlottant cible={() => etat.ou?.() ?? curseur} alignement="debut" distance={4} fleche={false} className="notak-propositions-panneau" onPointerDown={(e) => e.preventDefault()}>
    <ul className="notak-propositions" data-genre={etat.genre} role="listbox">
      {items.map((p, i) => (
        <li key={p.id} role="option" aria-selected={i === rang} data-actif={i === rang || undefined} onClick={() => choisir(p)}>
          {mention ? (
            <>
              <Avatar proposition={p} contexte={contexte} />
              <span className="notak-proposition-nom">{p.libelle}</span>
              {p.courriel && <span className="notak-proposition-courriel">{p.courriel}</span>}
            </>
          ) : (
            <>
              {p.teinte && <span className="notak-proposition-teinte" style={{ background: p.teinte }} aria-hidden />}
              {p.libelle}
            </>
          )}
        </li>
      ))}
    </ul>
    </PanneauFlottant>
  )
}

/** La photo de la personne, sinon son initiale sur sa couleur. */
function Avatar({ proposition: p, contexte }: { proposition: Proposition; contexte: ContexteToile }) {
  const adresse = p.photo ? contexte.services.adressePhoto?.(p.photo) : undefined
  return <PastillePersonne nom={p.libelle} couleur={p.teinte} adresse={adresse} titre="" />
}
