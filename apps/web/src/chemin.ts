import { useSyncExternalStore } from 'react'

/**
 * Le chemin de la page, que l'application suit sans recharger : la bibliothèque (`/`) et les toiles (`/t/…`) se
 * passent la main par `allerA`, et le retour du navigateur fait de même.
 */
const EVENEMENT = 'notak:chemin'

export function allerA(chemin: string, { remplacer = false }: { remplacer?: boolean } = {}): void {
  if (remplacer) history.replaceState(null, '', chemin)
  else if (chemin !== location.pathname + location.search) history.pushState(null, '', chemin)
  window.dispatchEvent(new Event(EVENEMENT))
}

/** Prévenu quand `allerA` change le chemin (et lui seul : pas le retour du navigateur). */
export function ecouterAllerA(f: () => void): () => void {
  window.addEventListener(EVENEMENT, f)
  return () => window.removeEventListener(EVENEMENT, f)
}

/** Prévenu quand le chemin change : `allerA`, ou le retour du navigateur. */
export const ecouterChemin = (f: () => void) => {
  window.addEventListener('popstate', f)
  window.addEventListener(EVENEMENT, f)
  return () => {
    window.removeEventListener('popstate', f)
    window.removeEventListener(EVENEMENT, f)
  }
}

export const useChemin = (): string => useSyncExternalStore(ecouterChemin, () => location.pathname)

/**
 * Un lien de l'application : un clic simple y va sans recharger ; ⌘, Ctrl, Maj ou le bouton du milieu gardent ce que
 * fait le navigateur (un nouvel onglet, une nouvelle fenêtre).
 */
export function surLien(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault(): void }, chemin: string): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  allerA(chemin)
}
