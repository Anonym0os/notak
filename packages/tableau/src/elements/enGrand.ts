import { useLayoutEffect } from 'react'

/*
 * Ce qu'un plein écran posé sur la toile (la visionneuse d'une image ; une surcouche : le croquis, le document, la carte
 * mentale ouverts en grand, le choix d'un modèle) doit à la toile dessous : rien de ce qu'on y fait ne l'atteint.
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
