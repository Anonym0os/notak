/** Les dimensions d'une image en pixels, ou `null` si elle ne se lit pas. */
export async function lireDimensions(fichier: Blob): Promise<{ largeur: number; hauteur: number } | null> {
  try {
    if (fichier.type !== 'image/svg+xml') {
      const bitmap = await createImageBitmap(fichier)
      const d = { largeur: bitmap.width, hauteur: bitmap.height }
      bitmap.close()
      return d.largeur > 0 && d.hauteur > 0 ? d : null
    }
  } catch {
    return null
  }
  // Un SVG passe par une balise `img` ; sans dimensions déclarées, le navigateur en invente une par défaut.
  const adresse = URL.createObjectURL(fichier)
  try {
    const img = new Image()
    img.src = adresse
    await img.decode()
    return { largeur: img.naturalWidth || 300, hauteur: img.naturalHeight || 150 }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(adresse)
  }
}

/** Côté le plus long de la copie sur laquelle on cherche la transparence : assez pour la voir, pas pour peser. */
const COTE_LECTURE = 64
/** Un pixel est transparent s'il laisse passer plus d'un vingtième de la lumière. */
const ALPHA_OPAQUE = 242
/** Une image est transparente quand au moins un pixel sur cent l'est (un bord adouci ne compte pas). */
const PART_TRANSPARENTE = 0.01

/** Dit si ces pixels (RGBA, quatre octets chacun) laissent voir ce qu'il y a derrière. */
export function aDesTransparences(pixels: ArrayLike<number>): boolean {
  const total = Math.floor(pixels.length / 4)
  if (total === 0) return false
  let clairs = 0
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! < ALPHA_OPAQUE) clairs++
  return clairs / total >= PART_TRANSPARENTE
}

/**
 * Lit dans l'image si elle est transparente, sur une copie réduite. `undefined` si elle ne se lit pas : l'ombre
 * se devine alors au type du fichier.
 */
export async function lireTransparence(fichier: Blob): Promise<boolean | undefined> {
  if (fichier.type === 'image/jpeg') return false
  const adresse = URL.createObjectURL(fichier)
  try {
    const img = new Image()
    img.src = adresse
    await img.decode()
    const [l, h] = [img.naturalWidth || 300, img.naturalHeight || 150]
    const k = Math.min(1, COTE_LECTURE / Math.max(l, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(l * k))
    canvas.height = Math.max(1, Math.round(h * k))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return undefined
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return aDesTransparences(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(adresse)
  }
}
