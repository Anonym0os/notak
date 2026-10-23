import { type RefObject, useEffect, useState } from 'react'
import { PX_PAR_UG } from '../coeur/camera'
import type { Element } from '../coeur/tableau'
import { t } from '../langue'
import type { ContexteToile, TypeElement } from './types'

/** Au-delà de ce nombre de refus d'une même suggestion, elle ne revient plus (comme Milanote, gardé dans ce navigateur). */
const REFUS_MAX = 3
const CLE_REFUS = 'notak:suggestions'
/** Sous cette largeur (UG), la bande ne paraît pas. */
const LARGEUR_MIN = 34
/** La hauteur doit rester stable ce temps (ms) avant qu'on propose : on ne dérange pas en pleine frappe. */
const REPOS_MS = 1000

const refus = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(CLE_REFUS) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

const compterRefus = (cle: string) => {
  try {
    localStorage.setItem(CLE_REFUS, JSON.stringify({ ...refus(), [cle]: (refus()[cle] ?? 0) + 1 }))
  } catch {
    // Sans stockage, le refus ne vaut que pour cette session.
  }
}

/** Les suggestions déjà refusées ou acceptées sur un élément, pour cette session : `id:clé`. */
const traitees = new Set<string>()

/**
 * La bande de 40 px sous un élément qui propose quelque chose (« Convertir en document ? ») : la question, puis
 * « Oui » et « Non merci ». Le type dit quoi proposer par `suggestionSous` ; la bande se cache sous 34 UG de large,
 * après trois refus de la même suggestion, et tant que la hauteur de l'élément bouge.
 */
export function SuggestionSous({
  element,
  def,
  carte,
  contexte,
}: {
  element: Element
  def: TypeElement
  carte: RefObject<HTMLElement | null>
  contexte: ContexteToile
}) {
  const [hauteur, setHauteur] = useState(0)
  const [, relire] = useState(0)
  useEffect(() => {
    const n = carte.current
    if (!n) return
    let minuteur: ReturnType<typeof setTimeout> | undefined
    const mesurer = () => {
      clearTimeout(minuteur)
      minuteur = setTimeout(() => setHauteur(n.offsetHeight / PX_PAR_UG), REPOS_MS)
    }
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(n)
    return () => {
      clearTimeout(minuteur)
      obs.disconnect()
    }
  }, [carte])
  if (element.largeur < LARGEUR_MIN) return null
  const s = def.suggestionSous?.(element, contexte, hauteur)
  if (!s || traitees.has(`${element.id}:${s.cle}`) || (refus()[s.cle] ?? 0) >= REFUS_MAX) return null
  const clore = () => {
    traitees.add(`${element.id}:${s.cle}`)
    relire((n) => n + 1)
  }
  return (
    <div className="notak-suggestion" role="group" aria-label={s.question} onPointerDown={(e) => e.stopPropagation()}>
      <span className="notak-suggestion-question">{s.question}</span>
      <button
        type="button"
        onClick={() => {
          clore()
          s.oui()
        }}
      >
        {t('suggestion.oui')}
      </button>
      <button
        type="button"
        onClick={() => {
          compterRefus(s.cle)
          clore()
          s.non?.()
        }}
      >
        {t('suggestion.non')}
      </button>
    </div>
  )
}
