import { langue } from '../../langue'
import type { NomIcone } from '../../icones'
/** Ce qu'on sait dire d'un fichier d'après son type et son nom, sans l'ouvrir. */

export type Genre = 'pdf' | 'texte' | 'tableur' | 'presentation' | 'archive' | 'son' | 'video' | 'image' | 'code' | 'autre'

/** L'icône de chaque genre, dans le badge de la carte. */
export const ICONE_DU_GENRE: Record<Genre, NomIcone> = {
  pdf: 'fichierPdf',
  texte: 'fichierTexte',
  tableur: 'fichierTableur',
  presentation: 'fichierPresentation',
  archive: 'fichierArchive',
  son: 'fichierSon',
  video: 'fichierVideo',
  image: 'fichierImage',
  code: 'fichierCode',
  autre: 'fichier',
}

const PAR_EXTENSION: Record<string, Genre> = {
  pdf: 'pdf',
  doc: 'texte', docx: 'texte', odt: 'texte', rtf: 'texte', txt: 'texte', md: 'texte', pages: 'texte',
  xls: 'tableur', xlsx: 'tableur', ods: 'tableur', csv: 'tableur', numbers: 'tableur',
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation', key: 'presentation',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  mp3: 'son', wav: 'son', m4a: 'son', aac: 'son', ogg: 'son', flac: 'son',
  mp4: 'video', mov: 'video', webm: 'video', m4v: 'video', avi: 'video', mkv: 'video',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', heic: 'image', tiff: 'image', psd: 'image',
  js: 'code', ts: 'code', json: 'code', html: 'code', css: 'code', py: 'code', sh: 'code',
}

/** L'extension, en minuscules, sans le point ; vide s'il n'y en a pas. */
export function extensionDe(nom: string): string {
  const i = nom.lastIndexOf('.')
  return i > 0 && i < nom.length - 1 ? nom.slice(i + 1).toLowerCase() : ''
}

export function genreDe(nom: string, typeMime: string): Genre {
  const t = typeMime.toLowerCase()
  if (t === 'application/pdf') return 'pdf'
  if (t.startsWith('audio/')) return 'son'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('image/')) return 'image'
  return PAR_EXTENSION[extensionDe(nom)] ?? (t.startsWith('text/') ? 'texte' : 'autre')
}

/** Le son et la vidéo se lisent sur la carte, dans les formats que le navigateur sait lire. */
export function lisible(typeMime: string): 'son' | 'video' | null {
  if (typeof document === 'undefined') return null
  const t = typeMime.toLowerCase()
  if (!t.startsWith('audio/') && !t.startsWith('video/')) return null
  const n = document.createElement(t.startsWith('audio/') ? 'audio' : 'video')
  return n.canPlayType(t) ? (t.startsWith('audio/') ? 'son' : 'video') : null
}

/**
 * La taille lisible, comme Milanote : unités décimales (1 Ko = 1000 o) écrites B, KB, MB, GB dans les deux langues,
 * sans décimale pour les octets et les Ko, une pour les Mo et les Go (aucune au-delà de 100), le nombre écrit à la
 * manière de la langue (« 1,2 MB » en français).
 */
export function tailleLisible(octets: number): string {
  const unites = ['B', 'KB', 'MB', 'GB']
  let v = Math.max(0, octets)
  let u = 0
  while (v >= 1000 && u < unites.length - 1) {
    v /= 1000
    u++
  }
  const decimales = u >= 2 && v < 100 ? 1 : 0
  const arrondi = Math.round(v * 10 ** decimales) / 10 ** decimales
  const nombre = decimales ? String(arrondi.toFixed(1)).replace(/\.0$/, '') : String(arrondi)
  return `${langue() === 'en' ? nombre : nombre.replace('.', ',')} ${unites[u]}`
}

/**
 * L'adresse qui montre la première page d'un PDF dans un cadre : on demande la page 1, sans barre d'outils ni volet.
 * (Les visionneuses des navigateurs lisent ces réglages après le `#` ; aucune ne les envoie au serveur.)
 */
export function adresseApercuPdf(adresse: string): string {
  return `${adresse.replace(/#.*$/, '')}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`
}

/** Ce que la carte montre au-dessus du nom : une page de PDF, l'image, une vidéo, ou rien (le mode icône ne montre rien). */
export function apercuDe(nom: string, typeMime: string, icone: boolean | undefined): 'pdf' | 'image' | 'video' | null {
  if (icone) return null
  const g = genreDe(nom, typeMime)
  return g === 'pdf' ? 'pdf' : g === 'image' ? 'image' : g === 'video' ? 'video' : null
}

/**
 * Les formats dont Milanote fabrique un aperçu (Word, Excel, PowerPoint, texte, HTML…) et que Notak ne sait pas
 * montrer : la carte dit alors qu'il n'y en a pas, au lieu de laisser un trou.
 */
export const aApercuAbsent = (nom: string, typeMime: string): boolean => {
  const g = genreDe(nom, typeMime)
  return g === 'texte' || g === 'tableur' || g === 'presentation' || g === 'code'
}

/** Les formats dont l'aperçu est forcé : leur carte naît détaillée (Photoshop, Illustrator, Sketch…). */
const APERCU_FORCE = new Set(['psd', 'ai', 'indd', 'sketch', 'xd'])

/**
 * Un fichier naît en icône, sauf le son et la vidéo qu'on lit, et les formats dont Milanote force l'aperçu
 * (leur carte naît détaillée).
 */
export function naitEnIcone(nom: string, typeMime: string): boolean {
  const g = genreDe(nom, typeMime)
  return g !== 'son' && g !== 'video' && !APERCU_FORCE.has(extensionDe(nom))
}

/** Le fichier s'ouvre dans la fenêtre du fichier : un PDF ou un texte se lit dans le lecteur du navigateur. */
export const seLitEnLigne = (nom: string, typeMime: string): boolean => {
  const t = typeMime.toLowerCase()
  return t === 'application/pdf' || t.startsWith('text/') || ['pdf', 'txt', 'md', 'csv'].includes(extensionDe(nom))
}
