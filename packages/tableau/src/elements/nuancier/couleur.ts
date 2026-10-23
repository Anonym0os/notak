import { type Element, type Nuancier, nouvelId } from '../../coeur/tableau'

export const LARGEUR_NUANCIER = 17
/** Largeur sur hauteur : 17 × 12 UG. */
export const PROPORTION_NUANCIER = 17 / 12
export const COULEUR_DEPART = '#4f8cff'

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

/** Le code tel qu'on l'affiche : `#4F8CFF`, `rgb(79, 140, 255)` ou `hsl(219, 100%, 65%)`. */
export function codeAffiche(couleur: string, format: FormatCode = 'hex'): string {
  if (!/^#[0-9a-f]{6}$/i.test(couleur) || format === 'hex') return couleur.toUpperCase()
  if (format === 'rgb') return `rgb(${canaux(couleur).join(', ')})`
  const [h, s, l] = teinteSaturationLuminosite(couleur)
  return `hsl(${h}, ${s}%, ${l}%)`
}

export const nouveauNuancier = (x: number, y: number, couleur = COULEUR_DEPART): Element<Nuancier> => ({
  id: nouvelId(),
  x,
  y,
  largeur: LARGEUR_NUANCIER,
  contenu: { type: 'nuancier', couleur },
})

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
