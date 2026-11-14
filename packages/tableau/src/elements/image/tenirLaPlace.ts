/**
 * Quand la visionneuse se ferme sous le pointeur (l'appui sur son fond, un clic sur « Dessiner », « Modifier » ou
 * « Fond »), le geste n'est pas fini : le relâchement, le clic qui le suit, et le second appui d'un double-clic tombent
 * alors sur ce que la visionneuse couvrait, une note de la toile qui se choisit, s'écrit et voit son texte surligné,
 * pendant que l'outil qu'on venait d'ouvrir se referme. On garde donc la place du pointeur un instant : un carré
 * invisible, posé là où il a appuyé, prend tout ce qui reste du geste et ne le rend à personne. Il s'en va une demi-
 * seconde après le dernier relâchement ; un appui ailleurs passe à côté, comme s'il n'était pas là.
 */

/** Au doigt comme à la souris, le second appui d'un double-clic tombe dans ce rayon (`DOUBLE_TOUCHER_PX` de la toile). */
export const RAYON_TENU = 24
/** Le temps laissé au second appui d'un double-clic, et aux clics qu'une webview tire en retard d'un toucher. */
export const DUREE_TENUE = 500

/** Ce que le carré prend : tout ce qu'un appui, son relâchement et son clic envoient. */
const GESTE = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'touchstart',
  'touchend',
] as const

/**
 * Tient la place `(x, y)` (en pixels de la fenêtre) jusqu'à la fin du geste. `pointeur` : le pointeur encore appuyé,
 * dont le carré prend la suite où qu'il aille ; sans lui, le bouton est déjà relâché et seul un nouvel appui sur place
 * est pris. Rend de quoi libérer la place tout de suite.
 */
export function tenirLaPlace(x: number, y: number, pointeur?: number): () => void {
  const garde = document.createElement('div')
  garde.className = 'notak-place-tenue'
  garde.setAttribute('aria-hidden', 'true')
  Object.assign(garde.style, {
    position: 'fixed',
    left: `${x - RAYON_TENU}px`,
    top: `${y - RAYON_TENU}px`,
    width: `${2 * RAYON_TENU}px`,
    height: `${2 * RAYON_TENU}px`,
    // Au niveau de la visionneuse, et posé après elle : au-dessus de la toile, sous ce qui s'ouvre par-dessus.
    zIndex: '1000',
    touchAction: 'none',
    userSelect: 'none',
    webkitUserSelect: 'none',
  })
  let minuteur: ReturnType<typeof setTimeout> | undefined
  const attendre = () => {
    clearTimeout(minuteur)
    minuteur = setTimeout(liberer, DUREE_TENUE)
  }
  const tenir = (id: number) => {
    clearTimeout(minuteur)
    try {
      garde.setPointerCapture?.(id)
    } catch {
      // Le pointeur s'est déjà relevé : il n'y a plus rien à suivre.
    }
  }
  const prendre = (e: Event) => {
    e.stopPropagation()
    // Ni sélection de texte, ni focus, ni menu du système, ni clic tiré d'un toucher : le geste s'arrête là.
    if (e.cancelable) e.preventDefault()
    // Un nouvel appui sur place (le second d'un double-clic) : la place reste tenue tant qu'il dure.
    if (e.type === 'pointerdown') tenir((e as PointerEvent).pointerId)
  }
  // Le relâchement compte où qu'il tombe : sans capture du pointeur, il peut finir hors du carré.
  const releve = () => attendre()
  const liberer = () => {
    clearTimeout(minuteur)
    garde.remove()
    window.removeEventListener('pointerup', releve, true)
    window.removeEventListener('pointercancel', releve, true)
  }
  for (const type of GESTE) garde.addEventListener(type, prendre, { passive: false })
  window.addEventListener('pointerup', releve, true)
  window.addEventListener('pointercancel', releve, true)
  document.body.append(garde)
  if (pointeur === undefined) attendre()
  else tenir(pointeur)
  return liberer
}
