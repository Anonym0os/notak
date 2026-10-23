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

/** Le code tel qu'on l'affiche : `#4F8CFF`. */
export const codeAffiche = (couleur: string) => couleur.toUpperCase()

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
