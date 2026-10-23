/** Le titre d'un tableau ne dépasse pas cette longueur, en caractères. */
export const TITRE_MAX = 100

/**
 * Ce que devient un titre saisi à la validation : espaces de bord retirés, retours à la ligne ramenés à une
 * espace, coupé à 100 caractères. `null` quand il n'y a rien à écrire : titre vide (l'ancien revient) ou inchangé.
 */
export function titreValide(saisie: string, ancien: string): string | null {
  const titre = Array.from(saisie.replace(/\s+/g, ' ').trim()).slice(0, TITRE_MAX).join('').trim()
  return titre === '' || titre === ancien ? null : titre
}
