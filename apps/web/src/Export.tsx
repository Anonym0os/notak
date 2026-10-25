import {
  type Capture,
  type FormatExport,
  type OptionsCopie,
  type Prepare,
  type ReglagesExport,
  type SujetExport,
  ErreurExport,
  Icone,
  capturerToile,
  decoderNotak,
  enBlob,
  ouvrirExport,
  pdfDeCapture,
} from '@notak/tableau'
import { unzipSync } from 'fflate'
import { langue, t, tn } from './langue'
import { fermerPanneaux } from './panneaux'
import { poids } from './DialogueExport'

export { ErreurExport } from '@notak/tableau'
export { telecharger } from './enregistrer'

/**
 * Ce que l'édition locale sait faire elle-même, sans serveur : le texte du tableau, ses médias et son archive
 * `.notak`, fabriqués dans le navigateur. Sans lui, ce sont les routes du serveur.
 */
export interface ExportLocal {
  texte(tableau: string, format: 'md' | 'txt'): Promise<Blob>
  medias(tableau: string): Promise<Blob>
  notak(tableau: string, options: OptionsCopie): Promise<Blob>
}

/** Ce que rend le serveur pour un format de fichier ; une réponse en erreur fait échouer l'export, avec son code. */
async function depuisServeur(adresse: string): Promise<Blob> {
  const r = await fetch(adresse, { credentials: 'same-origin' })
  if (!r.ok) {
    const code = ((await r.json().catch(() => null)) as { code?: string } | null)?.code
    throw new ErreurExport(code ?? String(r.status))
  }
  return r.blob()
}

const octets = async (b: Blob) => new Uint8Array(await b.arrayBuffer())
/** Le texte d'un fichier, lu en UTF-8. */
const lireTexte = async (b: Blob) => new TextDecoder().decode(await octets(b))

/** Combien de lignes une liste d'aperçu montre avant de dire « et N autres ». */
const LIGNES_MAX = 12

/**
 * Le tableau ouvert, à exporter : sa copie `.notak` (le format recommandé), sa toile en PDF ou en image, son texte,
 * ou ses médias. Chaque aperçu est le fichier lui-même, déjà fait.
 */
export function sujetTableau(tableau: string, titre: string, local?: ExportLocal): SujetExport {
  const base = `/api/tableaux/${encodeURIComponent(tableau)}`
  const captures = new Map<string, Promise<Capture>>()
  const capture = (r: Pick<ReglagesExport, 'portee' | 'resolution' | 'fond'>) => {
    const k = `${r.portee}|${r.resolution}|${r.fond}`
    let c = captures.get(k)
    if (!c) {
      c = capturerToile(r)
      c.catch(() => captures.delete(k))
      captures.set(k, c)
    }
    return c
  }

  const texte = (format: 'md' | 'txt'): FormatExport => ({
    id: format,
    icone: format === 'md' ? 'fichierTexte' : 'texte',
    libelle: t(`exporter.f.${format}`),
    aide: t(`exporter.f.${format}.aide`),
    extension: format,
    type: format === 'md' ? 'text/markdown' : 'text/plain',
    ...(format === 'md' ? { filet: true } : {}),
    async preparer() {
      const fichier = local ? await local.texte(tableau, format) : await depuisServeur(`${base}/export?format=${format}&langue=${langue()}`)
      return { apercu: { type: 'texte', texte: await lireTexte(fichier) }, fichier }
    },
  })

  return {
    genre: 'tableau',
    titre,
    note: t('exporter.xmind'),
    formats: [
      {
        id: 'notak',
        icone: 'tableau',
        libelle: t('exporter.f.notak'),
        aide: t('exporter.f.notak.aide'),
        extension: 'notak',
        type: 'application/x-notak',
        recommande: true,
        options: ['sousTableaux', 'fichiers'],
        async preparer(r) {
          const options = { sousTableaux: r.sousTableaux, fichiers: r.fichiers }
          const fichier = local ? await local.notak(tableau, options) : await depuisServeur(`${base}/notak?sousTableaux=${+r.sousTableaux}&fichiers=${+r.fichiers}`)
          return { apercu: contenuNotak(await octets(fichier)), fichier }
        },
      },
      {
        id: 'pdf',
        icone: 'fichierPdf',
        libelle: t('exporter.f.pdf'),
        aide: t('exporter.f.pdf.aide'),
        extension: 'pdf',
        type: 'application/pdf',
        options: ['portee'],
        async preparer(r) {
          // Un PDF n'a pas de transparence : il garde toujours le fond.
          const c = await capture({ portee: r.portee, resolution: 2, fond: true })
          return { apercu: { type: 'images', images: [await enBlob(c.canevas, 'image/jpeg', 0.92)] }, fichier: await pdfDeCapture(c) }
        },
      },
      {
        id: 'png',
        icone: 'fichierImage',
        libelle: t('exporter.f.png'),
        aide: t('exporter.f.png.aide'),
        extension: 'png',
        type: 'image/png',
        options: ['portee', 'resolution', 'fond'],
        async preparer(r) {
          const png = await enBlob((await capture(r)).canevas, 'image/png')
          return { apercu: { type: 'images', images: [png] }, fichier: png }
        },
      },
      texte('md'),
      texte('txt'),
      {
        id: 'medias',
        icone: 'fichierArchive',
        libelle: t('exporter.f.medias'),
        aide: t('exporter.f.medias.aide'),
        extension: 'zip',
        type: 'application/zip',
        async preparer() {
          const fichier = local ? await local.medias(tableau) : await depuisServeur(`${base}/medias?langue=${langue()}`)
          return { apercu: contenuZip(await octets(fichier)), fichier }
        },
      },
    ],
  }
}

