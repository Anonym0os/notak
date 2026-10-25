import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Suggestion } from './suggestions'
import { t } from '../../langue'

/**
 * La bulle sous la liste (une carte de 34 UG au moins) : une question et deux réponses soulignées. Elle entre en
 * 200 ms (hauteur, fondu, glissement) et sort plus vite. Un appui dessus ne remonte pas à la toile.
 *
 * Elle se pose sous la carte entière, étiquettes, échéance et réactions comprises : elle se rend donc dans la carte,
 * pas dans la liste (hors d'une carte, dans la liste).
 */
export function BulleSuggestion({ suggestion, oui, non }: { suggestion: Suggestion; oui(): void; non(): void }) {
  const [hote, setHote] = useState<HTMLElement | null>(null)
  return (
    <>
      <span hidden ref={(n) => void (n && setHote(n.closest<HTMLElement>('.notak-carte') ?? n.parentElement))} />
      {hote &&
        createPortal(
          <div className="notak-suggestion" role="status" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
            <span>{t(`taches.suggestion.${suggestion}`)}</span>
            <button type="button" onClick={oui}>
              {t('taches.suggestion.oui')}
            </button>
            <button type="button" onClick={non}>
              {t('taches.suggestion.non')}
            </button>
          </div>,
          hote,
        )}
    </>
  )
}
