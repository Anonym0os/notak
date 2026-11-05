/**
 * L'appui long, au doigt et au Pencil : la webview d'iOS n'envoie jamais `contextmenu`, et c'est pourtant le geste
 * qu'on y attend pour le menu d'un élément (comme dans Fichiers ou Freeform). Il part si le pointeur reste posé
 * `duree` ms sans bouger de plus de `tolerance` px ; il s'annule s'il bouge (on fait défiler), se lève, est repris par
 * le système (`pointercancel`), ou si la page défile. Une fois parti, le clic qui suit le relâcher est avalé : il
 * ouvrirait la tuile sous le doigt.
 */

/** Comme sur la toile (`Toile.tsx`) et dans la carte mentale. */
export const APPUI_LONG = 500
/** Au-delà, le doigt fait défiler : ce n'est plus un appui. */
export const TOLERANCE_APPUI = 8
/** Les écouteurs se posent à la capture, avant ceux de la page ; un objet, que toutes les implémentations comparent. */
const CAPTURE = { capture: true } as const

export interface OptionsAppuiLong {
  duree?: number
  tolerance?: number
  /** Le geste a tenu : le point où il a été tenu. */
  tenu(point: { x: number; y: number }): void
  /** La fenêtre qui écoute (les essais en donnent une). */
  fenetre?: Window
}

/** Suit un appui commencé par `depart` ; rend de quoi l'abandonner. */
export function suivreAppuiLong(depart: { clientX: number; clientY: number; pointerId: number }, { duree = APPUI_LONG, tolerance = TOLERANCE_APPUI, tenu, fenetre = window }: OptionsAppuiLong): () => void {
  const point = { x: depart.clientX, y: depart.clientY }
  let fini = false
  const finir = () => {
    if (fini) return
    fini = true
    clearTimeout(minuteur)
    fenetre.removeEventListener('pointermove', bouger, CAPTURE)
    fenetre.removeEventListener('pointerup', finir, CAPTURE)
    fenetre.removeEventListener('pointercancel', finir, CAPTURE)
    fenetre.removeEventListener('scroll', finir, CAPTURE)
  }
  const bouger = (e: PointerEvent) => {
    if (e.pointerId !== depart.pointerId) return
    if (Math.hypot(e.clientX - point.x, e.clientY - point.y) > tolerance) finir()
  }
  const minuteur = setTimeout(() => {
    if (fini) return
    finir()
    avalerLeClicSuivant(fenetre)
    tenu(point)
  }, duree)
  fenetre.addEventListener('pointermove', bouger, CAPTURE)
  fenetre.addEventListener('pointerup', finir, CAPTURE)
  fenetre.addEventListener('pointercancel', finir, CAPTURE)
  // Le défilement de la page (au doigt, il ne passe pas par pointermove : le système le prend).
  fenetre.addEventListener('scroll', finir, CAPTURE)
  return finir
}

/**
 * Le clic qui suit un appui long, ou la fin d'un glisser, ne doit rien ouvrir. Seul celui du même geste est avalé :
 * un nouvel appui, ou un instant sans clic (le doigt a glissé hors de la tuile), lève la garde.
 */
export function avalerLeClicSuivant(fenetre: Window = window) {
  const lever = () => {
    clearTimeout(minuteur)
    fenetre.removeEventListener('click', avaler, CAPTURE)
    fenetre.removeEventListener('pointerdown', lever, CAPTURE)
  }
  const avaler = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    lever()
  }
  fenetre.addEventListener('click', avaler, CAPTURE)
  fenetre.addEventListener('pointerdown', lever, CAPTURE)
  const minuteur = setTimeout(lever, 600)
}
