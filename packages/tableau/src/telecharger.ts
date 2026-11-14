/**
 * Télécharger un fichier, de la même façon partout : l'original d'une image ou d'un fichier (le menu, la carte, la
 * visionneuse, le PDF, une image d'un document, une pièce d'une carte mentale) comme ce que la toile fabrique (un
 * document en Markdown ou en .docx, un croquis en SVG, une carte mentale).
 *
 * Par défaut, un lien de téléchargement : le navigateur range le fichier où il range les siens, l'app de Mac dans
 * Téléchargements (`apps/bureau/src-tauri/src/telechargements.rs`). Là où un lien ne mène nulle part, l'hôte le dit une
 * fois (`reglerTelechargement`) et la toile lui remet le fichier : la feuille de partage d'un iPhone ou d'un iPad, dont
 * la webview n'a pas de Téléchargements, ou « Enregistrer sous » d'une app de Mac d'avant ses téléchargements. Elle en
 * lit alors les octets elle-même, avec les cookies de la page pour un fichier du serveur. Un échec se dit (`annoncer`).
 */
import { annoncer } from './avis'
import { t } from './langue'

/** Ce qui reçoit le fichier à la place d'un lien de téléchargement ; rend quand c'est fait, ou que la personne renonce. */
export type RemiseTelechargement = (fichier: Blob, nom: string) => Promise<unknown>

let remise: RemiseTelechargement | null = null

/** L'hôte dit une fois où vont les téléchargements : `null`, un lien de téléchargement, ce qui vaut par défaut. */
export function reglerTelechargement(o: { remise: RemiseTelechargement | null }) {
  remise = o.remise
}

/** L'adresse d'un fichier qu'on a en main vit le temps que le téléchargement commence, puis s'oublie. */
const DUREE_ADRESSE_MS = 60_000

/**
 * Entre deux fichiers téléchargés à la suite (plusieurs images choisies). Deux liens suivis dans le même tour, la
 * webview de l'app de Mac n'en garde que le dernier : le second annule le premier avant qu'il ne devienne un
 * téléchargement. Mesuré dans l'app : un tour de plus suffit, 50 ms d'écart gardent les quatre ; on en laisse 200.
 */
export const ECART_TELECHARGEMENTS_MS = 200

/** L'extension de ce qu'on télécharge le plus, pour un nom qui n'en a pas. */
export const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

/**
 * Le nom sous lequel le fichier arrive : un nom, jamais un chemin, sans caractère de contrôle ; vide, « fichier » ; et
 * l'extension de sa sorte s'il n'en a pas.
 */
export function nomDeTelechargement(nom: string, type?: string): string {
  const net = nom.replace(/[\\/\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() || t('telechargement.sansNom')
  const extension = type ? EXTENSIONS[type.toLowerCase().split(';')[0]!.trim()] : undefined
  return extension && !/\.[\w-]{1,16}$/.test(net) ? `${net}.${extension}` : net
}

/** Les octets d'une adresse : un `blob:` de la page, un fichier du serveur (ses cookies vont avec), des `data:`. */
async function lire(adresse: string): Promise<Blob> {
  const r = await fetch(adresse, { credentials: 'same-origin' })
  if (!r.ok) throw new Error(`le fichier ne s’est pas lu (${r.status})`)
  return r.blob()
}

/** Une adresse d'un autre site : le navigateur n'y suit pas `download`, elle s'ouvre à côté plutôt qu'à la place de Notak. */
function dAilleurs(adresse: string): boolean {
  try {
    const u = new URL(adresse, location.href)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin !== location.origin
  } catch {
    return false
  }
}

function lien(adresse: string, nom: string) {
  const a = document.createElement('a')
  a.href = adresse
  a.download = nom
  a.rel = 'noopener'
  if (dAilleurs(adresse)) {
    a.target = '_blank'
    // L'autre site n'apprend pas d'où l'on vient.
    a.rel = 'noopener noreferrer'
  }
  // Dans la page, comme un lien qu'on aurait cliqué : certains navigateurs ne suivent pas un lien détaché.
  document.body.append(a)
  a.click()
  a.remove()
}

function lienVers(fichier: Blob, nom: string) {
  const adresse = URL.createObjectURL(fichier)
  lien(adresse, nom)
  setTimeout(() => URL.revokeObjectURL(adresse), DUREE_ADRESSE_MS)
}

/**
 * Télécharge `source` (l'adresse d'un fichier, ou le fichier lui-même) sous le nom `nom`. `type` : sa sorte, quand
 * l'adresse ne la dit pas, pour l'extension d'un nom qui n'en a pas. Ne rejette jamais : un échec s'annonce.
 */
export async function telechargerFichier(source: string | Blob, nom: string, type?: string): Promise<void> {
  try {
    if (remise) {
      const fichier = typeof source === 'string' ? await lire(source) : source
      await remise(fichier, nomDeTelechargement(nom, type || fichier.type))
      return
    }
    if (typeof source !== 'string') return lienVers(type && !source.type ? new Blob([source], { type }) : source, nomDeTelechargement(nom, type || source.type))
    // L'app de Mac ne télécharge pas des `data:`, dont elle ne sait d'où ils viennent : ils deviennent un fichier de la page.
    if (/^data:/i.test(source)) {
      const fichier = await lire(source)
      return lienVers(fichier, nomDeTelechargement(nom, type || fichier.type))
    }
    lien(source, nomDeTelechargement(nom, type))
  } catch (e) {
    console.warn('Notak : téléchargement impossible', e)
    annoncer({ texte: t('telechargement.echec', { nom: nomDeTelechargement(nom, type) }) })
  }
}
