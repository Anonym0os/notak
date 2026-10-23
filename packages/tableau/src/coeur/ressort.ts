/** Un ressort amorti, réglé comme celui de Milanote pour glisser d'une liste d'outils à l'autre. */
export interface ReglageRessort {
  raideur: number
  amortissement: number
  masse: number
  /** On s'arrête quand l'écart restant, en pixels, passe et reste sous cette valeur. */
  precision: number
}

export const RESSORT_LISTES: ReglageRessort = { raideur: 300, amortissement: 30, masse: 1, precision: 0.1 }

/**
 * Où en est un ressort lâché à `distance` de son but, sans vitesse, après `t` secondes : `distance` au départ, 0 à
 * l'arrivée, un léger dépassement quand l'amortissement est faible (solution exacte de l'oscillateur amorti).
 */
export function ecartRessort(r: ReglageRessort, distance: number, t: number): number {
  const omega = Math.sqrt(r.raideur / r.masse)
  const zeta = r.amortissement / (2 * Math.sqrt(r.raideur * r.masse))
  if (zeta < 1) {
    const d = omega * Math.sqrt(1 - zeta * zeta)
    return distance * Math.exp(-zeta * omega * t) * (Math.cos(d * t) + ((zeta * omega) / d) * Math.sin(d * t))
  }
  // Amortissement critique ou plus : pas d'oscillation.
  if (zeta === 1) return distance * Math.exp(-omega * t) * (1 + omega * t)
  const s = omega * Math.sqrt(zeta * zeta - 1)
  const [a, b] = [-zeta * omega + s, -zeta * omega - s]
  return distance * ((b * Math.exp(a * t) - a * Math.exp(b * t)) / (b - a))
}

/** Le temps, en millisecondes, que met le ressort à tenir sous la précision (borné à deux secondes). */
export function dureeRessort(r: ReglageRessort, distance: number): number {
  const pas = 0.004
  let dernier = 0
  for (let t = 0; t < 2; t += pas) if (Math.abs(ecartRessort(r, distance, t)) > r.precision) dernier = t + pas
  return Math.round(dernier * 1000)
}

/**
 * La courbe du ressort pour une animation CSS : `linear()` va de 0 (départ) à 1 (but), en passant un peu au-delà
 * quand il dépasse. À employer avec la durée de `dureeRessort`.
 */
export function courbeRessort(r: ReglageRessort, distance: number, points = 40): { duree: number; easing: string } {
  const duree = Math.max(1, dureeRessort(r, distance))
  const valeurs = Array.from({ length: points + 1 }, (_, i) => {
    const progres = 1 - ecartRessort(r, 1, (i / points) * (duree / 1000))
    return Math.round(progres * 1000) / 1000
  })
  valeurs[points] = 1
  return { duree, easing: `linear(${valeurs.join(', ')})` }
}
