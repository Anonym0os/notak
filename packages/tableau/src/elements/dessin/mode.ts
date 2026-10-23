import { useSyncExternalStore } from 'react'

/**
 * Le mode « dessiner sur la toile » est-il ouvert ? La couche de dessin, la barre de gauche et la toile (double-clic,
 * clavier) le lisent ici : tant qu'il est ouvert, la toile ne fait plus rien sous la couche.
 */
let ouvert = false
const ecouteurs = new Set<() => void>()

export const dessinLibreOuvert = (): boolean => ouvert

export function poserDessinLibre(valeur: boolean): void {
  if (ouvert === valeur) return
  ouvert = valeur
  for (const f of [...ecouteurs]) f()
}

const abonner = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}

export const useDessinLibreOuvert = (): boolean => useSyncExternalStore(abonner, dessinLibreOuvert, () => false)

/** La toile doit-elle laisser passer ce geste ? Non dès que la couche de dessin est ouverte (état ou présence dans le DOM). */
export const toileSuspendue = (racine?: Element | null): boolean => ouvert || !!racine?.querySelector('.notak-dessin-libre')
