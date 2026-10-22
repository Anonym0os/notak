import type { Element } from './coeur/tableau'
import { definition, tousLesOutilsCommuns, tousLesTypes } from './elements/registre'
import type { ContexteToile } from './elements/types'

/** La barre de gauche : un outil par type qui en déclare un. Un clic crée l'élément au centre de la vue. */
export function BarreOutils({ contexte, surCreation }: { contexte: ContexteToile; surCreation(ids: string[]): void }) {
  const outils = tousLesTypes().filter((d) => d.outil)
  return (
    <nav className="notak-barre-outils" onPointerDown={(e) => e.stopPropagation()}>
      {outils.map((d) => (
        <button
          key={d.type}
          type="button"
          className="notak-outil"
          title={d.outil!.libelle}
          onClick={() => {
            const pas = d.outil!.creer(contexte.centreVue(), contexte)
            contexte.magasin.faire(pas)
            surCreation(pas.flatMap((op) => (op.type === 'creer' ? [op.element.id] : [])))
          }}
        >
          <span className="notak-outil-icone">{d.outil!.icone}</span>
          <span className="notak-outil-libelle">{d.outil!.libelle}</span>
        </button>
      ))}
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
