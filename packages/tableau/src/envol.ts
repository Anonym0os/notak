import type { Point } from './coeur/geometrie'
import { IMAGE_MS, type Reglage, VOL_REPOS, type Vol, pasDePose, pasEnVol } from './coeur/vol'

/**
 * Fait voler ce qu'on glisse, image par image, hors de React : la toile dit où va le pointeur (`viser`),
 * puis où l'élément est posé (`poser`), et `dessiner` reçoit le vol de chaque image.
 */
export class Envol {
  vol: Vol
  private cible: Point = { x: 0, y: 0 }
  private parcouru = 0
  private pose: { fin?: () => void } | null = null
  private image = 0
  private dernier = 0

  constructor(
    private readonly reglage: Reglage,
    private readonly dessiner: (v: Vol) => void,
    depart: Vol = VOL_REPOS,
  ) {
    this.vol = depart
    this.cible = { x: depart.x, y: depart.y }
    this.relancer()
  }

  /** Le pointeur est là ; `parcouru` est sa distance au départ, en pixels d'écran. */
  viser(cible: Point, parcouru: number) {
    this.cible = cible
    this.parcouru = parcouru
    this.pose = null
    this.relancer()
  }

  /** L'élément est posé à `cible` : il la rejoint, se redresse, et `fin` est appelé une fois immobile. */
  poser(cible: Point, fin?: () => void) {
    this.cible = cible
    this.pose = { fin }
    this.relancer()
  }

  /** Dessine le vol tout de suite, sans attendre la prochaine image (la place de l'élément vient de changer). */
  redessiner() {
    this.dessiner(this.vol)
  }

  arreter() {
    cancelAnimationFrame(this.image)
    this.image = 0
  }

  private relancer() {
    if (this.image) return
    this.dernier = performance.now()
    this.image = requestAnimationFrame(this.pas)
  }

  private pas = (t: number) => {
    const dt = Math.max(1, Math.min(t - this.dernier, IMAGE_MS * 4))
    this.dernier = t
    if (this.pose) {
      const { vol, fini } = pasDePose(this.vol, this.cible, dt, this.reglage)
      this.vol = vol
      this.dessiner(vol)
      if (fini) {
        this.image = 0
        return this.pose.fin?.()
      }
    } else {
      this.vol = pasEnVol(this.vol, this.cible, this.parcouru, dt, this.reglage)
      this.dessiner(this.vol)
    }
    this.image = requestAnimationFrame(this.pas)
  }
}

/** Pose le vol sur le nœud d'un élément : sa transformation, et l'intensité de son ombre de soulèvement. */
export function dessinerSur(noeud: HTMLElement, transformation: string, ombre: number) {
  noeud.style.transform = transformation
  noeud.style.setProperty('--notak-soulevement', String(ombre))
  noeud.dataset.vol = ''
}

export function oublierVol(noeud: HTMLElement) {
  noeud.style.removeProperty('transform')
  noeud.style.removeProperty('--notak-soulevement')
  delete noeud.dataset.vol
}
