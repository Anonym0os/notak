import { type CSSProperties, type RefObject, createContext, memo, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PX_PAR_UG } from './coeur/camera'
import { comparerOrdre } from './coeur/ordre'
import type { Contenu, Element, Id } from './coeur/tableau'
import { Decor, Pastille } from './elements/decor/Decor'
import { passeLeFiltre, peutEtreIcone } from './elements/decor/annotations'
import { useFiltre } from './elements/decor/etat'
import { teinteDeCarte } from './elements/couleur/teinte'
import { definition } from './elements/registre'
import { PoigneeHauteur } from './elements/rangee/PoigneeHauteur'
import type { ContexteToile } from './elements/types'

interface Props {
  element: Element
  choisie: boolean
  /** Le seul élément choisi, libre de ses gestes. */
  seule?: boolean
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
export const Cadre = memo(function Cadre({ element, choisie, seule, enEdition, contexte, mode = 'toile', poignee, audessus, brouillon, changer }: Props) {
  const noeud = useRef<HTMLDivElement>(null)
  const filtre = useFiltre()
  const def = definition(element.contenu.type)
  if (!def) return null
  // Replié en icône tant qu'on ne l'édite pas ; un filtre par étiquettes estompe ce qui n'en porte aucune des voulues
  // (un conteneur reste net : ce qu'il range peut, lui, correspondre).
  const icone = element.affichage === 'icone' && !enEdition && peutEtreIcone(def)
  const attenue = filtre.size > 0 && !def.accepte && !passeLeFiltre(element, filtre)
  const sansFond = typeof def.sansFond === 'function' ? def.sansFond(element.contenu) : def.sansFond
  const { Rendu } = def
  const teinte = teinteDeCarte(def.teinte, element.contenu)
  // En édition, la note s'étend le temps d'écrire ; le plafond revient à la sortie.
  const h = def.hauteurBornable && !icone ? element.hauteur : undefined
  const plafond = h && 'max' in h && !enEdition ? h.max * PX_PAR_UG : undefined
  const plancher = h && 'min' in h ? h.min * PX_PAR_UG : undefined
  // Rangé dans une colonne, il n'a pas la poignée du coin : celle du bas règle sa hauteur.
  const rangeReglable =
    mode === 'liste' && !!def.hauteurBornable && !icone && !enEdition && !element.verrou && !contexte.services.lectureSeule && !contexte.services.presentation
  const retrait = def.retraitPx?.(element.contenu) ?? 0
  const place: CSSProperties =
    mode === 'toile'
      ? { left: element.x * PX_PAR_UG, top: element.y * PX_PAR_UG, width: element.largeur * PX_PAR_UG - retrait }
      : { position: 'relative' }
  return (
    <div
      ref={noeud}
      className="notak-carte"
      data-id={element.id}
      data-type={element.contenu.type}
      data-choisie={choisie || undefined}
      data-edition={enEdition || undefined}
      data-sans-fond={sansFond || undefined}
      data-audessus={audessus || undefined}
      data-plafond={plafond !== undefined || undefined}
      data-verrou={element.verrou || undefined}
      data-icone={icone || undefined}
      data-attenue={attenue || undefined}
      data-teinte={teinte ? '' : undefined}
      style={{ ...place, ...teinte, ...(plafond !== undefined ? { maxHeight: plafond } : {}), ...(plancher !== undefined ? { minHeight: plancher } : {}) }}
    >
      {icone ? (
        <Pastille element={element} contexte={contexte} />
      ) : (
        <Rendu
          element={element}
          choisie={choisie}
          {...(seule ? { seule } : {})}
          enEdition={enEdition}
          contexte={contexte}
          brouillon={(c) => brouillon(element, c)}
          changer={(c) => changer(element, c)}
        />
      )}
      {plafond !== undefined && <Voile carte={noeud} />}
      <Decor element={element} contexte={contexte} mode={mode} />
      {poignee && !def.sansPoignee?.(element.contenu) && <div className="notak-poignee" data-poignee aria-hidden />}
      {rangeReglable && <PoigneeHauteur element={element} carte={noeud} contexte={contexte} />}
    </div>
  )
})

/** Le dégradé qui cache le bas d'un contenu plus haut que son plafond ; rien tant que tout tient. */
function Voile({ carte }: { carte: RefObject<HTMLDivElement | null> }) {
  const [deborde, setDeborde] = useState(false)
  useLayoutEffect(() => {
    const c = carte.current
    const contenu = c?.firstElementChild
    if (!c || !contenu) return
    // Le contenu seul, sans la bande des étiquettes qui déborde exprès sous la carte.
    const mesurer = () => setDeborde(contenu instanceof HTMLElement && contenu.offsetTop + contenu.offsetHeight > c.clientHeight + 1)
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(c)
    obs.observe(contenu)
    return () => obs.disconnect()
  }, [carte])
  return <div className="notak-voile" data-montre={deborde || undefined} aria-hidden />
}

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
      seule={r.selection.size === 1 && r.selection.has(e.id) && !e.verrou && r.edition === null && !contexte.services.lectureSeule}
      enEdition={r.edition === e.id}
      contexte={contexte}
      brouillon={r.brouillon}
      changer={r.changer}
    />
  )
}
