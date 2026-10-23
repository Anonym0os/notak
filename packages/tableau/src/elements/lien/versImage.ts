import type { Element, Id, Image, Lien, Operation } from '../../coeur/tableau'
import { largeurInitiale } from '../image/geometrie'
import { lireDimensions, lireTransparence } from '../image/lecture'
import type { ContexteToile } from '../types'

/** L'adresse nomme une image (webp, gif, png, jpg, jpeg) : pas besoin d'aperçu pour savoir ce que c'est. */
export const estAdresseImage = (url: string) => /\.(webp|gif|png|jpe?g)(?=$|[?#&/])/i.test(url)

/** Ce que devient la carte d'un lien dont l'adresse mène à une image : une image, à la largeur d'une image neuve. */
export function operationsEnImage(element: Element<Lien>, fichier: Id, type: string, d: { largeur: number; hauteur: number; transparente?: boolean }): Operation[] {
  const apres: Image = { type: 'image', fichier, largeurOrigine: d.largeur, hauteurOrigine: d.hauteur, typeMime: type }
  if (d.transparente !== undefined) apres.transparente = d.transparente
  const legende = element.contenu.legende?.trim()
  if (legende) apres.legende = legende
  const pas: Operation[] = [{ type: 'contenu', id: element.id, avant: element.contenu, apres }]
  const largeur = largeurInitiale(d.largeur)
  if (largeur !== element.largeur) pas.push({ type: 'redimensionner', id: element.id, de: element.largeur, vers: largeur })
  // La hauteur donnée à une carte de lien n'a plus de sens pour une image, qui suit ses proportions.
  if (element.hauteur) pas.push({ type: 'borner', id: element.id, de: element.hauteur, vers: null })
  return pas
}

/**
 * Rapatrie l'image de ce lien et change la carte en image. Rend `false` si ce n'est pas possible (pas de service,
 * site qui refuse, image illisible) : la carte reste alors un lien, avec l'image en aperçu.
 * `siEnAttente` : la conversion part sans attendre l'aperçu ; s'il arrive avant, il gagne et la carte reste un lien.
 */
export async function convertirEnImage(id: Id, url: string, contexte: ContexteToile, siEnAttente = false): Promise<boolean> {
  const { rapatrier, fichiers } = contexte.services
  if (!rapatrier || !fichiers || contexte.services.lectureSeule) return false
  try {
    const { id: fichier, type } = await rapatrier(url)
    const adresse = await fichiers.adresse(fichier)
    const blob = adresse ? await (await fetch(adresse)).blob() : null
    const d = blob && (await lireDimensions(blob))
    if (!blob || !d) return false
    const transparente = await lireTransparence(blob)
    // Pendant le rapatriement, la carte a pu changer d'adresse ou disparaître.
    const present = contexte.magasin.lire().elements.find((e) => e.id === id)
    if (!present || present.contenu.type !== 'lien' || present.contenu.url !== url) return false
    if (siEnAttente && present.contenu.statut !== 'attente') return false
    contexte.magasin.corriger(operationsEnImage(present as Element<Lien>, fichier, type, { ...d, ...(transparente !== undefined ? { transparente } : {}) }))
    return true
  } catch {
    return false
  }
}
