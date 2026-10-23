import { type Commentaire, type Id, type Operation, type Tableau, annoter } from '../../coeur/tableau'
import { epinglerEn } from './fil'

/** L'épingle s'aimante à la grille de 10 px. */
const GRILLE = 10

/** Un point de la carte (pixels), aimanté à la grille et borné à la carte. */
export const pointDePose = (x: number, y: number, largeur: number, hauteur: number): { x: number; y: number } => ({
  x: Math.max(0, Math.min(largeur, Math.round(x / GRILLE) * GRILLE)),
  y: Math.max(0, Math.min(hauteur, Math.round(y / GRILLE) * GRILLE)),
})

/**
 * Lâcher un fil de la toile sur un élément : le fil devient l'épingle de cet élément, à l'endroit du dépôt
 * (`x`, `y` : pixels depuis le coin haut gauche de la carte). Rend les pas (le fil disparaît de la toile, l'élément le
 * reprend), ou `null` si ce n'est pas possible : pas un fil, un fil sans message, la cible est un fil, une colonne
 * ou porte déjà le sien.
 */
export function attacherFil(tableau: Tableau, filId: Id, cibleId: Id, x: number, y: number): Operation[] | null {
  if (filId === cibleId) return null
  const fil = tableau.elements.find((e) => e.id === filId)
  const cible = tableau.elements.find((e) => e.id === cibleId)
  if (!fil || fil.contenu.type !== 'commentaire' || !cible) return null
  if (fil.contenu.messages.length === 0) return null
  if (cible.contenu.type === 'commentaire' || cible.contenu.type === 'colonne' || cible.commentaire?.messages.length) return null
  const { replie: _, ...ouvert } = fil.contenu
  const attache: Commentaire = epinglerEn(ouvert, x, y)
  const poser = annoter(cible, { commentaire: attache })
  return poser ? [{ type: 'supprimer', element: fil }, poser] : null
}
