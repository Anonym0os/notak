import type { Element } from '../../coeur/tableau'
import type { ContexteToile } from '../types'

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' }

/** Ce qu'on peut télécharger : une image, un fichier. */
const telechargeable = (e: Element): e is Element & { contenu: { fichier: string } } => e.contenu.type === 'image' || e.contenu.type === 'fichier'

export const peutTelecharger = (elements: Element[], contexte: ContexteToile) =>
  !!contexte.services.fichiers && elements.length > 0 && elements.every(telechargeable)

/** Le nom du fichier téléchargé : celui de l'envoi, sinon « image » et l'extension de son type. */
export function nomTelecharge(c: Element['contenu']): string {
  if (c.type === 'fichier') return c.nom
  const mime = c.type === 'image' ? c.typeMime : undefined
  return `image.${(mime && EXTENSIONS[mime]) ?? 'png'}`
}

/** Télécharge l'original de chaque image ou fichier choisi, tel qu'il a été envoyé. */
export async function telecharger(elements: Element[], contexte: ContexteToile) {
  for (const e of elements) {
    if (!telechargeable(e)) continue
    const adresse = await contexte.services.fichiers?.adresse(e.contenu.fichier)
    if (!adresse) continue
    const a = document.createElement('a')
    a.href = adresse
    a.download = nomTelecharge(e.contenu)
    a.rel = 'noopener'
    a.click()
  }
}
