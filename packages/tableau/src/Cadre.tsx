import { createContext, memo, useContext, useMemo } from 'react'
import { PX_PAR_UG } from './coeur/camera'
import { comparerOrdre } from './coeur/ordre'
import type { Contenu, Element, Id } from './coeur/tableau'
import { definition } from './elements/registre'
import type { ContexteToile } from './elements/types'

interface Props {
  element: Element
  choisie: boolean
  enEdition: boolean
  contexte: ContexteToile
  /** `toile` : posé à sa position. `liste` : dans le flux d'un conteneur (une colonne). */
  mode?: 'toile' | 'liste'
  /** Montre la poignée de redimensionnement (élément seul choisi, libre, hors édition). */
  poignee?: boolean
  /** Pendant un glisser : l'élément passe au-dessus de tout. */
  audessus?: boolean
  brouillon(element: Element, apres: Contenu): void
  changer(element: Element, apres: Contenu): void
}

/** Le cadre commun d'un élément : position, largeur, fond, ombre, sélection. Le type dessine dedans. */
export const Cadre = memo(function Cadre({ element, choisie, enEdition, contexte, mode = 'toile', poignee, audessus, brouillon, changer }: Props) {
  const def = definition(element.contenu.type)
  if (!def) return null
  const sansFond = typeof def.sansFond === 'function' ? def.sansFond(element.contenu) : def.sansFond
  const { Rendu } = def
  return (
    <div
      className="notak-carte"
      data-id={element.id}
      data-type={element.contenu.type}
      data-choisie={choisie || undefined}
      data-edition={enEdition || undefined}
      data-sans-fond={sansFond || undefined}
      data-audessus={audessus || undefined}
      style={
        mode === 'toile'
          ? { left: element.x * PX_PAR_UG, top: element.y * PX_PAR_UG, width: element.largeur * PX_PAR_UG }
          : { position: 'relative' }
      }
    >
      <Rendu
        element={element}
        choisie={choisie}
        enEdition={enEdition}
        contexte={contexte}
        brouillon={(c) => brouillon(element, c)}
        changer={(c) => changer(element, c)}
      />
      {poignee && <div className="notak-poignee" data-poignee aria-hidden />}
    </div>
  )
})

/** Ce que la toile prête aux conteneurs (une colonne) pour dessiner leurs éléments rangés. */
export interface Rangement {
  elements: readonly Element[]
  selection: ReadonlySet<Id>
  edition: Id | null
  brouillon(element: Element, apres: Contenu): void
  changer(element: Element, apres: Contenu): void
}

export const ContexteRangement = createContext<Rangement | null>(null)

/** Les éléments rangés dans ce conteneur, dans l'ordre de leur clé. */
export function useRanges(parent: Id): Element[] {
  const elements = useContext(ContexteRangement)?.elements
  return useMemo(
    () => (elements ?? []).filter((e) => e.parent === parent).sort((a, b) => comparerOrdre(a.ordre, b.ordre)),
    [elements, parent],
  )
}

/** Dessine des éléments rangés, pleine largeur du conteneur. */
export function Rangees({ enfants, contexte }: { enfants: readonly Element[]; contexte: ContexteToile }) {
  const r = useContext(ContexteRangement)
  if (!r) return null
  return (
    <>
      {enfants.map((e) => (
        <Cadre
          key={e.id}
          element={e}
          mode="liste"
          choisie={r.selection.has(e.id)}
          enEdition={r.edition === e.id}
          contexte={contexte}
          brouillon={r.brouillon}
          changer={r.changer}
        />
      ))}
    </>
  )
}
