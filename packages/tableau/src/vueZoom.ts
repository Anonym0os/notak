import { useEffect, useSyncExternalStore } from 'react'

/**
 * Où en est la vue de la toile ouverte, et ce qu'on peut lui demander : l'en-tête (le bouton « Vue » et son
 * panneau) lit l'un et appelle l'autre sans passer par les props de la toile. Une seule toile à la fois publie.
 */
export interface EtatVue {
  echelle: number
}

/** Ce que le panneau demande à la toile à son ouverture (cela coûte une mesure du contenu : pas à chaque rendu). */
export interface DetailsVue {
  /** Le zoom arrière le plus bas que ce tableau permet. */
  min: number
  /** Tout le contenu est déjà cadré : « Tout afficher » devient « Revenir à 100 % ». */
  toutAffiche: boolean
}

export interface CommandesVue {
  details(): DetailsVue
  zoomer(echelle: number): void
  /** Cadre tout le contenu, ou revient à 100 % si c'est déjà le cas. */
  tout(): void
  /** Revient à 100 %, centré sur ce qu'on regardait. */
  cent(): void
}

export const ZOOM_MAX_CURSEUR = 8
export const ZOOM_MIN_CURSEUR = 0.02

let etat: EtatVue | null = null
let commandes: CommandesVue | null = null
const abonnes = new Set<() => void>()

export const etatVue = () => etat
export const commandesVue = () => commandes
export const ecouterVue = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}
export const useEtatVue = (): EtatVue | null => useSyncExternalStore(ecouterVue, etatVue, () => null)

const pareil = (a: EtatVue | null, b: EtatVue | null) =>
  a === b || (!!a && !!b && a.echelle === b.echelle)

/** Publie l'état (et les commandes) de la toile ; `null` quand elle disparaît. Ne prévient que si quelque chose change. */
export function publierVue(e: EtatVue | null, c: CommandesVue | null): void {
  commandes = c
  if (pareil(etat, e)) return
  etat = e
  for (const f of abonnes) f()
}

/** À appeler par la toile, à chaque rendu : elle publie sa vue et retire sa publication en partant. */
export function usePublierVue(e: EtatVue, c: CommandesVue) {
  useEffect(() => publierVue(e, c))
  useEffect(() => () => publierVue(null, null), [])
}

/** Le pourcentage affiché : l'échelle arrondie à l'entier. */
export const pourcentage = (echelle: number): number => Math.round(echelle * 100)

/** Les bornes du curseur de zoom, en pourcentage entier : de 2 % (ou du plancher du tableau) à 800 %. */
export const bornesCurseur = (min: number): { min: number; max: number } => ({
  min: Math.max(Math.round(ZOOM_MIN_CURSEUR * 100), Math.ceil(min * 100)),
  max: Math.round(ZOOM_MAX_CURSEUR * 100),
})

/** Le cran du curseur (logarithmique, 100 crans par facteur e) d'un pourcentage, et l'inverse, arrondi au pourcent. */
export const versCran = (pct: number): number => Math.round(Math.log(pct) * 1000)
export const depuisCran = (cran: number): number => Math.round(Math.exp(cran / 1000))
