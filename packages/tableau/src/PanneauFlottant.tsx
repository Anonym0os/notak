import { type HTMLAttributes, type ReactNode, type Ref, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SANS_ZONES, type Zones, zonesSures } from './zones'
import './communs/popover.css'
import './panneauFlottant.css'

/**
 * Le popover commun de Notak (dessiné par `.notak-pop` avec `surface`, communs/popover.css) : une fenêtre accrochée à ce qui l'a
 * ouverte (une puce de tâche, un bouton d'un fil, le curseur d'une note) : elle la suit à chaque image, quand la toile
 * défile ou zoome, au lieu de rester clouée là où elle s'est ouverte.
 *
 * Elle se pose du côté voulu de sa cible (dessous par défaut), centrée sur elle, à `distance` px, une petite flèche
 * tournée vers elle ; s'il n'y a pas la place de ce côté, elle passe du côté opposé. Elle reste dans la fenêtre (10 px des côtés, 20 px du haut et du bas) et, pour une cible
 * posée sur la toile, dans la toile. Une cible qui sort de la toile, ou qui disparaît, la cache sans la fermer : elle
 * revient quand la cible revient.
 */

export type Cote = 'bas' | 'haut' | 'droite' | 'gauche'

interface Boite {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Placement {
  left: number
  top: number
  /** De quel côté de la cible elle se trouve. */
  cote: Cote
  /** La place de la flèche le long du bord tourné vers la cible : depuis la gauche (dessous, dessus) ou le haut (à côté). */
  fleche: number
}

export interface OptionsPlacement {
  /** Le côté voulu ; l'autre sert s'il n'y a pas la place. */
  cote?: Cote
  /** L'écart entre la cible et le panneau, en px. */
  distance?: number
  /** Centrée sur la cible (défaut), ou alignée sur son bord de départ (gauche, ou haut à côté). */
  alignement?: 'centre' | 'debut'
  /** Ce qu'on voit de la toile, pour une cible posée dessus : hors de là, le panneau se cache. */
  bornes?: Boite
  /** Les zones sûres de l'écran, ajoutées aux marges : rien ne passe sous l'encoche ni la barre d'accueil. */
  zones?: Zones
}

/** Les marges gardées entre le panneau et les bords de la fenêtre, en px. */
export const MARGES = { gauche: 10, droite: 10, haut: 20, bas: 20 }
export const FLECHE = { largeur: 13, hauteur: 8 }

const serrer = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))

/**
 * Où poser un panneau de `taille` pour cette `cible` dans une fenêtre de `fenetre` px ; `null` s'il doit se cacher
 * (cible vide, hors de la toile, ou trop près d'un bord pour que la flèche la montre encore).
 */
export function placer(
  cible: Boite,
  taille: { largeur: number; hauteur: number },
  fenetre: { largeur: number; hauteur: number },
  { cote = 'bas', distance = 10, alignement = 'centre', bornes, zones = SANS_ZONES }: OptionsPlacement = {},
): Placement | null {
  if (cible.right - cible.left <= 0 && cible.bottom - cible.top <= 0) return null
  if (bornes && (cible.left < bornes.left || cible.right > bornes.right || cible.top < bornes.top || cible.bottom > bornes.bottom)) return null
  // Les marges, élargies à la toile quand la cible y est : le panneau ne déborde pas sur les barres.
  const g = Math.max(MARGES.gauche + zones.gauche, bornes?.left ?? 0)
  const d = Math.max(MARGES.droite + zones.droite, fenetre.largeur - (bornes?.right ?? fenetre.largeur))
  const h = Math.max(MARGES.haut + zones.haut, bornes?.top ?? 0)
  const b = Math.max(MARGES.bas + zones.bas, fenetre.hauteur - (bornes?.bottom ?? fenetre.hauteur))
  // La flèche doit pouvoir montrer la cible : dessous ou dessus, la cible tient entre les marges des côtés ; à côté, entre celles du haut et du bas.
  const enLargeur = cote === 'bas' || cote === 'haut'
  if (enLargeur ? cible.bottom <= 0 || cible.top >= fenetre.hauteur || cible.left < g || cible.right > fenetre.largeur - d : cible.right <= 0 || cible.left >= fenetre.largeur || cible.top < h || cible.bottom > fenetre.hauteur - b) return null
  const vertical = (y: number) => serrer(y, h, fenetre.hauteur - taille.hauteur - b)
  const horizontal = (x: number) => serrer(x, g, fenetre.largeur - taille.largeur - d)
  const milieuX = (cible.left + cible.right) / 2
  const milieuY = (cible.top + cible.bottom) / 2
  if (cote === 'bas' || cote === 'haut') {
    const dessous = vertical(cible.bottom + distance)
    const dessus = vertical(cible.top - taille.hauteur - distance)
    // Repoussé contre le bord au point de mordre sur la cible : il passe de l'autre côté.
    const sens: Cote = cote === 'bas' ? (dessous - distance < cible.bottom ? 'haut' : 'bas') : dessus + taille.hauteur > cible.top - distance ? 'bas' : 'haut'
    const left = horizontal(alignement === 'centre' ? milieuX - taille.largeur / 2 : cible.left)
    const fleche = serrer(milieuX - left - FLECHE.largeur / 2, 6, Math.max(6, taille.largeur - 6 - FLECHE.largeur))
    return { left, top: sens === 'bas' ? dessous : dessus, cote: sens, fleche }
  }
  const aDroite = horizontal(cible.right + distance)
  const aGauche = horizontal(cible.left - taille.largeur - distance)
  const sens: Cote = cote === 'droite' ? (aDroite - distance < cible.right ? 'gauche' : 'droite') : aGauche + taille.largeur > cible.left - distance ? 'droite' : 'gauche'
  const top = vertical(alignement === 'centre' ? milieuY - taille.hauteur / 2 : cible.top)
  const fleche = serrer(milieuY - top - FLECHE.largeur / 2, 6, Math.max(6, taille.hauteur - 6 - FLECHE.largeur))
  return { left: sens === 'droite' ? aDroite : aGauche, top, cote: sens, fleche }
}

