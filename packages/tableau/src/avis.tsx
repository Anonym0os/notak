import { useEffect, useSyncExternalStore } from 'react'
import { t } from './langue'
import { Icone } from './icones'

/**
 * Les avis en bas de la toile : une phrase courte (« Mis à la corbeille »), parfois un bouton qui défait le
 * geste. Un seul à la fois : le suivant remplace le précédent. Il part seul après quelques secondes.
 */
export type Avis = {
  texte: string
  action?: { libelle: string; faire(): void }
  /** D'autres boutons, avant `action` (« Voir », puis « Annuler »). */
  actions?: { libelle: string; faire(): void }[]
}

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
      {[...(avis.actions ?? []), ...(avis.action ? [avis.action] : [])].map((a) => (
        <button
          key={a.libelle}
          type="button"
          onClick={() => {
            retirerAvis()
            a.faire()
          }}
        >
          {a.libelle}
        </button>
      ))}
      <button type="button" className="notak-avis-fermer" aria-label={t('commun.fermer')} onClick={retirerAvis}>
        <Icone nom="fermer" />
      </button>
    </div>
  )
}
