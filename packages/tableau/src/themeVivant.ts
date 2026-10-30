import { type RefObject, useLayoutEffect, useState, useSyncExternalStore } from 'react'

/**
 * Le thème suivi en direct : celui du système (le mode « Système » des réglages), et celui de l'espace pour ce qui
 * le lit dans la page (une table, une ligne). Un changement se voit tout de suite, sans attendre un autre dessin.
 */

const REQUETE_SOMBRE = '(prefers-color-scheme: dark)'
const requete = () => (typeof matchMedia === 'function' ? matchMedia(REQUETE_SOMBRE) : null)

/** Le système est-il en sombre (macOS, Windows, le navigateur) ? */
export const systemeSombre = (): boolean => requete()?.matches ?? false

function ecouterSysteme(rappel: () => void) {
  const m = requete()
  m?.addEventListener('change', rappel)
  return () => m?.removeEventListener('change', rappel)
}

/** Le thème du système, suivi : il change quand on bascule macOS en sombre. */
export const useSystemeSombre = (): boolean => useSyncExternalStore(ecouterSysteme, systemeSombre, () => false)

/** Le thème qui s'applique : celui choisi, ou celui du système. */
export const themeEffectif = (choix: 'clair' | 'sombre' | 'systeme', sombre = systemeSombre()): 'clair' | 'sombre' => (choix === 'systeme' ? (sombre ? 'sombre' : 'clair') : choix)

/** L'élément porté par `ref` est-il dans un espace sombre ? Suit le thème de l'espace (`selecteur`) quand il change. */
export function useSombre(ref: RefObject<Element | null>, selecteur = '.notak-espace'): boolean {
  const [sombre, setSombre] = useState(false)
  useLayoutEffect(() => {
    const porteur = ref.current?.closest(selecteur)
    if (!porteur) return
    const lire = () => setSombre(porteur.getAttribute('data-theme') === 'sombre')
    lire()
    const suivi = new MutationObserver(lire)
    suivi.observe(porteur, { attributes: true, attributeFilter: ['data-theme'] })
    return () => suivi.disconnect()
  }, [ref, selecteur])
  return sombre
}

/**
 * Le thème affiché, posé aussi sur la racine du document : le fond de la page (`html[data-theme]`), la bibliothèque
 * posée sur la toile, et la coque iOS (sa vue native, sa barre d'état : `ios/demarrage.ts`) le lisent là.
 */
export function useThemeALaRacine(theme: 'clair' | 'sombre') {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
}
