import { type Element, type Lieu, type PositionLieu, nouvelId } from '../../coeur/tableau'

export const LARGEUR_LIEU = 24

export const nouveauLieu = (x: number, y: number): Element<Lieu> => ({
  id: nouvelId(),
  x,
  y,
  largeur: LARGEUR_LIEU,
  contenu: { type: 'lieu', adresse: '' },
})

/** Ce qu'on cherche sur la carte : le nom du lieu puis son adresse, sur une ligne. */
export function requete(c: Lieu): string {
  return [c.nom, c.adresse]
    .map((t) => t?.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ')
}

/** Le lien qui ouvre ce lieu sur OpenStreetMap ; `null` s'il n'y a rien à chercher. */
export function urlCarte(c: Lieu): string | null {
  const q = requete(c)
  return q ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}` : null
}

/** Ce qu'on lit d'un lieu dans une liste : son nom, sinon la première ligne de son adresse. */
export function resume(c: Lieu): string {
  return c.nom?.trim() || c.adresse.split('\n')[0]?.trim() || 'Lieu'
}

/** Un lieu qui n'a ni nom ni adresse. */
export const lieuVide = (c: Lieu) => !c.nom?.trim() && !c.adresse.trim()

/** La position gardée, si elle répond bien à l'adresse d'aujourd'hui ; sinon `undefined` (à retrouver). */
export function positionValable(c: Lieu): PositionLieu | undefined {
  return c.position && c.position.pour === requete(c) ? c.position : undefined
}

/** Demi-largeur de la carte intégrée, en degrés : de quoi voir le quartier. */
const DEMI_CARTE = 0.004

/** La carte OpenStreetMap à intégrer (iframe), centrée sur la position avec une épingle. */
export function urlCarteIntegree({ lat, lon }: Pick<PositionLieu, 'lat' | 'lon'>): string {
  const bbox = [lon - DEMI_CARTE * 1.6, lat - DEMI_CARTE, lon + DEMI_CARTE * 1.6, lat + DEMI_CARTE].map((n) => n.toFixed(5)).join(',')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lon.toFixed(5)}`
}

/** Un contenu de lieu qui garde cette position (ou la perd, si on ne la connaît pas). */
export function avecPosition(c: Lieu, position: { lat: number; lon: number } | null): Lieu {
  const { position: _, ...reste } = c
  return position && Number.isFinite(position.lat) && Number.isFinite(position.lon) ? { ...reste, position: { ...position, pour: requete(c) } } : reste
}
