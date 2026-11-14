import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react'
import { t } from './langue'
import { Icone } from './icones'

/**
 * Les avis en bas de la toile : une phrase courte (« Mis à la corbeille »), parfois un bouton qui défait le
 * geste. Un seul à la fois : le suivant remplace le précédent. Il part seul après quelques secondes. Un plein écran
 * posé sur la toile (la visionneuse, le PDF, un fichier en grand) montre l'avis lui-même, par-dessus lui : celui de
 * la toile, qu'il cache, se tait le temps qu'il est ouvert.
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

/** Les pleins écrans ouverts qui montrent l'avis (`<BandeauAvis enGrand />`). */
let pleinsEcrans = 0
const abonnesPleinsEcrans = new Set<() => void>()
const ecouterPleinsEcrans = (f: () => void) => {
  abonnesPleinsEcrans.add(f)
  return () => abonnesPleinsEcrans.delete(f)
}
const compterPleinEcran = (n: number) => {
  pleinsEcrans += n
  abonnesPleinsEcrans.forEach((f) => f())
}

export function retirerAvis() {
  if (!courant) return
  courant = null
  prevenir()
}

/** `enGrand` : celui d'un plein écran, au-dessus de sa barre ; tant qu'il est là, celui de la toile ne se montre pas. */
export function BandeauAvis({ enGrand = false }: { enGrand?: boolean } = {}) {
  const avis = useSyncExternalStore(ecouter, () => courant)
  const couverte = useSyncExternalStore(ecouterPleinsEcrans, () => pleinsEcrans > 0)
  useLayoutEffect(() => {
    if (!enGrand) return
    compterPleinEcran(1)
    return () => compterPleinEcran(-1)
  }, [enGrand])
  useEffect(() => {
    if (!avis) return
    const n = avis.n
    const minuteur = setTimeout(() => courant?.n === n && retirerAvis(), DUREE)
    return () => clearTimeout(minuteur)
  }, [avis])
  if (!avis || (couverte && !enGrand)) return null
  return (
    <div
      className="notak-avis"
      role="status"
      key={avis.n}
      data-en-grand={enGrand || undefined}
      data-garder={enGrand || undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
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
