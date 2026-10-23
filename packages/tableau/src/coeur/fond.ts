/** L'arrière-plan d'un tableau : une couleur de canevas (nommée ou libre) et la grille de points. */
export interface Fond {
  /** Un nom du canevas (`bleu`, `vert`, `jaune`, `grisChaud`) ou une couleur libre `#rrggbb`. Absent : le gris. */
  couleur?: string
  /** La grille de points, allumée tant qu'on ne l'éteint pas. */
  points?: boolean
}

/** Les couleurs nommées du canevas, en clair et en sombre (le gris est le défaut, il ne s'écrit pas). */
export const CANEVAS = {
  gris: { clair: '#ebedee', sombre: '#1d1d1d' },
  bleu: { clair: '#dceaf6', sombre: '#1c2624' },
  vert: { clair: '#d9ebe6', sombre: '#27241f' },
  jaune: { clair: '#f0eedf', sombre: '#1c2329' },
  grisChaud: { clair: '#e5e3e8', sombre: '#26232a' },
} as const

export type NomCanevas = keyof typeof CANEVAS
export const NOMS_CANEVAS = Object.keys(CANEVAS) as NomCanevas[]

const HEX = /^#[0-9a-f]{6}$/i

export const estNomme = (c: string | undefined): c is NomCanevas => !!c && c in CANEVAS && c !== 'gris'
export const estLibre = (c: string | undefined): c is string => !!c && HEX.test(c)

/** Le fond tel qu'il se range : sans clé vide, et `undefined` quand c'est le défaut (gris, points). */
export function fondRange(f: Fond): Fond | undefined {
  const couleur = estNomme(f.couleur) || estLibre(f.couleur) ? f.couleur : undefined
  const fond: Fond = { ...(couleur ? { couleur } : {}), ...(f.points === false ? { points: false } : {}) }
  return Object.keys(fond).length > 0 ? fond : undefined
}

/** La grille de points est-elle allumée ? */
export const pointsAllumes = (f: Fond | undefined) => f?.points !== false

/** Le fond de la toile est-il celui d'origine ? */
export const fondParDefaut = (f: Fond | undefined) => !f || !fondRange(f)

/** Une luminance perçue de 0 à 1 pour une couleur `#rrggbb`. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** Un fond libre assez sombre pour qu'on y pose une grille et des repères clairs. */
export const estSombre = (hex: string) => luminance(hex) < 0.45

/** Lit un fond venu d'un document partagé (un autre client a pu y écrire n'importe quoi). */
export function lireFond(brut: unknown): Fond | undefined {
  if (!brut || typeof brut !== 'object') return undefined
  const { couleur, points } = brut as { couleur?: unknown; points?: unknown }
  const fond: Fond = {
    ...(typeof couleur === 'string' && (estNomme(couleur) || estLibre(couleur)) ? { couleur } : {}),
    ...(points === false ? { points: false } : {}),
  }
  return Object.keys(fond).length > 0 ? fond : undefined
}
