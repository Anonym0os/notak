import { langue } from '../../langue'
import type { NomIcone } from '../../icones'
/** Ce qu'on sait dire d'un fichier d'après son type et son nom, sans l'ouvrir. */

export type Genre =
  | 'pdf' | 'texte' | 'tableur' | 'presentation' | 'archive' | 'son' | 'video' | 'image' | 'code' | 'autre'
  | 'modele3d' | 'police' | 'courriel' | 'web' | 'vecteur' | 'photo' | 'montage' | 'maquette'

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
  modele3d: 'fichier3d',
  police: 'fichierPolice',
  courriel: 'fichierCourriel',
  web: 'fichierWeb',
  vecteur: 'fichierVecteur',
  photo: 'fichierPhoto',
  montage: 'fichierMontage',
  maquette: 'fichierMaquette',
}

/** Les extensions de chaque famille (celles que Milanote range ensemble, dans nos dix-huit pictogrammes). */
const FAMILLES: Record<Exclude<Genre, 'pdf' | 'autre'>, string> = {
  texte: 'doc docx docm odt ott otg odg rtf txt md pages msg',
  tableur: 'xls xlsx xlsm ods odc otc csv tsv tab numbers',
  presentation: 'ppt pptx pptm odp otp key',
  archive: 'zip rar 7z tar gz',
  son: 'mp3 wav wave m4a aac ogg flac mid amr 3ga mka mpa opus oga pkf ra ram aiff pcm',
  video: 'mp4 mov webm m4v m4p m4b m4r avi mkv mk3d mks qt wmv divx xvid mpg mpeg mpeg4 mp1 mp2 mlv m1a m2a mpv ogv ogx ogm spx drp wma asf',
  image: 'png jpg jpeg jpe gif webp svg heic tif tiff bmp ico pbm pgm ppm psd',
  code: 'js jsx ts tsx json css py sh c h ini ins jar java pl php swift xml yml yaml sql go rs rb',
  modele3d: 'max blend mp ma 3ds dwg gltf gltb obj fbx stl stp collade glb dae step wrl x3d 3mf amf',
  police: 'otf ttc ttf eot woff woff2 ffil afm pfa pfb pfm tfil',
  courriel: 'eml emlx mbox',
  web: 'html htm xhtml dw dwt muse mulib',
  vecteur: 'ai ai3 ai4 ai5 ai6 ai7 ai8 eps ps psf',
  photo: 'jxr cr2 crw dng mrw orf raw xmp nef x3f erf raf cube 3dl lrtemplate lrcat lrdata lrdb lrprev lrpreview',
  montage: 'prproj cfa cpa aec aep aet aetx amx',
  maquette: 'sketch afdesign xd ind indd idlk indt rp',
}

const PAR_EXTENSION: Record<string, Genre> = Object.fromEntries(
  (Object.entries(FAMILLES) as [Genre, string][]).flatMap(([genre, liste]) => liste.split(' ').map((e) => [e, genre])),
)
PAR_EXTENSION.pdf = 'pdf'

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
  return g !== 'pdf' && g !== 'image' && g !== 'video' && g !== 'son' && g !== 'archive' && g !== 'autre'
}

/** Les formats dont l'aperçu est forcé : leur carte naît détaillée (Photoshop, Illustrator, Sketch…). */
const APERCU_FORCE = new Set(['psd', 'ai', 'ai3', 'ai4', 'ai5', 'ai6', 'ai7', 'ai8', 'eps', 'ps', 'psf', 'ind', 'indd', 'idlk', 'indt', 'sketch', 'xd', 'dw', 'dwt'])

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
