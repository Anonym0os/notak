/** Ce qu'on sait dire d'un fichier d'après son type et son nom, sans l'ouvrir. */

export type Genre = 'pdf' | 'texte' | 'tableur' | 'presentation' | 'archive' | 'son' | 'video' | 'image' | 'code' | 'autre'

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

/** La taille lisible : « 812 o », « 14 ko », « 2,4 Mo ». */
export function tailleLisible(octets: number): string {
  if (octets < 1000) return `${octets} o`
  const unites = ['ko', 'Mo', 'Go']
  let v = octets / 1000
  let u = 0
  while (v >= 1000 && u < unites.length - 1) {
    v /= 1000
    u++
  }
  const arrondi = v < 10 ? Math.round(v * 10) / 10 : Math.round(v)
  return `${String(arrondi).replace('.', ',')} ${unites[u]}`
}

/**
 * L'adresse qui montre la première page d'un PDF dans un cadre : on demande la page 1, sans barre d'outils ni volet.
 * (Les visionneuses des navigateurs lisent ces réglages après le `#` ; aucune ne les envoie au serveur.)
 */
export function adresseApercuPdf(adresse: string): string {
  return `${adresse.replace(/#.*$/, '')}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`
}

/** Ce que la carte montre au-dessus du nom : une page de PDF, une vidéo, ou rien (le mode icône ne montre rien). */
export function apercuDe(nom: string, typeMime: string, icone: boolean | undefined): 'pdf' | 'video' | null {
  if (icone) return null
  const g = genreDe(nom, typeMime)
  return g === 'pdf' ? 'pdf' : g === 'video' ? 'video' : null
}
