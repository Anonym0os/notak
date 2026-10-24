import type { Arbre, Element, Id } from '../../coeur/tableau'
import { t } from '../../langue'
import { nomFichier, telechargerOctets } from '../document/export'
import type { ContexteToile } from '../types'
import { lire } from './modele/sujets'
import { type ImageAExporter, ecrireXmind } from './xmind'

export const MIME_IMAGE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' }

/** « Exporter en .xmind » : les cartes données, une feuille chacune, avec leurs images. */
export async function exporterCartes(els: readonly Element[], contexte: ContexteToile) {
  const cartes = els.flatMap((e) => (e.contenu.type === 'arbre' ? [{ titre: titreDe(e.contenu), arbre: e.contenu }] : []))
  const images = new Map<Id, ImageAExporter>()
  for (const { arbre } of cartes)
    for (const s of Object.values(arbre.sujets)) {
      const fichier = s?.image?.fichier
      if (!fichier || images.has(fichier) || !contexte.services.fichiers) continue
      const adresse = await contexte.services.fichiers.adresse(fichier)
      if (!adresse) continue
      try {
        const reponse = await fetch(adresse)
        const type = reponse.headers.get('content-type') ?? ''
        const extension = Object.entries(MIME_IMAGE).find(([, m]) => type.startsWith(m))?.[0] ?? 'png'
        images.set(fichier, { fichier, octets: new Uint8Array(await reponse.arrayBuffer()), extension })
      } catch {
        // Une image injoignable n'empêche pas l'export : le sujet part sans elle.
      }
    }
  telechargerOctets(nomFichier(cartes[0]?.titre ?? t('type.arbre'), 'xmind'), ecrireXmind(cartes, images), 'application/vnd.xmind.workbook')
}

function titreDe(a: Arbre): string {
  const l = lire(a)
  return l.sujets.get(l.central)?.titre.replace(/\n/g, ' ') || t('type.arbre')
}
