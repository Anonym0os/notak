import { renderToReactElement } from '@tiptap/static-renderer/pm/react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DocumentTexte, Element, NoeudTexte } from '../../coeur/tableau'
import { formatNotakDElement } from '../../export/notakElement'
import type { DepotFichiers } from '../types'
import { degrader } from '../../blocs/lisible'
import { aplatir, deplier } from '../../blocs/migration'
import { EXTENSIONS_BLOCS, SCHEMA_BLOCS } from '../../blocs/schema'
import { capturerPages, enBlob, pdfDePagesA4 } from '../../export/capture'
import type { FormatExport, SujetExport } from '../../export/sujet'
import { t } from '../../langue'
import { documentEnDocx } from './docx'
import { type FormatDocument, documentEnTexte } from './export'

const TYPE_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Le document ouvert, à exporter : ses pages A4 en PDF, en Word, ou son texte. L'aperçu du PDF et de Word montre les
 * mêmes pages, mises en page une fois pour les deux. `adresse` donne l'adresse d'une image rangée dans l'espace ; `copie`
 * donne l'élément du moment, pour le `.notak` (recommandé, comme partout).
 */
export function sujetDocument(
  titre: string,
  lireTexte: () => NoeudTexte,
  adresse?: (fichier: string) => Promise<string | null>,
  copie?: { element(): Element | null; fichiers?: DepotFichiers | undefined },
): SujetExport {
  const titreAffiche = titre.trim() || t('commun.sansTitre')
  const texte = () => deplier(aplatir(lireTexte()))
  // Le texte tel que la lecture le dessine, sans l'éditeur.
  const html = () => renderToStaticMarkup(renderToReactElement({ content: degrader(aplatir(lireTexte()), SCHEMA_BLOCS), extensions: EXTENSIONS_BLOCS }))

  let pages: Promise<{ canevas: HTMLCanvasElement[]; images: Blob[] }> | null = null
  const lesPages = () =>
    (pages ??= (async () => {
      // L'habillage de la page (icône, police, petit texte) suit le document dans ses pages.
      const page = (copie?.element()?.contenu as DocumentTexte | undefined)?.page
      const canevas = await capturerPages(titreAffiche, html(), adresse, { icone: page?.icone, police: page?.police, petitTexte: page?.petitTexte })
      return { canevas, images: await Promise.all(canevas.map((c) => enBlob(c, 'image/jpeg', 0.85))) }
    })().catch((e: unknown) => {
      pages = null
      throw e
    }))

  const enTexte = (format: FormatDocument): FormatExport => ({
    id: format,
    icone: format === 'md' ? 'fichierTexte' : 'texte',
    libelle: t(`exporter.f.${format}`),
    aide: t(`exporter.f.${format}.aide`),
    extension: format,
    type: format === 'md' ? 'text/markdown' : 'text/plain',
    ...(format === 'md' ? { filet: true } : {}),
    async preparer() {
      const ecrit = documentEnTexte(titre, texte(), format)
      return { apercu: { type: 'texte', texte: ecrit }, fichier: new Blob([ecrit], { type: `${format === 'md' ? 'text/markdown' : 'text/plain'};charset=utf-8` }) }
    },
  })

  return {
    genre: 'document',
    titre: titreAffiche,
    formats: [
      ...(copie ? [formatNotakDElement(copie.element, titreAffiche, copie.fichiers)] : []),
      {
        id: 'pdf',
        icone: 'fichierPdf',
        libelle: t('exporter.f.pdf'),
        aide: t('exporter.f.pdf.document'),
        extension: 'pdf',
        type: 'application/pdf',
        recommande: !copie,
        async preparer() {
          const p = await lesPages()
          return { apercu: { type: 'images', images: p.images }, fichier: await pdfDePagesA4(p.canevas) }
        },
      },
      {
        id: 'docx',
        icone: 'fichier',
        libelle: t('exporter.f.docx'),
        aide: t('exporter.f.docx.aide'),
        extension: 'docx',
        type: TYPE_DOCX,
        async preparer() {
          const p = await lesPages()
          return {
            apercu: { type: 'images', images: p.images, legende: t('exporter.apercuWord') },
            fichier: new Blob([documentEnDocx(titre, texte()) as Uint8Array<ArrayBuffer>], { type: TYPE_DOCX }),
          }
        },
      },
      enTexte('md'),
      enTexte('txt'),
    ],
  }
}
