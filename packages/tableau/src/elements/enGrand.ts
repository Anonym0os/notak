import { type DragEvent, useLayoutEffect } from 'react'

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

const editable = (n: EventTarget | null) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA)$/.test(n.tagName))

function refuser(e: DragEvent) {
  e.stopPropagation()
  if (e.isDefaultPrevented() || editable(e.target)) return
  e.preventDefault()
  if (e.type !== 'drop') e.dataTransfer.dropEffect = 'none'
}

/**
 * Un fichier ou un texte glissé sur un plein écran ne remonte pas à la toile, qui le poserait derrière lui, sans qu'on
 * le voie. Ce que le contenu accepte (un éditeur, la carte mentale) l'a déjà dit ; le reste est refusé : le curseur le
 * montre, rien ne se crée, et le navigateur n'ouvre pas le fichier à la place de Notak. À poser sur la racine.
 */
export const refuserLeDepot = {
  onDragEnter: refuser,
  onDragOver: refuser,
  onDragLeave: (e: DragEvent) => e.stopPropagation(),
  onDrop: refuser,
}
