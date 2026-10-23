import { type Element, type Nuancier, nouvelId } from '../../coeur/tableau'
import { langue } from '../../langue'

export const LARGEUR_NUANCIER = 17
/** Largeur sur hauteur : 17 × 12 UG. */
export const PROPORTION_NUANCIER = 17 / 12
export const COULEUR_DEPART = '#4f8cff'
/** Sous cette largeur (UG), le code ne s'écrit plus sur l'aplat, comme chez Milanote. */
export const LARGEUR_SANS_CODE = 15

/** Les couleurs qu'un nuancier neuf prend tour à tour, tant que le tableau n'en suggère pas d'autres. */
export const PALETTE_DEPART = ['#4f8cff', '#ff7a59', '#2ec4b6', '#ffbf47', '#9b6bff', '#ef5da8', '#58b368', '#3fa7d6', '#e5534b', '#8d6e63']
let indiceDepart = 0
/** La couleur du prochain nuancier posé (la suivante de la palette à chaque pose). */
export const couleurSuivante = (): string => PALETTE_DEPART[indiceDepart++ % PALETTE_DEPART.length]!

const CLE_FORMAT = 'notak.nuancier.format'
/** Le dernier format choisi (HEX par défaut) : les nuanciers suivants le prennent. */
export function formatPrefere(): FormatCode | 'rien' {
  try {
    const f = globalThis.localStorage?.getItem(CLE_FORMAT)
    return f === 'rgb' || f === 'hsl' || f === 'rien' ? f : 'hex'
  } catch {
    return 'hex'
  }
}
export function retenirFormat(f: FormatCode | 'rien') {
  try {
    globalThis.localStorage?.setItem(CLE_FORMAT, f)
  } catch {
    /* le navigateur refuse le stockage : le format ne se retient pas */
  }
}

/**
 * Un code couleur écrit à la main (`#4F8CFF`, `4f8cff`, `#48f`) devient `#rrggbb` en minuscules ;
 * ce qui n'en est pas un rend `null`.
 */
export function normaliserHex(texte: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(texte.trim())
  if (!m) return null
  const h = m[1]!.toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
}

export type FormatCode = NonNullable<Nuancier['format']>

/** Les formats du code, dans l'ordre du menu « Affichage ». */
export const FORMATS_CODE: readonly FormatCode[] = ['hex', 'rgb', 'hsl']

/** Rouge, vert, bleu (0 à 255) d'une couleur `#rrggbb`. */
const canaux = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Teinte (0 à 359), saturation et luminosité (0 à 100) d'une couleur `#rrggbb`. */
function teinteSaturationLuminosite(hex: string): [number, number, number] {
  const [r, g, b] = canaux(hex).map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, Math.round(l * 100)]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)]
}

