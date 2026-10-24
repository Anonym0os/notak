/**
 * Les couleurs de l'onglet Carte : la grille fixe du sélecteur, et les conversions entre une saisie (« #abc », « 80 % »)
 * et la valeur écrite dans la carte (`#rrggbb`, ou `#rrggbbaa` quand elle est translucide).
 */

/** La grille du sélecteur : neuf neutres du blanc au noir, puis quatre rangées de neuf teintes, du clair au soutenu. */
export const GRILLE_COULEURS: readonly string[] = [
  '#ffffff', '#e5e7eb', '#c9ced6', '#a3aab5', '#7c8491', '#5b6370', '#3a404a', '#1f2329', '#000000',
  '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#99f6e4', '#bfdbfe', '#c7d2fe', '#e9d5ff', '#fbcfe8',
  '#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#818cf8', '#c084fc', '#f472b6',
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#4f46e5', '#9333ea', '#db2777',
  '#991b1b', '#9a3412', '#854d0e', '#166534', '#115e59', '#1e40af', '#3730a3', '#6b21a8', '#9d174d',
]

/** Les colonnes de la grille. */
export const COLONNES_GRILLE = 9

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

/** Ajoute une couleur à la liste des récentes : en tête, sans doublon, `max` au plus. */
export function recentes(liste: readonly string[], couleur: string, max = 9): string[] {
  const v = couleur.toLowerCase()
  return [v, ...liste.filter((x) => x.toLowerCase() !== v)].slice(0, max)
}

/** Le dégradé conique d'un jeu de six couleurs : six secteurs de 60°, départ en haut, sens horaire. */
export function degradeConique(couleurs: readonly string[]): string {
  const six = Array.from({ length: 6 }, (_, i) => couleurs[i % Math.max(1, couleurs.length)] ?? '#999999')
  return `conic-gradient(from 0deg, ${six.map((c, i) => `${c} ${i * 60}deg ${(i + 1) * 60}deg`).join(', ')})`
}
