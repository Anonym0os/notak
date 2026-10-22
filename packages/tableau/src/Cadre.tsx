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

/** La place que garde, jusqu'au dépôt, un élément qu'on a tiré de sa colonne : son rang et sa hauteur (px du plan). */
export interface Empreinte {
  id: Id
  parent: Id
  ordre?: string
  hauteur: number
}

/** Ce que la toile prête aux conteneurs (une colonne) pour dessiner leurs éléments rangés. */
export interface Rangement {
  elements: readonly Element[]
  empreintes: readonly Empreinte[]
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

/** Les empreintes laissées dans ce conteneur par ce qu'on en a tiré. */
export function useEmpreintes(parent: Id): Empreinte[] {
  const empreintes = useContext(ContexteRangement)?.empreintes
  return useMemo(() => (empreintes ?? []).filter((e) => e.parent === parent), [empreintes, parent])
}

/** Dessine des éléments rangés, pleine largeur du conteneur, et les empreintes de ceux qu'on en a tirés. */
export function Rangees({ enfants, empreintes = [], contexte }: { enfants: readonly Element[]; empreintes?: readonly Empreinte[]; contexte: ContexteToile }) {
  const r = useContext(ContexteRangement)
  if (!r) return null
  const suite = [...enfants.map((e) => ({ e, ordre: e.ordre })), ...empreintes.map((p) => ({ p, ordre: p.ordre }))].sort((a, b) =>
    comparerOrdre(a.ordre, b.ordre),
  )
  return (
    <>
      {suite.map((x) =>
        'p' in x ? (
          <div key={`empreinte:${x.p.id}`} className="notak-empreinte" style={{ height: x.p.hauteur }} aria-hidden />
        ) : (
          <Rangee key={x.e.id} e={x.e} r={r} contexte={contexte} />
        ),
      )}
    </>
  )
}

function Rangee({ e, r, contexte }: { e: Element; r: Rangement; contexte: ContexteToile }) {
  return (
    <Cadre
      element={e}
      mode="liste"
      choisie={r.selection.has(e.id)}
      enEdition={r.edition === e.id}
      contexte={contexte}
      brouillon={r.brouillon}
      changer={r.changer}
    />
  )
}
