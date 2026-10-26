/**
 * Les conversions entre une saisie (« #abc », « 80 % ») et la valeur d'une couleur (`#rrggbb`, ou `#rrggbbaa` quand elle
 * est translucide), pour le sélecteur de couleur commun.
 */

const HEX6 = /^#[0-9a-f]{6}$/i
const HEX8 = /^#[0-9a-f]{8}$/i

export const estCouleur = (v: unknown): v is string => typeof v === 'string' && (HEX6.test(v) || HEX8.test(v))

/**
 * Ce qu'on a saisi dans le champ hexadécimal, ramené à six chiffres : « abc » devient « aabbcc », un hexa trop court
 * est complété de zéros, ce qui n'est pas hexadécimal s'ignore. Rend `#rrggbb` en minuscules.
 */
export function normaliserHex(saisie: string): string {
  const brut = saisie.replace(/[^0-9a-f]/gi, '').toLowerCase()
  const hex = brut.length === 3 ? [...brut].map((c) => c + c).join('') : brut.padEnd(6, '0').slice(0, 6)
  return `#${hex}`
}

/** La couleur d'une valeur (`#rrggbb` ou `#rrggbbaa`) et son opacité en pour cent. */
export function decouperCouleur(valeur: string): { hex: string; opacite: number } {
  if (HEX8.test(valeur)) return { hex: valeur.slice(0, 7).toLowerCase(), opacite: Math.round((parseInt(valeur.slice(7), 16) / 255) * 100) }
  return { hex: HEX6.test(valeur) ? valeur.toLowerCase() : '#000000', opacite: 100 }
}

/** La valeur à écrire : `#rrggbb` tant que la couleur est pleine, `#rrggbbaa` sinon. */
export function assemblerCouleur(hex: string, opacite: number): string {
  const o = Math.max(0, Math.min(100, Math.round(opacite)))
  const base = normaliserHex(hex)
  return o >= 100 ? base : `${base}${Math.round((o / 100) * 255).toString(16).padStart(2, '0')}`
}

/** La couleur à montrer dans un champ `type=color` : sans l'opacité. */
export const sansOpacite = (valeur: string): string => decouperCouleur(valeur).hex
