import { type HTMLAttributes, type ReactNode, type RefObject, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type AlignementFlottant, type Boite, type CoteFlottant, MARGE_FENETRE, type PlaceFlottant, type Taille, placerFlottant } from './geometrieMenus'

/**
 * Tout ce qui flotte dans la carte (menus, listes, popovers, réglages) passe par ici : une seule règle de placement
 * (`placerFlottant`, geometrieMenus.ts), appliquée à la taille mesurée de la fenêtre, et posée en `position: fixed` dans
 * le fond de la carte, hors de tout parent qui rogne (`overflow: hidden`) ou qui déplace le repère (flou, transformation).
 * Elle se replace quand la fenêtre change de taille, quand l'ancre bouge et quand son contenu change de taille.
 */

/**
 * Ce qui ancre une fenêtre : un élément (son rectangle se relit à chaque calcul), ou une boîte ou un point en px de la
 * fenêtre (un clic droit, le coin d'un sujet).
 */
export type CibleFlottant = (Pick<Element, 'getBoundingClientRect'> & { closest?: Element['closest'] }) | Boite

/**
 * La taille de la fenêtre flottante, quand on ne veut pas la lire dans la mise en page. Par défaut, c'est le DOM qui la
 * dit ; un environnement sans mise en page (jsdom) y met la sienne.
 */
export const MesureFlottant = createContext<((noeud: HTMLElement) => Taille) | null>(null)

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Ce qu'elle accompagne ; sans ancre, rien ne s'affiche. */
  ancre: CibleFlottant | null | undefined
  /** Le côté voulu de l'ancre (`bas` par défaut) ; elle se retourne de l'autre côté si elle sort de la fenêtre. */
  cote?: CoteFlottant | undefined
  alignement?: AlignementFlottant | undefined
  /** L'écart avec l'ancre, 6 px par défaut. */
  ecart?: number | undefined
  /** Ajouté à la position sur l'autre axe de l'ancre. */
  decalage?: number | undefined
  /** Un sélecteur : pour un côté `gauche` ou `droite`, l'étendue horizontale de l'ancêtre qui le porte (un panneau) remplace celle de l'ancre. */
  bord?: string | undefined
  /** Sa largeur en px, ou `ancre` : celle de l'ancre. Sans elle, le contenu décide. */
  largeur?: number | 'ancre' | undefined
  /** Sa hauteur en px quand la mise en page ne la dit pas (jamais utilisée dans un navigateur). */
  hauteur?: number | undefined
  /** Son nœud, pour qui doit savoir si un clic est dedans. */
  racine?: RefObject<HTMLDivElement | null> | undefined
  /** Où la poser. Par défaut le fond de la carte ouverte. */
  hote?: Element | null | undefined
  children: ReactNode
}

const estElement = (c: CibleFlottant): c is Pick<Element, 'getBoundingClientRect'> => 'getBoundingClientRect' in c

const boiteDe = (c: CibleFlottant): Boite => {
  if (!estElement(c)) return c
  const r = c.getBoundingClientRect()
  return { x: r.left, y: r.top, l: r.width, h: r.height }
}

/** Le repère de la fenêtre : la fenêtre du navigateur, ou le fond de la carte quand il n'en couvre pas toute la surface. */
function cadreDe(hote: Element | null): Boite {
  const plein = { x: 0, y: 0, l: window.innerWidth, h: window.innerHeight }
  if (!hote || hote === document.body) return plein
  const r = hote.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, l: r.width, h: r.height } : plein
}

/**
 * Le fond de la carte qui porte l'ancre (une boîte ou un point n'en ont pas : la carte ouverte est unique, c'est elle).
 * Sans carte ouverte (un composant monté seul), la fenêtre reste en place.
 */
const hoteDe = (ancre: CibleFlottant | null | undefined, hote: Element | null | undefined): Element | null => {
  if (hote) return hote
  if (ancre && estElement(ancre)) return ancre.closest?.('.notak-arbre-fond') ?? ancre.closest?.('.notak-arbre-fenetre') ?? null
  return document.querySelector('.notak-arbre-fond')
}

const memePlace = (a: PlaceFlottant | null, b: PlaceFlottant) => !!a && a.x === b.x && a.y === b.y && a.l === b.l && a.h === b.h && a.cote === b.cote && a.borneH === b.borneH && a.borneL === b.borneL

