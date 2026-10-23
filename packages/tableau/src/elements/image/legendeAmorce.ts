/**
 * Le caractère tapé sur une image choisie, qui devient le début de sa légende : la toile le dépose ici avant de
 * passer l'image en édition, et le champ de la légende le reprend une fois, à son ouverture.
 */
let amorce = ''

export const amorcerLegende = (caractere: string) => {
  amorce = caractere
}

export function prendreAmorce(): string {
  const a = amorce
  amorce = ''
  return a
}
