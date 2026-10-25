import type { Arbre, Element, Id } from '../../coeur/tableau'
import { langue, t, tn } from '../../langue'
import { type Capture, capturerCarte, enBlob, pdfDeCapture } from '../../export/capture'
import { exporterCarte, langueExport } from '../../export/exporter'
import { formatNotakDElement } from '../../export/notakElement'
import type { FormatExport, SujetExport } from '../../export/sujet'
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
  const x = await fabriquerXmind(els, contexte)
  telechargerOctets(x.nom, x.octets, TYPE_XMIND)
}

const TYPE_XMIND = 'application/vnd.xmind.workbook'

/** Le classeur `.xmind` des cartes données, son nom de fichier, et le nombre d'images qu'il emporte. */
async function fabriquerXmind(els: readonly Element[], contexte: ContexteToile): Promise<{ nom: string; octets: Uint8Array; images: number }> {
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
  return { nom: nomFichier(cartes[0]?.titre ?? t('type.arbre'), 'xmind'), octets: ecrireXmind(cartes, images), images: images.size }
}

/** Ce que la carte ouverte montre, pour la photographier : son dessin et le rectangle de ses sujets. */
export interface DessinCarte {
  svg: SVGSVGElement
  emprise: { x: number; y: number; l: number; h: number }
}

/**
 * La carte ouverte, à exporter : en `.notak` (recommandé, comme partout), en image ou en PDF (toute la carte, photographiée hors de l'écran), en `.xmind`, ou
 * en plan (Markdown, texte). `dessin` rend son dessin du moment ; l'aperçu se fait sur lui. Sans dessin (la carte
 * n'est pas ouverte), ni image ni PDF.
 */
export function sujetCarte(element: Element, contexte: ContexteToile, dessin: (() => DessinCarte | null) | null): SujetExport {
  const arbre = element.contenu.type === 'arbre' ? element.contenu : null
  const titre = arbre ? titreDe(arbre) : t('type.arbre')
  const captures = new Map<boolean, Promise<Capture>>()
  const capture = (fond: boolean) => {
    let c = captures.get(fond)
    if (!c) {
      const d = dessin?.()
      c = d ? capturerCarte(d.svg, d.emprise, fond) : Promise.reject(new Error(t('pilotage.vide')))
      c.catch(() => captures.delete(fond))
      captures.set(fond, c)
    }
    return c
  }
  const enTexte = (format: 'md' | 'txt'): FormatExport => ({
    id: format,
    icone: format === 'md' ? 'fichierTexte' : 'texte',
    libelle: t(`exporter.f.${format}`),
    aide: t(`exporter.f.${format}.aide`),
    extension: format,
    type: format === 'md' ? 'text/markdown' : 'text/plain',
    ...(format === 'md' ? { filet: true } : {}),
    async preparer() {
      const ecrit = exporterCarte(arbre?.sujets, format, langueExport(langue()))
      return { apercu: { type: 'texte', texte: ecrit }, fichier: new Blob([ecrit], { type: `${format === 'md' ? 'text/markdown' : 'text/plain'};charset=utf-8` }) }
    },
  })
  const enImage: FormatExport[] = [
    {
      id: 'png',
      icone: 'fichierImage',
      libelle: t('exporter.f.png'),
      aide: t('exporter.f.png.carte'),
      extension: 'png',
      type: 'image/png',
      options: ['fond'],
      async preparer(r) {
        const png = await enBlob((await capture(r.fond)).canevas, 'image/png')
        return { apercu: { type: 'images', images: [png] }, fichier: png }
      },
    },
    {
      id: 'pdf',
      icone: 'fichierPdf',
      libelle: t('exporter.f.pdf'),
      aide: t('exporter.f.pdf.carte'),
      extension: 'pdf',
      type: 'application/pdf',
      async preparer() {
        const c = await capture(true)
        return { apercu: { type: 'images', images: [await enBlob(c.canevas, 'image/jpeg', 0.92)] }, fichier: await pdfDeCapture(c) }
      },
    },
  ]
  return {
    genre: 'carte',
    titre,
    formats: [
      formatNotakDElement(() => element, titre, contexte.services.fichiers),
      ...(dessin ? enImage : []),
      {
        id: 'xmind',
        icone: 'carteMentale',
        libelle: t('exporter.f.xmind'),
        aide: t('exporter.f.xmind.aide'),
        extension: 'xmind',
        type: TYPE_XMIND,
        async preparer() {
          const x = await fabriquerXmind([element], contexte)
          const l = arbre ? lire(arbre) : null
          const branches = l ? (l.enfants.get(l.central) ?? []).flatMap((id) => l.sujets.get(id) ?? []) : []
          return {
            apercu: {
              type: 'contenu',
              resume: [tn('exporter.nbSujets', l?.sujets.size ?? 0), ...(x.images > 0 ? [tn('exporter.nbFichiers', x.images)] : [])].join(' · '),
              lignes: [
                { icone: 'carteMentale', texte: titre },
                ...branches.slice(0, 12).map((s) => ({ icone: 'chevronDroite' as const, texte: s.titre.replace(/\n/g, ' ') || t('commun.sansTitre') })),
                ...(branches.length > 12 ? [{ icone: 'plus' as const, texte: tn('exporter.autres', branches.length - 12) }] : []),
              ],
            },
            fichier: new Blob([x.octets as Uint8Array<ArrayBuffer>], { type: TYPE_XMIND }),
          }
        },
      },
      enTexte('md'),
      enTexte('txt'),
    ],
  }
}

function titreDe(a: Arbre): string {
  const l = lire(a)
  return l.sujets.get(l.central)?.titre.replace(/\n/g, ' ') || t('type.arbre')
}
