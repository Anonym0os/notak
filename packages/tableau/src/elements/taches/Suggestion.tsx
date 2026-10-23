import type { Suggestion } from './suggestions'
import { t } from '../../langue'

/**
 * La bulle sous la liste (une carte de 34 UG au moins) : une question et deux réponses soulignées. Elle entre en
 * 200 ms (hauteur, fondu, glissement) et sort plus vite. Un appui dessus ne remonte pas à la toile.
 */
export function BulleSuggestion({ suggestion, oui, non }: { suggestion: Suggestion; oui(): void; non(): void }) {
  return (
    <div className="notak-suggestion" role="status" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
      <span>{t(`taches.suggestion.${suggestion}`)}</span>
      <button type="button" onClick={oui}>
        {t('taches.suggestion.oui')}
      </button>
      <button type="button" onClick={non}>
        {t('taches.suggestion.non')}
      </button>
    </div>
  )
}
