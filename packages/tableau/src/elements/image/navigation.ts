import { comparerOrdre } from '../../coeur/ordre'
import type { Element, Image } from '../../coeur/tableau'
import { enEnvoi } from '../envois'
import { rotationDe } from './geometrie'

/**
 * Les images qu'on parcourt dans la visionneuse, dans l'ordre de Milanote et non celui de création : celles de la toile
 * en lisant (rangée par rangée, de gauche à droite), puis les non triées, puis le contenu de chaque colonne dans l'ordre
 * des colonnes. Ni la corbeille ni les images dont le fichier est encore en route.
 */
export function ordreImages(elements: readonly Element[]): Element<Image>[] {
  const images = elements.filter((e): e is Element<Image> => e.contenu.type === 'image' && e.corbeille === undefined && !enEnvoi(e.contenu.fichier))
  const lecture = (a: Element, b: Element) => a.y - b.y || a.x - b.x
  const libres = images.filter((e) => e.parent === undefined && e.nonTrie === undefined).sort(lecture)
  const nonTries = images.filter((e) => e.parent === undefined && e.nonTrie !== undefined).sort((a, b) => a.nonTrie! - b.nonTrie!)
  const colonnes = elements.filter((e) => e.contenu.type === 'colonne' && e.corbeille === undefined).sort(lecture)
  const rangees = colonnes.flatMap((c) => images.filter((e) => e.parent === c.id).sort((a, b) => comparerOrdre(a.ordre, b.ordre)))
  return [...libres, ...nonTries, ...rangees]
}

/** L'image d'à côté, en bouclant : `pas` vaut 1 (suivante) ou -1 (précédente). */
export function voisine<T extends { id: string }>(liste: readonly T[], id: string, pas: 1 | -1): T | undefined {
  if (liste.length === 0) return undefined
  const i = liste.findIndex((e) => e.id === id)
  return liste[((i < 0 ? 0 : i) + pas + liste.length) % liste.length]
}

/** Le zoom de la visionneuse reste entre 1 et 4. */
export const ZOOM_MIN = 1
export const ZOOM_MAX = 4
export const borneZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))

/** Le décalage qui garde l'image zoomée dans la fenêtre : au plus la moitié de ce qu'elle déborde, de chaque côté. */
export function borneDecalage(decalage: number, taille: number, zoom: number): number {
  const reste = (taille * (zoom - 1)) / 2
  return Math.max(-reste, Math.min(reste, decalage))
}

export interface Taille {
  largeur: number
  hauteur: number
}

/** La taille, en pixels, de l'image telle que la toile la montre : la part gardée par le recadrage, puis le quart de tour. */
export function tailleMontree(c: Image): Taille {
  const largeur = c.largeurOrigine * (c.recadrage?.largeur ?? 1)
  const hauteur = c.hauteurOrigine * (c.recadrage?.hauteur ?? 1)
  return rotationDe(c) === 90 || rotationDe(c) === 270 ? { largeur: hauteur, hauteur: largeur } : { largeur, hauteur }
}

/**
 * L'image en grand et sa légende, comme une carte agrandie : l'image à sa taille au plus (jamais agrandie), dans la
 * zone, avec sous elle la légende de la même largeur. `mesurer` rend la hauteur de la légende à une largeur donnée
 * (0 sans légende) : plus l'image rétrécit, plus la légende s'allonge, on recommence jusqu'à ce qu'elles s'accordent.
 */
export function carteEnGrand(image: Taille, zone: Taille, mesurer: (largeur: number) => number): Taille & { legende: number } {
  const rapport = image.largeur / image.hauteur
  const poser = (legende: number) => {
    const largeur = Math.max(1, Math.min(image.largeur, zone.largeur, Math.max(1, zone.hauteur - legende) * rapport))
    return { largeur, hauteur: largeur / rapport }
  }
  let legende = 0
  let taille = poser(0)
  for (let i = 0; i < 8; i++) {
    const mesuree = mesurer(taille.largeur)
    if (Math.abs(mesuree - legende) < 0.5) break
    legende = Math.max(legende, mesuree)
    taille = poser(legende)
  }
  return { ...taille, legende }
}
