import type { Element, Fichier, Image } from '../../coeur/tableau'
import { ECART_TELECHARGEMENTS_MS, EXTENSIONS, telechargerFichier } from '../../telecharger'
import type { ContexteToile } from '../types'

/** Ce qu'on peut télécharger : une image, un fichier. */
const telechargeable = (e: Element): e is Element<Image | Fichier> => e.contenu.type === 'image' || e.contenu.type === 'fichier'

export const peutTelecharger = (elements: Element[], contexte: ContexteToile) =>
  !!contexte.services.fichiers && elements.length > 0 && elements.every(telechargeable)

/** Le nom du fichier téléchargé : celui de l'envoi, sinon « image » et l'extension de son type. */
export function nomTelecharge(c: Element['contenu']): string {
  if (c.type === 'fichier') return c.nom
  const mime = c.type === 'image' ? c.typeMime : undefined
  return `image.${(mime?.startsWith('image/') && EXTENSIONS[mime]) || 'png'}`
}

/**
 * Télécharge l'original de chaque image ou fichier choisi, tel qu'il a été envoyé, l'un après l'autre, à un instant
 * d'écart : l'app de Mac ne garderait que le dernier de liens suivis coup sur coup (`ECART_TELECHARGEMENTS_MS`).
 */
export async function telecharger(elements: Element[], contexte: ContexteToile) {
  let premier = true
  for (const e of elements) {
    if (!telechargeable(e)) continue
    const adresse = await contexte.services.fichiers?.adresse(e.contenu.fichier)
    if (!adresse) continue
    if (!premier) await new Promise((fin) => setTimeout(fin, ECART_TELECHARGEMENTS_MS))
    premier = false
    await telechargerFichier(adresse, nomTelecharge(e.contenu), e.contenu.typeMime)
  }
}
