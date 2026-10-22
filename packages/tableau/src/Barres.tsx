import { useState } from 'react'
import type { Element } from './coeur/tableau'
import { definition, tousLesOutilsCommuns, tousLesTypes } from './elements/registre'
import type { ContexteToile, Outil } from './elements/types'

/** Un outil de la barre, avec le type qui l'apporte. */
export interface OutilDeBarre {
  type: string
  outil: Outil
}

export const outilsDeBarre = (): OutilDeBarre[] =>
  tousLesTypes()
    .flatMap((d) => (d.outils ?? []).map((outil) => ({ type: d.type, outil })))
    .sort((a, b) => a.outil.rang - b.outil.rang)

/**
 * La barre de gauche. Un outil se glisse sur la toile : c'est la toile qui suit le geste (`surAppui`).
 * Un simple clic ne crée rien : l'outil rebondit et une bulle rappelle qu'on le glisse (`rebond`).
 */
export function BarreOutils({
  surAppui,
  rebond,
}: {
  surAppui(o: OutilDeBarre, e: React.PointerEvent): void
  rebond: { libelle: string; n: number } | null
}) {
  const [tiroir, setTiroir] = useState(false)
  const tous = outilsDeBarre()
  const bouton = (o: OutilDeBarre, dansTiroir = false) => {
    const rebondit = rebond?.libelle === o.outil.libelle
    return (
      <div key={`${o.type}:${o.outil.libelle}`} className="notak-outil-place">
        <button
          type="button"
          className="notak-outil"
          title={o.outil.libelle}
          // La clé change à chaque clic : l'animation du rebond repart.
          data-rebond={rebondit ? rebond.n % 2 : undefined}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            surAppui(o, e)
            // Le tiroir se referme : l'outil sorti part avec le pointeur.
            if (dansTiroir) setTiroir(false)
          }}
        >
          <span className="notak-outil-icone">{o.outil.icone}</span>
          <span className="notak-outil-libelle">{o.outil.libelle}</span>
        </button>
        {rebondit && (
          <div key={rebond.n} className="notak-bulle-outil" role="status">
            Glissez l’outil sur le tableau
          </div>
        )}
      </div>
    )
  }
  const caches = tous.filter((o) => o.outil.tiroir)
  return (
    <nav className="notak-barre-outils" onPointerDown={(e) => e.stopPropagation()}>
      {tous.filter((o) => !o.outil.tiroir).map((o) => bouton(o))}
      {caches.length > 0 && (
        <div className="notak-outil-place">
          <button
            type="button"
            className="notak-outil"
            aria-expanded={tiroir}
            title="Plus d’outils"
            onClick={() => setTiroir((t) => !t)}
          >
            <span className="notak-outil-icone">⋯</span>
            <span className="notak-outil-libelle">Plus</span>
          </button>
          {tiroir && <div className="notak-tiroir">{caches.map((o) => bouton(o, true))}</div>}
        </div>
      )}
    </nav>
  )
}

/** La barre de sélection, posée au-dessus des éléments choisis : les outils de chaque type présent, puis les outils communs. */
export function BarreSelection({
  elements,
  contexte,
  position,
}: {
  elements: Element[]
  contexte: ContexteToile
  position: { x: number; y: number }
}) {
  const parType = new Map<string, Element[]>()
  for (const e of elements) parType.set(e.contenu.type, [...(parType.get(e.contenu.type) ?? []), e])
  const blocs = [...parType].flatMap(([type, els]) => {
    const Outils = definition(els[0]!.contenu.type)?.Outils
    return Outils ? [<Outils key={type} elements={els} contexte={contexte} />] : []
  })
  const communs = tousLesOutilsCommuns().map((O, i) => <O key={`c${i}`} elements={elements} contexte={contexte} />)
  if (blocs.length === 0 && communs.length === 0) return null
  return (
    <div
      className="notak-barre-selection"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {blocs}
      {communs}
    </div>
  )
}
