/** Combien de couleurs on garde au plus, et le côté de la copie sur laquelle on les lit. */
export const COULEURS_MAX = 10
const COTE_PALETTE = 96
/** Chaque canal est rangé en cinq paliers : les pixels d'un même palier font une seule couleur. */
const PALIERS = 5
/** Un pixel plus d'à moitié transparent ne compte pas. */
const ALPHA_MIN = 128

const hex = (v: number) => v.toString(16).padStart(2, '0')

/**
 * Les couleurs dominantes de ces pixels (RGBA, quatre octets chacun) : un histogramme à 5 × 5 × 5 cases, la moyenne
 * de chaque case, les cases les plus remplies d'abord, en `#rrggbb`.
 */
export function paletteDePixels(pixels: ArrayLike<number>, max = COULEURS_MAX): string[] {
  const cases = new Map<number, { n: number; r: number; v: number; b: number }>()
  const pas = 256 / PALIERS
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3]! < ALPHA_MIN) continue
    const [r, v, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]
    const cle = (Math.floor(r / pas) * PALIERS + Math.floor(v / pas)) * PALIERS + Math.floor(b / pas)
    const c = cases.get(cle)
    if (c) {
      c.n++
      c.r += r
      c.v += v
      c.b += b
    } else cases.set(cle, { n: 1, r, v, b })
  }
  // À égalité, la première case rencontrée reste devant (tri stable).
  return [...cases.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => `#${hex(Math.round(c.r / c.n))}${hex(Math.round(c.v / c.n))}${hex(Math.round(c.b / c.n))}`)
}

/** Les couleurs dominantes d'une image, lues sur une copie réduite ; vide si elle ne se lit pas. */
export async function lirePalette(fichier: Blob): Promise<string[]> {
  const adresse = URL.createObjectURL(fichier)
  try {
    const img = new Image()
    img.src = adresse
    await img.decode()
    const [l, h] = [img.naturalWidth || 300, img.naturalHeight || 150]
    const k = Math.min(1, COTE_PALETTE / Math.max(l, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(l * k))
    canvas.height = Math.max(1, Math.round(h * k))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return []
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return paletteDePixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
  } catch {
    return []
  } finally {
    URL.revokeObjectURL(adresse)
  }
}
