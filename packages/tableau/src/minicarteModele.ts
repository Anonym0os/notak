import { useSyncExternalStore } from 'react'

/**
 * La mini-carte des toiles (le tableau, la carte) : tout le contenu en petit, en bas à droite, avec la zone qu'on voit.
 * Un clic ou un glisser dedans y amène la vue.
 *
 * Quand elle paraît, c'est un réglage de chacun. Par défaut, seulement pendant qu'on déplace ou qu'on zoome la vue, et
 * un instant après : Xmind, Milanote et Figma n'en ont pas et laissent la toile nue ; Miro la tient épinglée, ce qui
 * couvre un coin en permanence. Pendant le mouvement, elle sert au moment où l'on cherche son chemin, sans rien
 * cacher le reste du temps. « Toujours » l'épingle comme Miro, « Jamais » la retire.
 */
export type AffichageMinicarte = 'mouvement' | 'toujours' | 'jamais'
export const AFFICHAGES_MINICARTE: readonly AffichageMinicarte[] = ['mouvement', 'toujours', 'jamais']

/** En mouvement, elle reste ce temps après le dernier déplacement de la vue (le temps d'y porter la souris), en ms. */
export const DELAI_MINICARTE = 1500

/** Une boîte, dans le repère de la toile qui la montre (UG pour le tableau, px de carte pour la carte). */
export interface Boite {
  x: number
  y: number
  l: number
  h: number
}

/** La taille la plus grande de la mini-carte, en pixels d'écran ; la plus petite de ses côtés. */
export const MINICARTE_MAX = { l: 200, h: 140 }
const MINICARTE_COTE_MIN = 56
/** Le vide laissé autour du contenu, en part de sa plus grande dimension. */
const MARGE = 0.06

let affichage: AffichageMinicarte = 'mouvement'
const abonnes = new Set<() => void>()

/** L'hôte reporte ici le réglage de la personne : les deux toiles le lisent sans le recevoir en props. */
export function definirAffichageMinicarte(a: AffichageMinicarte | undefined) {
  const v = a ?? 'mouvement'
  if (v === affichage) return
  affichage = v
  for (const f of abonnes) f()
}

const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}
export const useAffichageMinicarte = () => useSyncExternalStore(ecouter, () => affichage, () => affichage)

/** La plus petite boîte qui contient toutes celles-ci ; `null` sans aucune. */
export function englober(boites: readonly Boite[]): Boite | null {
  if (boites.length === 0) return null
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const b of boites) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.l)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, l: x1 - x0, h: y1 - y0 }
}

/** Ce que montre la mini-carte, dans le repère de la toile : le contenu et la vue, avec un peu de vide autour. */
export function mondeMinicarte(contenu: Boite | null, vue: Boite): Boite {
  const tout = englober(contenu ? [contenu, vue] : [vue])!
  const m = Math.max(tout.l, tout.h) * MARGE
  return { x: tout.x - m, y: tout.y - m, l: tout.l + 2 * m, h: tout.h + 2 * m }
}

/**
 * La taille de la mini-carte à l'écran, et son échelle : le monde tient dans 200 × 140 au plus, ses proportions
 * gardées ; un monde très allongé ne la réduit pas sous 56 px de côté (il y flotte, centré).
 */
export function cadreMinicarte(monde: Boite): { l: number; h: number; k: number; dx: number; dy: number } {
  const k = Math.min(MINICARTE_MAX.l / Math.max(monde.l, 1e-9), MINICARTE_MAX.h / Math.max(monde.h, 1e-9))
  const l = Math.max(MINICARTE_COTE_MIN, monde.l * k)
  const h = Math.max(MINICARTE_COTE_MIN, monde.h * k)
  return { l, h, k, dx: (l - monde.l * k) / 2, dy: (h - monde.h * k) / 2 }
}

/** Le point de la toile sous un point de la mini-carte (px depuis son coin haut-gauche). */
export function versToile(monde: Boite, p: { x: number; y: number }): { x: number; y: number } {
  const c = cadreMinicarte(monde)
  return { x: monde.x + (p.x - c.dx) / c.k, y: monde.y + (p.y - c.dy) / c.k }
}

/** Une boîte de la toile, ramenée dans la mini-carte (px depuis son coin haut-gauche). */
export function versMinicarte(monde: Boite, b: Boite): Boite {
  const c = cadreMinicarte(monde)
  return { x: c.dx + (b.x - monde.x) * c.k, y: c.dy + (b.y - monde.y) * c.k, l: b.l * c.k, h: b.h * c.k }
}