/** Ce que contient un `.notak` : ses tableaux, le premier en tête, et combien d'images et de fichiers il emporte. */
function contenuNotak(o: Uint8Array): Prepare['apercu'] {
  const c = decoderNotak(o)
  const tete = c.tableaux.find((x) => x.id === c.racine) ?? c.tableaux[0]
  const autres = c.tableaux.filter((x) => x !== tete)
  return {
    type: 'contenu',
    resume: [tn('exporter.tableaux', c.tableaux.length), ...(c.fichiers.length > 0 ? [tn('exporter.nbFichiers', c.fichiers.length)] : [])].join(' · '),
    lignes: [
      ...(tete ? [{ icone: 'tableau' as const, texte: tete.titre || t('commun.sansTitre') }] : []),
      ...autres.slice(0, LIGNES_MAX).map((x) => ({ icone: 'tableau' as const, texte: x.titre || t('commun.sansTitre'), detail: t('exporter.sousTableau') })),
      ...(autres.length > LIGNES_MAX ? [{ icone: 'plus' as const, texte: tn('exporter.autres', autres.length - LIGNES_MAX) }] : []),
    ],
  }
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|heic)$/i

/** Ce que contient l'archive des médias : ses fichiers, avec leur poids, sans les décompresser. */
function contenuZip(o: Uint8Array): Prepare['apercu'] {
  const fichiers: { nom: string; taille: number }[] = []
  unzipSync(o, {
    filter: (f) => {
      if (!f.name.endsWith('/')) fichiers.push({ nom: f.name, taille: f.originalSize })
      return false
    },
  })
  return {
    type: 'contenu',
    resume: tn('exporter.nbFichiers', fichiers.length),
    lignes: [
      ...fichiers.slice(0, LIGNES_MAX).map((f) => ({ icone: IMAGE.test(f.nom) ? ('fichierImage' as const) : ('fichier' as const), texte: f.nom, detail: poids(f.taille) })),
      ...(fichiers.length > LIGNES_MAX ? [{ icone: 'plus' as const, texte: tn('exporter.autres', fichiers.length - LIGNES_MAX) }] : []),
    ],
  }
}

/** Le bouton « Exporter » du tableau : il ouvre le dialogue d'export (DialogueExport.tsx) sur le tableau ouvert. */
export function Export({ tableau, titre, local }: { tableau: string; titre(): string; local?: ExportLocal }) {
  return (
    <div className="export">
      <button
        type="button"
        className="bouton"
        aria-haspopup="dialog"
        aria-label={t('exporter.titre')}
        title={t('exporter.titre')}
        onClick={() => {
          fermerPanneaux()
          ouvrirExport(sujetTableau(tableau, titre(), local))
        }}
      >
        <Icone nom="exporter" taille={16} />
        <span className="bouton-texte">{t('exporter.titre')}</span>
      </button>
    </div>
  )
}