export function Flottant({ ancre, cote = 'bas', alignement = 'debut', ecart, decalage, bord, largeur, hauteur, racine, hote: hoteVoulu, style, children, ...reste }: Props) {
  const propre = useRef<HTMLDivElement>(null)
  const ref = racine ?? propre
  const mesure = useContext(MesureFlottant)
  const [place, setPlace] = useState<PlaceFlottant | null>(null)
  const hote = hoteDe(ancre, hoteVoulu)

  const calculer = () => {
    const el = ref.current
    if (!el || !ancre) return
    const cadre = cadreDe(hote)
    const a = boiteDe(ancre)
    let repere: Boite = { x: a.x - cadre.x, y: a.y - cadre.y, l: a.l, h: a.h }
    const porteur = bord && estElement(ancre) ? ancre.closest?.(bord) : null
    if (porteur) {
      const r = porteur.getBoundingClientRect()
      repere = { ...repere, x: r.left - cadre.x, l: r.width }
    }
    // Sa taille naturelle : posée en 0,0, libre de toute limite de hauteur posée par la règle, jamais plus large que la fenêtre.
    const sauve = { left: el.style.left, top: el.style.top, maxHeight: el.style.maxHeight, maxWidth: el.style.maxWidth }
    el.style.left = '0px'
    el.style.top = '0px'
    el.style.maxHeight = ''
    el.style.maxWidth = `${Math.max(0, cadre.l - 2 * MARGE_FENETRE)}px`
    if (largeur === 'ancre') el.style.width = `${a.l}px`
    const lue = mesure ? mesure(el) : { l: el.offsetWidth, h: el.offsetHeight }
    el.style.left = sauve.left
    el.style.top = sauve.top
    el.style.maxHeight = sauve.maxHeight
    el.style.maxWidth = sauve.maxWidth
    const taille = { l: lue.l || (typeof largeur === 'number' ? largeur : 0), h: lue.h || hauteur || 0 }
    const p = placerFlottant(repere, taille, { l: cadre.l, h: cadre.h }, { cote, alignement, ...(ecart !== undefined ? { ecart } : {}), ...(decalage !== undefined ? { decalage } : {}) })
    setPlace((avant) => (memePlace(avant, p) ? avant : p))
  }
  const dernier = useRef(calculer)
  dernier.current = calculer
  // À chaque rendu : le contenu a pu changer, l'ancre aussi. Le calcul ne réécrit l'état que si la place change.
  useLayoutEffect(calculer)
  // Hors rendu : la fenêtre change de taille, un parent défile, la fenêtre ou son ancre changent de taille.
  const element = ancre && estElement(ancre) && typeof Element !== 'undefined' && ancre instanceof Element ? ancre : null
  useLayoutEffect(() => {
    if (!ancre) return
    const relire = () => dernier.current()
    const defile = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) relire()
    }
    window.addEventListener('resize', relire)
    window.addEventListener('scroll', defile, true)
    let observateur: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observateur = new ResizeObserver(relire)
      if (ref.current) observateur.observe(ref.current)
      if (element) observateur.observe(element)
    }
    return () => {
      window.removeEventListener('resize', relire)
      window.removeEventListener('scroll', defile, true)
      observateur?.disconnect()
    }
    // Une boîte ou un point change de visage à chaque rendu sans changer d'avis : seul compte qu'il y ait une ancre, et quel élément.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!ancre, element, ref])
  // Fermée avec le clavier chez elle (Échap, un choix), elle le rend à la carte : sans quoi il tombe sur la page et les
  // touches de la carte ne répondent plus jusqu'au prochain clic.
  const fond = useRef<Element | null>(null)
  fond.current = hote?.closest('.notak-arbre-fond') ?? null
  useEffect(
    () => () => {
      const actif = document.activeElement
      if ((!actif || actif === document.body) && fond.current?.isConnected) (fond.current as HTMLElement).focus?.({ preventScroll: true })
    },
    [],
  )

  if (!ancre) return null
  const fenetre = (
    <div
      {...reste}
      ref={ref}
      data-cote={place?.cote}
      data-borne={place?.borneH ? '' : undefined}
      style={{
        ...style,
        position: 'fixed',
        left: place?.x ?? 0,
        top: place?.y ?? 0,
        ...(typeof largeur === 'number' ? { width: largeur } : {}),
        ...(place?.borneH ? { maxHeight: place.h } : {}),
        ...(place?.borneL ? { maxWidth: place.l } : {}),
      }}
    >
      {children}
    </div>
  )
  return hote ? createPortal(fenetre, hote) : fenetre
}
