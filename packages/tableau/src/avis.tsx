import { useEffect, useSyncExternalStore } from 'react'

/**
 * Les avis en bas de la toile : une phrase courte (« Mis à la corbeille »), parfois un bouton qui défait le
 * geste. Un seul à la fois : le suivant remplace le précédent. Il part seul après quelques secondes.
 */
export type Avis = { texte: string; action?: { libelle: string; faire(): void } }

const DUREE = 5000

let courant: (Avis & { n: number }) | null = null
let compte = 0
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((f) => f())
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

export function annoncer(avis: Avis) {
  courant = { ...avis, n: ++compte }
  prevenir()
}

export function retirerAvis() {
  if (!courant) return
  courant = null
  prevenir()
}

export function BandeauAvis() {
  const avis = useSyncExternalStore(ecouter, () => courant)
  useEffect(() => {
    if (!avis) return
    const n = avis.n
    const minuteur = setTimeout(() => courant?.n === n && retirerAvis(), DUREE)
    return () => clearTimeout(minuteur)
  }, [avis])
  if (!avis) return null
  return (
    <div className="notak-avis" role="status" key={avis.n} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <span>{avis.texte}</span>
      {avis.action && (
        <button
          type="button"
          onClick={() => {
            retirerAvis()
            avis.action!.faire()
          }}
        >
          {avis.action.libelle}
        </button>
      )}
      <button type="button" className="notak-avis-fermer" aria-label="Fermer" onClick={retirerAvis}>
        ×
      </button>
    </div>
  )
}
