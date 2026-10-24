import type { Arbre, Element, Id } from '../../coeur/tableau'
import { t } from '../../langue'
import { nomFichier, telechargerOctets } from '../document/export'
import type { ContexteToile } from '../types'
import { svgVignette } from './catalogue'
import { lire } from './modele/sujets'
import { type ImageAExporter, ecrireXmind } from './xmind'

export const MIME_IMAGE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' }

/** Ce qu'une carte demande de fichiers à l'export : ses images, ses pièces jointes, les images de ses marqueurs à soi. */
export function fichiersDeLaCarte(a: Arbre): { fichier: Id; nom?: string }[] {
  const sortie: { fichier: Id; nom?: string }[] = []
  for (const s of Object.values(a.sujets)) {
    if (s?.image?.fichier) sortie.push({ fichier: s.image.fichier })
    if (s?.piece?.fichier) sortie.push({ fichier: s.piece.fichier, nom: s.piece.nom })
  }
  for (const g of Object.values(a.groupes ?? {})) for (const m of g?.marqueurs ?? []) sortie.push({ fichier: m.fichier, nom: m.nom })
  return sortie
}

/** La clé sous laquelle l'export retrouve l'image d'un autocollant ou d'une illustration (voir `xmind.ts`). */
export const cleVignette = (v: { genre: string; id: string }) => `vignette:${v.genre}:${v.id}`

/** « Exporter en .xmind » : les cartes données, une feuille chacune, avec leurs images. */
export async function exporterCartes(els: readonly Element[], contexte: ContexteToile) {
  const cartes = els.flatMap((e) => (e.contenu.type === 'arbre' ? [{ titre: titreDe(e.contenu), arbre: e.contenu }] : []))
  const images = new Map<Id, ImageAExporter>()
  for (const { arbre } of cartes) {
    for (const { fichier, nom } of fichiersDeLaCarte(arbre)) {
      if (images.has(fichier) || !contexte.services.fichiers) continue
      const adresse = await contexte.services.fichiers.adresse(fichier)
      if (!adresse) continue
      try {
        const reponse = await fetch(adresse)
        const type = reponse.headers.get('content-type') ?? ''
        const extension = Object.entries(MIME_IMAGE).find(([, m]) => type.startsWith(m))?.[0] ?? (nom?.includes('.') ? nom.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : '') ?? 'png'
        images.set(fichier, { fichier, octets: new Uint8Array(await reponse.arrayBuffer()), extension: extension || 'png' })
      } catch {
        // Un fichier injoignable n'empêche pas l'export : le sujet part sans lui.
      }
    }
    // Un autocollant ou une illustration s'écrit en SVG, pour que Xmind le montre.
    for (const s of Object.values(arbre.sujets)) {
      if (!s?.vignette || s.image) continue
      const cle = cleVignette(s.vignette)
      if (!images.has(cle)) images.set(cle, { fichier: cle, octets: new TextEncoder().encode(await svgVignette(s.vignette)), extension: 'svg' })
    }
  }
  telechargerOctets(nomFichier(cartes[0]?.titre ?? t('type.arbre'), 'xmind'), ecrireXmind(cartes, images), 'application/vnd.xmind.workbook')
}

function titreDe(a: Arbre): string {
  const l = lire(a)
  return l.sujets.get(l.central)?.titre.replace(/\n/g, ' ') || t('type.arbre')
}
