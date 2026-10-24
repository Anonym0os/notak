import type { Id } from '../../coeur/tableau'
import { GROUPES_MARQUEURS, Marqueur } from './marqueurs'
import type { Geste } from './modele/gestes'
import type { Lecture } from './modele/sujets'
import type { OngletIcone } from './onglets'

/** Le panneau des icônes. Provisoire : les marqueurs seuls. */
export function OngletIcones({ lecture, ids, faire }: { onglet: OngletIcone; lecture: Lecture; ids: Id[]; faire(g: Geste): void }) {
  const sujets = ids.flatMap((x) => lecture.sujets.get(x) ?? [])
  return (
    <div>
      {GROUPES_MARQUEURS.map((g) => (
        <div key={g.cle} className="notak-arbre-marqueurs" role="group">
          {g.marqueurs.map((m) => (
            <button key={m} type="button" aria-label={m} aria-pressed={sujets.every((s) => s.marqueurs?.includes(m))} onClick={() => faire({ type: 'marqueur', ids, marqueur: m })}>
              <svg width={18} height={18} viewBox="0 0 16 16">
                <Marqueur id={m} />
              </svg>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
