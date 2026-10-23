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