/** Ce que vise le panneau : un élément (relu à chaque image) ou un rectangle d'écran déjà calculé. */
export type Cible = () => Element | Boite | null | undefined

const cibles = new WeakMap<Element, Cible>()

/** Une feuille ouverte depuis un bouton (au téléphone) compte comme ce bouton : un appui dedans n'est pas « dehors ». */
export const rattacher = (feuille: Element, cible: Cible) => void cibles.set(feuille, cible)

/**
 * Le nœud qui compte pour un appui tombé dans un panneau : sa cible (remontée de panneau en panneau). Un menu qui se
 * referme au clic dehors garde ainsi ouvert ce qu'un panneau ouvert depuis lui contient.
 */
export function horsPanneau(noeud: Node | null): Node | null {
  let n = noeud
  for (let i = 0; i < 8 && n; i++) {
    const panneau = (n instanceof Element ? n : n.parentElement)?.closest('.notak-panneau-flottant, .notak-tiroir-bas-calque')
    const c = panneau && cibles.get(panneau)?.()
    if (!(c instanceof Element)) return n
    n = c
  }
  return n
}

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  cible: Cible
  /** Où le panneau se range dans le document ; `document.body` par défaut. */
  hote?: HTMLElement | null
  cote?: Cote
  distance?: number
  alignement?: 'centre' | 'debut'
  /**
   * Le dessin du popover commun (fond, rayon 14, une ombre : `.notak-pop`). Un panneau qui n'est que le porteur d'une
   * carte qui se dessine elle-même (un menu, une bulle) ne le prend pas, pour ne pas doubler sa surface.
   */
  surface?: boolean
  /** La petite flèche tournée vers la cible ; oui par défaut. */
  fleche?: boolean
  /** Le panneau garde le côté pris à sa première pose tant qu'il reste ouvert : il ne va-et-vient pas quand sa taille change. */
  garderCote?: boolean
  /** Le nœud du panneau, pour qui doit savoir si un clic tombe dedans. */
  panneau?: Ref<HTMLDivElement>
  children: ReactNode
}

export function PanneauFlottant({ cible, hote, cote, distance, alignement, fleche = true, garderCote = false, surface = false, panneau, className, children, ...reste }: Props) {
  const noeud = useRef<HTMLDivElement | null>(null)
  const viser = useRef(cible)
  viser.current = cible
  useLayoutEffect(() => {
    let image = 0
    let pris: Cote | undefined
    const zones = zonesSures()
    const suivre = () => {
      const div = noeud.current
      if (!div) return
      const c = viser.current()
      const boite = c instanceof Element ? (c.isConnected ? c.getBoundingClientRect() : null) : (c ?? null)
      // Une cible posée sur la toile n'est montrée que tant qu'on la voit dans la toile.
      const toile = c instanceof Element && c.closest('.notak-plan') ? c.closest('.notak-toile') : null
      const p =
        boite &&
        placer(boite, { largeur: div.offsetWidth, hauteur: div.offsetHeight }, { largeur: window.innerWidth, hauteur: window.innerHeight }, {
          ...((pris ?? cote) ? { cote: pris ?? cote } : {}),
          ...(distance !== undefined ? { distance } : {}),
          ...(alignement ? { alignement } : {}),
          ...(toile ? { bornes: toile.getBoundingClientRect() } : {}),
          zones,
        })
      if (!p) div.style.visibility = 'hidden'
      else {
        div.style.visibility = ''
        div.style.left = `${p.left}px`
        div.style.top = `${p.top}px`
        div.style.setProperty('--notak-fleche', `${p.fleche}px`)
        div.dataset.cote = p.cote
        if (garderCote) pris ??= p.cote
      }
      image = requestAnimationFrame(suivre)
    }
    suivre()
    return () => cancelAnimationFrame(image)
  }, [cote, distance, alignement, garderCote])
  const attacher = (n: HTMLDivElement | null) => {
    noeud.current = n
    if (n) cibles.set(n, () => viser.current())
    if (typeof panneau === 'function') panneau(n)
    else if (panneau) panneau.current = n
  }
  return createPortal(
    <div ref={attacher} className={`notak-panneau-flottant${surface ? ' notak-pop' : ''} ${className ?? ''}`} style={{ visibility: 'hidden' }} {...reste}>
      {fleche && <span className="notak-panneau-fleche" aria-hidden />}
      {children}
    </div>,
    hote ?? document.body,
  )
}
