import { useEffect, useRef, useState } from 'react'
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
 * Échap referme d'abord un menu ouvert dans cette barre (un tiroir, une palette) sans rien désélectionner : `fermer`
 * remet la barre à neuf.
 */
function useEchapFerme(barre: { current: HTMLElement | null }, fermer: () => void) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !barre.current?.querySelector('[aria-expanded="true"]')) return
      e.stopPropagation()
      e.preventDefault()
      fermer()
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [barre, fermer])
}

/**
 * La barre de gauche. Un outil se glisse sur la toile : c'est la toile qui suit le geste (`surAppui`).
 * Un simple clic ne crée rien : l'outil rebondit et une bulle rappelle qu'on le glisse (`rebond`).
 */
export function BarreOutils({
  surAppui,
  rebond,
  corbeille,
  nonTries,
}: {
  surAppui(o: OutilDeBarre, e: React.PointerEvent): void
  rebond: { libelle: string; n: number } | null
  /** La corbeille, en bas de la barre : elle s'ouvre au clic et reçoit ce qu'on y lâche. */
  corbeille: { nombre: number; ouverte: boolean; basculer(): void }
  /** Les non triés, juste au-dessus : Cmd+\ les ouvre aussi. */
  nonTries: { nombre: number; ouverte: boolean; basculer(): void }
}) {
  const [tiroir, setTiroir] = useState(false)
  const nav = useRef<HTMLElement>(null)
  useEchapFerme(nav, () => setTiroir(false))
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
    <nav ref={nav} className="notak-barre-outils" onPointerDown={(e) => e.stopPropagation()}>
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
      <div className="notak-barre-sep" />
      <button type="button" className="notak-outil" aria-expanded={nonTries.ouverte} title="Non triés (⌘\)" onClick={nonTries.basculer}>
        <span className="notak-outil-icone">📥</span>
        <span className="notak-outil-libelle">Non triés{nonTries.nombre > 0 ? ` (${nonTries.nombre})` : ''}</span>
      </button>
      <button
        type="button"
        className="notak-outil"
        data-corbeille
        aria-expanded={corbeille.ouverte}
        title="Corbeille"
        onClick={corbeille.basculer}
      >
        <span className="notak-outil-icone">🗑</span>
        <span className="notak-outil-libelle">Corbeille{corbeille.nombre > 0 ? ` (${corbeille.nombre})` : ''}</span>
      </button>
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
  const [plus, setPlus] = useState(false)
  // Échap referme le menu ouvert : la barre repart de zéro, chaque outil avec ses menus fermés.
  const [cle, setCle] = useState(0)
  const barre = useRef<HTMLDivElement>(null)
  useEchapFerme(barre, () => {
    setPlus(false)
    setCle((c) => c + 1)
  })
  const parType = new Map<string, Element[]>()
  for (const e of elements) parType.set(e.contenu.type, [...(parType.get(e.contenu.type) ?? []), e])
  const blocs = [...parType].flatMap(([type, els]) => {
    const def = definition(type as Element['contenu']['type'])
    const Outils = def?.Outils
    return Outils ? [{ type, nom: def?.nom ?? type, n: els.length, rendu: <Outils key={type} elements={els} contexte={contexte} /> }] : []
  })
  const communs = tousLesOutilsCommuns().map((O, i) => <O key={`c${i}`} elements={elements} contexte={contexte} />)
  // Une sélection d'un seul type montre ses outils ; une sélection mêlée ne montre que ce qui vaut pour tous,
  // et range les outils de chaque type derrière « … ».
  const mele = parType.size > 1
  if (blocs.length === 0 && communs.length === 0) return null
  return (
    <div
      ref={barre}
      key={cle}
      className="notak-barre-selection"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {!mele && blocs.map((b) => b.rendu)}
      {communs}
      {mele && blocs.length > 0 && (
        <span className="notak-barre-plus">
          <button type="button" title="Outils de chaque type" aria-expanded={plus} aria-pressed={plus} onClick={() => setPlus((p) => !p)}>
            …
          </button>
          {plus && (
            <div className="notak-barre-plus-menu" role="menu">
              {blocs.map((b) => (
                <div key={b.type} className="notak-barre-plus-groupe">
                  <span className="notak-barre-plus-nom">
                    {b.nom}
                    {b.n > 1 ? ` (${b.n})` : ''}
                  </span>
                  <div className="notak-barre-plus-outils">{b.rendu}</div>
                </div>
              ))}
            </div>
          )}
        </span>
      )}
    </div>
  )
}
