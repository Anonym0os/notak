import { type Element, type Image as ContenuImage, type Operation, nouvelId } from '../../coeur/tableau'
import { commencerEnvoi } from '../envois'
import { lireDimensions, lireTransparence } from './lecture'
import type { ContexteToile, DepotFichiers } from '../types'
import { type TailleUG, TAILLE_MAX, TYPES_ACCEPTES, hauteurPour, largeurInitiale, nombreColonnes, placerImages } from './geometrie'

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
    const transparente = await lireTransparence(f)
    const contenu = {
      type: 'image' as const,
      largeurOrigine: d.largeur,
      hauteurOrigine: d.hauteur,
      typeMime: f.type,
      ...(transparente !== undefined ? { transparente } : {}),
    }
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