/** Le code tel qu'on l'affiche, nu comme chez Milanote : `#4F8CFF`, `79,140,255` ou `219,100%,65%`. */
export function codeAffiche(couleur: string, format: FormatCode = 'hex'): string {
  if (!/^#[0-9a-f]{6}$/i.test(couleur) || format === 'hex') return couleur.toUpperCase()
  if (format === 'rgb') return canaux(couleur).join(',')
  const [h, s, l] = teinteSaturationLuminosite(couleur)
  return `${h},${s}%,${l}%`
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** Teinte (degrés), saturation et luminosité (0 à 1) vers `#rrggbb`. */
function depuisTSL(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[f(0), f(8), f(4)].map((v) => hex2(v * 255)).join('')}`
}

/**
 * Ce qu'on tape ou colle dans le code d'un nuancier : un hexadécimal (avec ou sans dièse, 3 ou 6 chiffres),
 * `rgb(79, 140, 255)`, `hsl(219, 100%, 65%)`, ou « 79,140,255 » ; rend `#rrggbb`, ou `null`.
 */
export function analyserCode(texte: string): string | null {
  const hex = normaliserHex(texte)
  if (hex) return hex
  const m = /^(?:(rgb|hsl)a?\s*\(\s*)?(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)(%?)\s*[, ]\s*(-?\d+(?:\.\d+)?)(%?)\s*\)?$/i.exec(texte.trim())
  if (!m) return null
  const [a, b, c] = [Number(m[2]), Number(m[3]), Number(m[5])]
  const hsl = m[1]?.toLowerCase() === 'hsl' || (!m[1] && m[4] === '%' && m[6] === '%')
  if (hsl) {
    if (a < 0 || a > 360 || b < 0 || b > 100 || c < 0 || c > 100) return null
    return depuisTSL(a % 360, b / 100, c / 100)
  }
  if ([a, b, c].some((v) => v < 0 || v > 255) || m[4] || m[6]) return null
  return `#${[a, b, c].map(hex2).join('')}`
}

/** Quelques couleurs nommées (hex, anglais, français) : la légende d'un nuancier neuf porte le nom de la plus proche. */
const NOMS: readonly (readonly [string, string, string])[] = [
  ['#000000', 'Black', 'Noir'],
  ['#ffffff', 'White', 'Blanc'],
  ['#808080', 'Gray', 'Gris'],
  ['#c0c0c0', 'Silver', 'Argent'],
  ['#ff0000', 'Red', 'Rouge'],
  ['#8b0000', 'Dark Red', 'Rouge sombre'],
  ['#ff6347', 'Tomato', 'Tomate'],
  ['#ff7f50', 'Coral', 'Corail'],
  ['#fa8072', 'Salmon', 'Saumon'],
  ['#ffa500', 'Orange', 'Orange'],
  ['#ff8c00', 'Dark Orange', 'Orange foncé'],
  ['#ffd700', 'Gold', 'Or'],
  ['#ffff00', 'Yellow', 'Jaune'],
  ['#f0e68c', 'Khaki', 'Kaki clair'],
  ['#bfff00', 'Lime', 'Citron vert'],
  ['#32cd32', 'Lime Green', 'Vert lime'],
  ['#008000', 'Green', 'Vert'],
  ['#006400', 'Dark Green', 'Vert foncé'],
  ['#3cb371', 'Sea Green', 'Vert mer'],
  ['#98fb98', 'Mint', 'Menthe'],
  ['#008080', 'Teal', 'Sarcelle'],
  ['#40e0d0', 'Turquoise', 'Turquoise'],
  ['#00ffff', 'Cyan', 'Cyan'],
  ['#87ceeb', 'Sky Blue', 'Bleu ciel'],
  ['#4f8cff', 'Cornflower Blue', 'Bleuet'],
  ['#1e90ff', 'Dodger Blue', 'Bleu vif'],
  ['#0000ff', 'Blue', 'Bleu'],
  ['#000080', 'Navy', 'Bleu marine'],
  ['#4b0082', 'Indigo', 'Indigo'],
  ['#800080', 'Purple', 'Pourpre'],
  ['#9370db', 'Lavender Purple', 'Lavande'],
  ['#ee82ee', 'Violet', 'Violet'],
  ['#ff00ff', 'Magenta', 'Magenta'],
  ['#ff69b4', 'Hot Pink', 'Rose vif'],
  ['#ffc0cb', 'Pink', 'Rose'],
  ['#dc143c', 'Crimson', 'Cramoisi'],
  ['#800000', 'Maroon', 'Bordeaux'],
  ['#a52a2a', 'Brown', 'Brun'],
  ['#d2691e', 'Chocolate', 'Chocolat'],
  ['#deb887', 'Tan', 'Beige'],
  ['#f5f5dc', 'Beige', 'Écru'],
]

/** Le nom de la couleur la plus proche (`langue` : « fr » ou « en »). */
export function nomDeCouleur(couleur: string, langue: 'fr' | 'en' = 'en'): string {
  if (!/^#[0-9a-f]{6}$/i.test(couleur)) return ''
  const [r, g, b] = canaux(couleur)
  let meilleur = NOMS[0]!
  let ecart = Infinity
  for (const n of NOMS) {
    const [r2, g2, b2] = canaux(n[0])
    // Les verts comptent un peu plus : l'œil les distingue mieux.
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2
    if (d < ecart) [meilleur, ecart] = [n, d]
  }
  return langue === 'fr' ? meilleur[2] : meilleur[1]
}

export const nouveauNuancier = (x: number, y: number, couleur = COULEUR_DEPART): Element<Nuancier> => {
  const format = formatPrefere()
  return {
    id: nouvelId(),
    x,
    y,
    largeur: LARGEUR_NUANCIER,
    contenu: { type: 'nuancier', couleur, ...(format === 'rien' ? { sansCode: true } : format === 'hex' ? {} : { format }) },
  }
}

/** La pipette de l'écran, que tous les navigateurs n'ont pas (`EyeDropper`). */
interface Pipette {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>
}
const pipette = (): (new () => Pipette) | undefined => (globalThis as { EyeDropper?: new () => Pipette }).EyeDropper

export const pipetteDisponible = () => pipette() !== undefined

/** Laisse choisir un pixel de l'écran ; rend sa couleur, ou `null` si on a renoncé (Échap) ou si la pipette manque. */
export async function piocherCouleur(): Promise<string | null> {
  const Pipette = pipette()
  if (!Pipette) return null
  try {
    return normaliserHex((await new Pipette().open()).sRGBHex)
  } catch {
    return null
  }
}

/** Un nuancier posé par un geste (l'outil, un collage) naît avec sa légende : le nom de sa couleur. */
export const avecNomEnLegende = (e: Element<Nuancier>): Element<Nuancier> => ({
  ...e,
  contenu: { ...e.contenu, avecLegende: true, legende: nomDeCouleur(e.contenu.couleur, langue()) },
})
