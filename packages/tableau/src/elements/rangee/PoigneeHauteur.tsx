import { type RefObject, useRef } from 'react'
import { type Hauteur, hauteurTiree, memeHauteur } from '../../coeur/hauteur'
import type { Element, Operation } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { t } from '../../langue'

/** La hauteur que demande le contenu d'une carte, plafond ou non (px du plan). */
function hauteurNaturelle(carte: HTMLElement): number {
  const contenu = carte.firstElementChild as HTMLElement | null
  const style = getComputedStyle(carte)
  return (contenu?.offsetHeight ?? 0) + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
}

interface Geste {
  depart: Hauteur | undefined
  /** Ce qui est posé en ce moment (le geste n'est inscrit qu'au relâchement). */
  courante: Hauteur | undefined
  y: number
  hauteur: number
  echelle: number
}

/**
 * La poignée de hauteur d'un élément rangé dans une colonne, au bas de sa carte : on la tire, la carte suit, et le
 * geste n'entre dans l'historique qu'au relâchement. Mêmes règles que la poignée du coin d'un élément libre
 * (`hauteurTiree` : calée sur la grille, jamais sous une ligne, rendue au contenu quand elle en est proche). Un
 * double-clic rend la hauteur au contenu. Les boutons « Hauteur − / + » de la barre font la même chose, d'un cran.
 */
export function PoigneeHauteur({ element, carte, contexte }: { element: Element; carte: RefObject<HTMLDivElement | null>; contexte: ContexteToile }) {
  const geste = useRef<Geste | null>(null)
  const { magasin } = contexte

  const poser = (g: Geste, vers: Hauteur | undefined) => {
    if (memeHauteur(g.courante, vers)) return
    magasin.appliquerSeulement([{ type: 'borner', id: element.id, de: g.courante ?? null, vers: vers ?? null }])
    g.courante = vers
  }
  const finir = (annuler: boolean) => {
    const g = geste.current
    geste.current = null
    if (!g) return
    if (annuler) return poser(g, g.depart)
    if (!memeHauteur(g.depart, g.courante)) magasin.inscrire([{ type: 'borner', id: element.id, de: g.depart ?? null, vers: g.courante ?? null }])
  }

  return (
    <div
      className="notak-poignee-hauteur"
      data-poignee-hauteur
      role="separator"
      aria-orientation="horizontal"
      aria-label={t('hauteur.titre')}
      title={t('hauteur.poignee')}
      onPointerDown={(e) => {
        const noeud = carte.current
        if (e.button !== 0 || !noeud) return
        // Ni glisser de l'élément, ni sélection : la poignée n'est pas la carte.
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const r = noeud.getBoundingClientRect()
        const courante = magasin.lire().elements.find((x) => x.id === element.id)?.hauteur
        geste.current = {
          depart: courante,
          courante,
          y: e.clientY,
          hauteur: noeud.offsetHeight,
          // La toile peut être zoomée : on tire en pixels d'écran, la carte se mesure dans le plan.
          echelle: noeud.offsetHeight > 0 && r.height > 0 ? r.height / noeud.offsetHeight : 1,
        }
      }}
      onPointerMove={(e) => {
        const g = geste.current
        const noeud = carte.current
        if (!g || !noeud) return
        const tiree = g.hauteur + (e.clientY - g.y) / g.echelle
        poser(g, hauteurTiree(tiree, hauteurNaturelle(noeud)))
      }}
      onPointerUp={() => finir(false)}
      onPointerCancel={() => finir(true)}
      onLostPointerCapture={() => finir(false)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        const actuelle = magasin.lire().elements.find((x) => x.id === element.id)?.hauteur
        if (actuelle) magasin.faire([{ type: 'borner', id: element.id, de: actuelle, vers: null } satisfies Operation])
      }}
    />
  )
}
