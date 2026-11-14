/**
 * Les boutons « précédent » et « suivant » de la souris (les 4ᵉ et 5ᵉ, ceux du pouce d'une MX Master), et ⌘[ / ⌘] là où
 * rien d'autre ne les prend : reculer et avancer dans la navigation de Notak, partout (la bibliothèque, une toile, une
 * page ou une carte mentale ouvertes en grand), comme le bouton retour du navigateur.
 *
 * Chrome (et ce qui en dérive) et Firefox suivent déjà ces boutons, et ⌘[ / ⌘] : la page les leur laisse, sans quoi chaque
 * appui ferait deux pas. WebKit ne les suit pas, ni dans l'app de bureau, ni sur l'iPad, ni dans Safari : la page y fait
 * ce que fait Chrome, `history.back()` ou `history.forward()`, au relâchement du bouton, comme lui. Un élément qui a
 * besoin de ces boutons les garde en annulant leur relâchement (`preventDefault`), comme il le ferait dans Chrome ; une
 * touche prise par un champ, un éditeur ou la toile (⌘[ y recule déjà dans ses toiles) reste à eux.
 *
 * Ce fichier est chargé au premier script (`main.tsx`) : il ne tire que `bureau.ts`, ni la toile ni les textes.
 */
import { dansCoque } from './bureau'

export type Sens = 'reculer' | 'avancer'

/** Le bouton du milieu (4), le 4ᵉ (8) et le 5ᵉ (16), dans `MouseEvent.buttons`. */
const MILIEU = 4
const QUATRIEME = 8
const CINQUIEME = 16

/**
 * Le sens d'un bouton de la souris : le 4ᵉ recule (`button` 3), le 5ᵉ avance (`button` 4). WebKit sur macOS, avant ses
 * versions de 2026 (bug 280755), les donnait pour le bouton du milieu (`button` 1), mais `buttons` nommait bien celui
 * qu'on enfonçait (8 ou 16) : à l'appui, on les reconnaît là, tant que le vrai bouton du milieu n'est pas tenu.
 */
export function sensDuBouton(e: { button: number; buttons: number }): Sens | null {
  if (e.button === 3) return 'reculer'
  if (e.button === 4) return 'avancer'
  if (e.button === 1 && !(e.buttons & MILIEU)) return e.buttons & QUATRIEME ? 'reculer' : e.buttons & CINQUIEME ? 'avancer' : null
  return null
}

/** Chrome (Edge, Arc, Brave, Opera…) et Firefox suivent eux-mêmes ces boutons ; WebKit, sous toutes ses formes, non. */
export const navigateurLesSuit = (agent: string): boolean => /\b(Chrome|Chromium|Firefox)\//.test(agent)

/** ⌘[ recule, ⌘] avance (Ctrl ailleurs que sur un Mac), sans ⌥ ni ⇧ : la touche se lit aussi à sa place, pour l'AZERTY. */
export function sensDeLaTouche(e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): Sens | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return null
  if (e.key === '[' || e.code === 'BracketLeft') return 'reculer'
  if (e.key === ']' || e.code === 'BracketRight') return 'avancer'
  return null
}

/** Ce qu'on écrit : ⌘[ y appartient au texte (un éditeur peut s'en servir), pas à la navigation. */
const saisissable = (cible: EventTarget | null) =>
  cible instanceof HTMLElement && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))

/** L'historique de la fenêtre, et s'il a un pas à faire dans un sens. */
export interface Historique {
  aller(sens: Sens): void
  peut(sens: Sens): boolean
}

interface NavigationApi {
  canGoBack: boolean
  canGoForward: boolean
}

/**
 * L'historique de la fenêtre. L'API Navigation ne compte que les pas de cette page et de son origine : dans l'app de
 * bureau, la fenêtre ne repart jamais vers la page vide qu'elle a traversée ou vers sa porte, d'où elle est venue sur
 * ce serveur. Sans elle (un WebKit d'avant 2026), on ne s'y risque que hors de l'app ; dans un navigateur, c'est le pas
 * que ferait son propre bouton retour.
 */
export function historiqueDe(fenetre: Window): Historique {
  return {
    aller: (sens) => (sens === 'reculer' ? fenetre.history.back() : fenetre.history.forward()),
    peut(sens) {
      const navigation = (fenetre as unknown as { navigation?: NavigationApi }).navigation
      if (navigation) return sens === 'reculer' ? navigation.canGoBack : navigation.canGoForward
      return !dansCoque(fenetre)
    },
  }
}

/**
 * Branche les boutons de la souris et ⌘[ / ⌘] sur l'historique, là où le navigateur ne le fait pas lui-même. Rend de
 * quoi les débrancher (les essais).
 */
export function brancherPrecedentSuivant(
  fenetre: Window = window,
  { suitSeul = navigateurLesSuit(fenetre.navigator.userAgent), historique = historiqueDe(fenetre) }: { suitSeul?: boolean; historique?: Historique } = {},
): () => void {
  /** Le bouton enfoncé, lu à l'appui : le WebKit d'avant 2026 ne le redit pas au relâchement (`buttons` y vaut 0). */
  let enfonce: Sens | null = null

  // L'appui de ces boutons ne sert qu'à la navigation : rien dessous ne le prend. Sans cela, une surcouche ouverte en
  // grand se fermerait en plus du pas en arrière (elle se ferme à l'appui sur son fond), et le WebKit d'avant 2026, qui
  // les dit bouton du milieu, ferait glisser la toile ou la carte. Même dans Chrome : son pas, lui, vient au relâchement.
  const appui = (e: MouseEvent) => {
    enfonce = sensDuBouton(e)
    if (enfonce) e.stopPropagation()
  }
  const relache = (e: MouseEvent) => {
    const sens = sensDuBouton(e) ?? (e.button === 1 ? enfonce : null)
    if (!sens || suitSeul || e.defaultPrevented) return
    // Le pas que ferait le navigateur au même moment ; annulé, puisqu'on le fait (un WebKit qui le ferait un jour).
    e.preventDefault()
    if (historique.peut(sens)) historique.aller(sens)
  }
  // Le WebKit d'avant 2026 croit au bouton du milieu : sur un lien, son clic l'ouvrirait dans une autre fenêtre.
  const clicAuxiliaire = (e: MouseEvent) => {
    if (sensDuBouton(e) ?? (e.button === 1 ? enfonce : null)) e.preventDefault()
  }
  const touche = (e: KeyboardEvent) => {
    if (suitSeul || e.defaultPrevented || e.isComposing || saisissable(e.target)) return
    const sens = sensDeLaTouche(e)
    if (!sens) return
    e.preventDefault()
    if (historique.peut(sens)) historique.aller(sens)
  }

  fenetre.addEventListener('pointerdown', appui, true)
  fenetre.addEventListener('mousedown', appui, true)
  fenetre.addEventListener('mouseup', relache)
  fenetre.addEventListener('auxclick', clicAuxiliaire)
  fenetre.addEventListener('keydown', touche)
  return () => {
    fenetre.removeEventListener('pointerdown', appui, true)
    fenetre.removeEventListener('mousedown', appui, true)
    fenetre.removeEventListener('mouseup', relache)
    fenetre.removeEventListener('auxclick', clicAuxiliaire)
    fenetre.removeEventListener('keydown', touche)
  }
}
