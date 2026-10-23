import { type Element, type Image as ContenuImage, type Operation, nouvelId } from '../../coeur/tableau'
import { commencerEnvoi } from '../envois'
import type { ContexteToile, DepotFichiers } from '../types'
import { type TailleUG, TAILLE_MAX, TYPES_ACCEPTES, hauteurPour, largeurInitiale, nombreColonnes, placerImages } from './geometrie'

/** Les dimensions d'une image en pixels, ou `null` si elle ne se lit pas. */
async function lireDimensions(fichier: Blob): Promise<{ largeur: number; hauteur: number } | null> {
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

export function recevoirImages(donnees: DataTransfer, ou: { x: number; y: number }, contexte: ContexteToile) {
  // Pris tout de suite : le navigateur vide le presse-papiers dès qu'on rend la main.
  const fichiers = [...donnees.files].filter((f) => TYPES_ACCEPTES.includes(f.type) && f.size <= TAILLE_MAX)
  const depot = contexte.services.fichiers
  if (!depot || fichiers.length === 0) return null
  return poserImages(fichiers, ou, contexte, depot)
}

/** Les images naissent dès que leurs dimensions sont lues ; l'envoi suit (voir `envois.ts`). */
async function poserImages(fichiers: File[], ou: { x: number; y: number }, contexte: ContexteToile, depot: DepotFichiers): Promise<Operation[]> {
  const lues: { fichier: Blob; contenu: Omit<ContenuImage, 'fichier'>; largeur: number }[] = []
  for (const f of fichiers) {
    const d = await lireDimensions(f)
    if (!d) continue
    const contenu = { type: 'image' as const, largeurOrigine: d.largeur, hauteurOrigine: d.hauteur, typeMime: f.type }
    lues.push({ fichier: f, contenu, largeur: largeurInitiale(d.largeur) })
  }
  if (lues.length === 0) return []

  const tailles: TailleUG[] = lues.map((l) => ({ largeur: l.largeur, hauteur: hauteurPour(l.largeur, l.contenu) }))
  const positions = placerImages(tailles, ou, nombreColonnes(contexte.largeurVue()))
  const elements: Element[] = []
  for (const [i, l] of lues.entries()) {
    const [x, y] = positions[i]!
    elements.push({
      id: nouvelId(),
      x,
      y,
      largeur: l.largeur,
      contenu: { ...l.contenu, fichier: commencerEnvoi(l.fichier, depot) },
    })
  }
  return elements.map((element) => ({ type: 'creer' as const, element }))
}
