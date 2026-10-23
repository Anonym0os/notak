import { type Element, type Lieu, nouvelId } from '../../coeur/tableau'

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
