/**
 * Le menu du zoom de la barre du bas (docs/XMIND.md § 8). Un zoom est un pourcentage entier, de 2 à 800 (Xmind
 * s'arrête à 10 et 500).
 */

export const ZOOM_MIN_POURCENT = 2
export const ZOOM_MAX_POURCENT = 800

/** Les paliers de la carte, du plus grand au plus petit. */
export const PALIERS_CARTE = [800, 500, 400, 300, 200, 150, 120, 100, 80, 50, 20, 10, 5, 2] as const
/** Ceux du plan : une page se lit entre 80 et 300 %. */
export const PALIERS_PLAN = [300, 200, 150, 120, 100, 80] as const

export interface EntreeZoom {
  valeur: number
  coche: boolean
}

/** Le zoom (1 = 100 %) en pourcentage entier, borné. */
export const enPourcent = (z: number): number => Math.min(ZOOM_MAX_POURCENT, Math.max(ZOOM_MIN_POURCENT, Math.round(z * 100)))

/**
 * Les entrées du menu : les paliers, avec le zoom courant coché. S'il n'est pas un palier (137 %), il s'y ajoute à sa
 * place, coché.
 */
export function entreesZoom(zoom: number, plan = false): EntreeZoom[] {
  const courant = enPourcent(zoom)
  const valeurs: number[] = [...(plan ? PALIERS_PLAN : PALIERS_CARTE)]
  if (!valeurs.includes(courant)) valeurs.push(courant)
  return valeurs.sort((a, b) => b - a).map((valeur) => ({ valeur, coche: valeur === courant }))
}
