import { zipSync } from 'fflate'

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'text/plain': 'txt',
}

/** L'extension d'un type MIME, sans point ; vide si on ne la connaît pas. */
export const extensionDe = (type: string): string => EXTENSIONS[type.split(';')[0]!.trim().toLowerCase()] ?? ''

export interface MediaNomme {
  id: string
  nom: string
}

/**
 * Le nom de chaque média dans l'archive : celui qu'on lui a donné (ou « image-3 »), une extension déduite du
 * type s'il n'en a pas, rien qui sorte du dossier, et un numéro quand deux portent le même nom.
 * Un même fichier posé deux fois n'entre qu'une fois.
 */
export function nommerLesMedias(
  fichiers: readonly { id: string; nom: string; type: string }[],
  typeDe: (id: string) => string | undefined = () => undefined,
): MediaNomme[] {
  const vus = new Set<string>()
  const pris = new Set<string>()
  const sortie: MediaNomme[] = []
  for (const f of fichiers) {
    if (vus.has(f.id)) continue
    vus.add(f.id)
    const net = f.nom.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim().slice(0, 120)
    const type = typeDe(f.id) ?? f.type
    let nom = net || `${type.startsWith('image/') || !type ? 'image' : 'fichier'}-${sortie.length + 1}`
    if (!/\.[A-Za-z0-9]{1,5}$/.test(nom)) {
      const ext = extensionDe(type)
      if (ext) nom += `.${ext}`
    }
    const point = nom.lastIndexOf('.')
    const [racine, ext] = point > 0 ? [nom.slice(0, point), nom.slice(point)] : [nom, '']
    let candidat = nom
    for (let n = 2; pris.has(candidat.toLowerCase()); n++) candidat = `${racine} (${n})${ext}`
    pris.add(candidat.toLowerCase())
    sortie.push({ id: f.id, nom: candidat })
  }
  return sortie
}

const DEJA_COMPRESSES = /^(image\/(png|jpeg|gif|webp|avif)|video\/|audio\/)/

/** Une archive zip. Les médias déjà compressés (photos, vidéos, sons) sont rangés tels quels : les compresser de plus coûte pour rien. */
export function creerZip(entrees: readonly { nom: string; octets: Uint8Array; type?: string }[]): Uint8Array {
  const fichiers: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  for (const e of entrees) fichiers[e.nom] = [e.octets, { level: DEJA_COMPRESSES.test(e.type ?? '') ? 0 : 6 }]
  return zipSync(fichiers)
}
