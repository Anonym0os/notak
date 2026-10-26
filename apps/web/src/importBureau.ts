/**
 * Fichier › Importer… (⌘O) dans Notak de bureau : la coque ouvre la fenêtre « Ouvrir » du système, puis dit à la page
 * les noms des fichiers choisis (`notak:fichiers-choisis`) ; la page lit leurs octets un à un (`lire_fichier_choisi`,
 * `apps/bureau/src-tauri/src/lib.rs`). Ailleurs qu'en bureau, rien n'arrive.
 */
import { annoncer } from '@notak/tableau'
import { t } from './langue'

interface Tauri {
  invoke<T>(commande: string, arguments_?: unknown): Promise<T>
}

/** Le type d'un fichier d'après son extension : la coque ne donne que des octets, et la toile trie les images par type. */
const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  avif: 'image/avif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  xmind: 'application/vnd.xmind.workbook',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const typeDuNom = (nom: string) => TYPES[nom.split('.').pop()?.toLowerCase() ?? ''] ?? ''

/** Écoute Fichier › Importer… ; rend de quoi cesser d'écouter. */
export function ecouterImportBureau(recevoir: (fichiers: File[]) => void): () => void {
  const tauri = (window as unknown as { __TAURI_INTERNALS__?: Tauri }).__TAURI_INTERNALS__
  if (!tauri) return () => {}
  const choisis = (e: Event) => {
    const noms = (e as CustomEvent<string[]>).detail
    void Promise.all(
      noms.map(async (nom, index) => new File([await tauri.invoke<ArrayBuffer>('lire_fichier_choisi', { index })], nom, { type: typeDuNom(nom) })),
    ).then(recevoir, () => annoncer({ texte: t('importer.impossible') }))
  }
  window.addEventListener('notak:fichiers-choisis', choisis)
  return () => window.removeEventListener('notak:fichiers-choisis', choisis)
}
