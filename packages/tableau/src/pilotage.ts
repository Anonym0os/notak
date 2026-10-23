import { t } from './langue'
import { type Camera, type Vue, ajuster } from './coeur/camera'
import type { Rect } from './coeur/geometrie'

/** Ce que la toile prête à l'hôte pour déplacer sa caméra : lire où elle est, la poser ailleurs. */
export interface PiloteToile {
  camera(): Camera
  vue(): Vue
  /** Le rectangle qui englobe tout le tableau (hors corbeille), en UG ; `null` s'il est vide. */
  contenu(): Rect | null
  poser(c: Camera): void
}

let courant: PiloteToile | null = null

/** La toile se branche en s'affichant et se débranche en partant ; l'hôte n'a qu'une toile à piloter à la fois. */
export function brancherPilote(p: PiloteToile): () => void {
  courant = p
  return () => {
    if (courant === p) courant = null
  }
}

/** Le temps laissé à la toile, une fois la caméra posée, pour dessiner ce qui était hors de vue (images comprises). */
const DELAI_AFFICHAGE = 400
/** Le plus large qu'une image exportée devienne, en pixels. */
export const LARGEUR_EXPORT_MAX = 4000
/** On ne grossit pas la capture au-delà : au-dessus, elle pèse sans gagner en netteté. */
const RAPPORT_MAX = 3

/**
 * Le rapport de pixels de la capture : le plus net que permet la largeur maximale. Un contenu vu de loin
 * (échelle basse) est regrossi pour que ses détails restent lisibles, sans dépasser `RAPPORT_MAX`.
 */
export function rapportDeCapture(largeurVue: number, echelle: number, largeurMax = LARGEUR_EXPORT_MAX): number {
  if (largeurVue <= 0) return 1
  const plafond = largeurMax / largeurVue
  return Math.max(0.1, Math.min(plafond, RAPPORT_MAX, Math.max(2, 1 / Math.max(echelle, 0.01))))
}

export interface Cadrage {
  /** Le rapport de pixels à donner à la capture pour que l'image ne dépasse pas 4000 px de large. */
  rapport: number
}

/**
 * Cadre la vue sur tout le contenu le temps de `faire` (la capture), puis remet la caméra où elle était, même si
 * `faire` échoue. Refuse un tableau vide ou une toile absente.
 */
export async function avecToutLeTableau<T>(faire: (cadrage: Cadrage) => Promise<T>, delai = DELAI_AFFICHAGE): Promise<T> {
  const p = courant
  if (!p) throw new Error(t('pilotage.aucun'))
  const cible = ajuster(p.contenu(), p.vue())
  if (!cible) throw new Error(t('pilotage.vide'))
  const avant = p.camera()
  p.poser(cible)
  try {
    await new Promise((fin) => setTimeout(fin, delai))
    return await faire({ rapport: rapportDeCapture(p.vue().largeur, cible.echelle) })
  } finally {
    p.poser(avant)
  }
}
