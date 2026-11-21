import { type DragEvent, type PointerEvent, useLayoutEffect, useRef } from 'react'

/*
 * Ce qu'un plein écran posé sur la toile (la visionneuse d'une image ; une surcouche : le croquis, le document, la carte
 * mentale ouverts en grand, le choix d'un modèle) doit à la toile dessous : rien de ce qu'on y fait ne l'atteint, ni le
 * clavier, ni un dépôt, ni la fin du geste qui le ferme.
 */

let couvertures = 0

/**
 * La toile est-elle sous un plein écran ? Elle ne prend alors ni touche ni copier-coller, qu'on ait le focus dans le
 * plein écran ou que la toile l'ait gardé (elle le garde après le double-clic qui ouvre une image) : Suppr ne jette pas
 * l'image qu'on regarde, ⌘A ne choisit rien derrière, ⌘V n'y colle rien, ⌘Z n'y défait rien sans qu'on le voie.
 */
export const toileCouverte = () => couvertures > 0

/** Tant que le composant qui l'appelle est monté, la toile est couverte. */
export function useCouvrirLaToile() {
  useLayoutEffect(() => {
    couvertures++
    return () => {
      couvertures--
    }
  }, [])
}

const editable = (n: EventTarget | null) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA)$/.test(n.tagName))

function refuser(e: DragEvent) {
  e.stopPropagation()
  // Un texte qu'on glisse dans ce qu'on écrit s'y pose, comme partout ; un fichier, l'éditeur ne le prend pas.
  if (e.isDefaultPrevented() || (editable(e.target) && ![...(e.dataTransfer?.types ?? [])].includes('Files'))) return
  e.preventDefault()
  if (e.type !== 'drop') e.dataTransfer.dropEffect = 'none'
}

/**
 * Un fichier ou un texte glissé sur un plein écran ne remonte pas à la toile, qui le poserait derrière lui, sans qu'on
 * le voie. Ce que le contenu accepte (la carte mentale, un texte glissé dans l'éditeur) le prend ; le reste est
 * refusé : le curseur le montre, rien ne se crée, et le navigateur n'ouvre pas le fichier à la place de Notak. À poser
 * sur la racine.
 */
export const refuserLeDepot = {
  onDragEnter: refuser,
  onDragOver: refuser,
  onDragLeave: (e: DragEvent) => e.stopPropagation(),
  onDrop: refuser,
}

/*
 * Quand un plein écran se ferme sous le pointeur (l'appui sur son fond, un clic sur un bouton qui le referme ou ouvre
 * un outil à sa place), le geste n'est pas fini : le relâchement, le clic qui le suit, et le second appui d'un
 * double-clic tombent alors sur ce qu'il couvrait, une note de la toile qui se choisit, s'écrit et voit son texte
 * surligné, pendant que l'outil qu'on venait d'ouvrir se referme. On garde donc la place du pointeur un instant : un
 * carré invisible, posé là où il a appuyé, prend tout ce qui reste du geste et ne le rend à personne. Il s'en va une
 * demi-seconde après le dernier relâchement ; un appui ailleurs passe à côté, comme s'il n'était pas là.
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
  // La fenêtre, prise une fois : le minuteur peut sonner après elle (à la fin d'un fichier d'essais, l'environnement
  // suivant l'a déjà retirée), et `liberer` n'a plus à la relire.
  const vue = window
  const garde = document.createElement('div')
  garde.className = 'notak-place-tenue'
  garde.setAttribute('aria-hidden', 'true')
  Object.assign(garde.style, {
    position: 'fixed',
    left: `${x - RAYON_TENU}px`,
    top: `${y - RAYON_TENU}px`,
    width: `${2 * RAYON_TENU}px`,
    height: `${2 * RAYON_TENU}px`,
    // Au niveau des pleins écrans, et posé après eux : au-dessus de la toile, sous ce qui s'ouvre par-dessus.
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
    if (e.type === 'pointerdown') tenir((e as globalThis.PointerEvent).pointerId)
  }
  // Le relâchement compte où qu'il tombe : sans capture du pointeur, il peut finir hors du carré.
  const releve = () => attendre()
  const liberer = () => {
    clearTimeout(minuteur)
    garde.remove()
    vue.removeEventListener('pointerup', releve, true)
    vue.removeEventListener('pointercancel', releve, true)
  }
  for (const type of GESTE) garde.addEventListener(type, prendre, { passive: false })
  vue.addEventListener('pointerup', releve, true)
  vue.addEventListener('pointercancel', releve, true)
  document.body.append(garde)
  if (pointeur === undefined) attendre()
  else tenir(pointeur)
  return liberer
}

/**
 * La place tenue à la fermeture, quelle qu'en soit la cause : si un appui y est encore tenu, ou vient d'y être relâché
 * (le clic d'un bouton suit son relâchement ; celui qu'une webview tire d'un toucher, un peu après), le plein écran qui
 * s'en va laisse `tenirLaPlace` là où il était. Rend les écouteurs à poser sur sa racine, qui voient passer tous ses
 * appuis, même ceux que son contenu garde pour lui.
 */
export function useTenirLaPlaceEnPartant() {
  const appui = useRef<{ x: number; y: number; id: number; tenu: boolean; quand: number } | null>(null)
  useLayoutEffect(
    () => () => {
      const a = appui.current
      if (a && (a.tenu || performance.now() - a.quand < DUREE_TENUE)) tenirLaPlace(a.x, a.y, a.tenu ? a.id : undefined)
    },
    [],
  )
  const relache = (e: PointerEvent) => {
    const a = appui.current
    if (a?.id === e.pointerId) appui.current = { ...a, tenu: false, quand: performance.now() }
  }
  return {
    onPointerDownCapture: (e: PointerEvent) => {
      appui.current = { x: e.clientX, y: e.clientY, id: e.pointerId, tenu: true, quand: performance.now() }
    },
    onPointerUpCapture: relache,
    onPointerCancelCapture: relache,
  }
}
