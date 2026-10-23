import { useEffect, useRef, useState } from 'react'
import type { ContexteToile } from '../types'
import { quiReagit } from './annotations'
import { t, tn } from '../../langue'

/** Le prénom, ou le nom, de chaque personne dont on a l'identifiant (celles qui ne sont pas là restent inconnues). */
function nomsDe(contexte: ContexteToile, ids: readonly string[], moi: string): string[] {
  const connus = new Map((contexte.services.presence?.autres() ?? []).map((p) => [p.utilisateur.id, p.utilisateur.nom]))
  return ids.filter((id) => id !== moi).map((id) => connus.get(id) ?? '')
}

/** Une pastille de réaction ; une info-bulle dit qui a réagi, après 300 ms de survol. */
export function PastilleReaction({ r, ids, contexte, moi, ecrire, reagir }: { r: { emoji: string; n: number; moi: boolean }; ids: readonly string[]; contexte: ContexteToile; moi: string; ecrire: boolean; reagir(emoji: string): void }) {
  const [vue, setVue] = useState(false)
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined)
  const montrer = () => {
    clearTimeout(minuterie.current)
    minuterie.current = setTimeout(() => setVue(true), 300)
  }
  const cacher = () => {
    clearTimeout(minuterie.current)
    setVue(false)
  }
  useEffect(() => () => clearTimeout(minuterie.current), [])
  const { qui, n } = quiReagit(nomsDe(contexte, ids, moi), r.moi)
  return (
    <button
      type="button"
      className="notak-reaction"
      aria-pressed={r.moi}
      aria-disabled={!ecrire || undefined}
      aria-label={`${r.emoji} ${r.n}`}
      onClick={() => ecrire && reagir(r.emoji)}
      onPointerEnter={montrer}
      onPointerLeave={cacher}
      onBlur={cacher}
    >
      <span className="notak-reaction-emoji" aria-hidden>
        {r.emoji}
      </span>
      <span className="notak-reaction-compte">{r.n}</span>
      {vue && (
        <span className="notak-reaction-bulle" role="tooltip">
          <strong>{qui}</strong> {n === 1 && r.moi ? t('decor.avezReagi') : tn('decor.aReagi', n)}
        </span>
      )}
    </button>
  )
}
