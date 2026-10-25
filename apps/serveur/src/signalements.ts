import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Les signalements de bugs (⌥⌘S dans l'app) : chacun devient un dossier, `a-traiter/<date>-<code>/`, qui porte
 * `signalement.md` (les mots, puis le contexte) et ses captures, `capture.png`, `capture-2.png`… Traité, il passe
 * dans `traites/`. Rien en base : un dossier se lit d'un coup, par une personne ou par `npm run signalements`, sans
 * serveur ni compte.
 */

export const A_TRAITER = 'a-traiter'
export const TRAITES = 'traites'
/** Les mots, le contexte et chaque capture, au plus. */
export const TEXTE_MAX = 4000
export const CONTEXTE_MAX = 40_000
export const CAPTURE_MAX = 12 * 1024 * 1024
/** L'écran pris au raccourci, et les images collées (⌘V) à côté. */
export const CAPTURES_MAX = 6

export interface Depot {
  texte: string
  /** Le contexte, en Markdown, tel que l'app l'a relevé (adresse, tableau, sélection, version, erreurs). */
  contexte: string
  /** Les images PNG : l'écran, annoté ou recadré, puis celles qu'on a collées ; vide si rien n'a été pris. */
  captures: Buffer[]
  auteur: { nom: string; email: string }
  quand: Date
}

const deux = (n: number) => String(n).padStart(2, '0')

/** `2026-10-25_22h41m07` : les dossiers se rangent d'eux-mêmes dans l'ordre d'arrivée. */
export function horodatage(d: Date): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}_${deux(d.getHours())}h${deux(d.getMinutes())}m${deux(d.getSeconds())}`
}

export function markdownDuSignalement(id: string, d: Depot): string {
  const texte = d.texte.trim() || '(sans commentaire, voir la capture)'
  return [
    `# Signalement ${id}`,
    '',
    texte,
    '',
    ...(d.captures.length === 0 ? ['(pas de capture)', ''] : d.captures.flatMap((_, i) => [`![Capture ${i + 1}](${nomDeCapture(i)})`, ''])),
    '## Contexte',
    '',
    `- Signalé par : ${d.auteur.nom} <${d.auteur.email}>`,
    `- Le : ${d.quand.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
    d.contexte.trim(),
    '',
  ].join('\n')
}

export const nomDeCapture = (i: number) => (i === 0 ? 'capture.png' : `capture-${i + 1}.png`)

/** Range un signalement ; rend son identifiant, le nom de son dossier. */
export async function deposerSignalement(dossier: string, d: Depot): Promise<string> {
  const id = `${horodatage(d.quand)}-${randomBytes(2).toString('hex')}`
  const ici = join(dossier, A_TRAITER, id)
  await mkdir(ici, { recursive: true })
  for (const [i, c] of d.captures.slice(0, CAPTURES_MAX).entries()) await writeFile(join(ici, nomDeCapture(i)), c)
  await writeFile(join(ici, 'signalement.md'), markdownDuSignalement(id, d))
  return id
}

export interface SignalementLu {
  id: string
  dossier: string
  markdown: string
  /** Les chemins de ses captures, dans l'ordre. */
  captures: string[]
}

/** Les signalements d'une file (`a-traiter` ou `traites`), du plus ancien au plus récent. */
export async function listerSignalements(dossier: string, file: typeof A_TRAITER | typeof TRAITES = A_TRAITER): Promise<SignalementLu[]> {
  const racine = join(dossier, file)
  if (!existsSync(racine)) return []
  const ids = (await readdir(racine, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  const lus: SignalementLu[] = []
  for (const id of ids) {
    const ici = join(racine, id)
    const markdown = await readFile(join(ici, 'signalement.md'), 'utf8').catch(() => '')
    const captures = (await readdir(ici)).filter((n) => /^capture(-\d+)?\.png$/.test(n)).sort((a, b) => rang(a) - rang(b)).map((n) => join(ici, n))
    lus.push({ id, dossier: ici, markdown, captures })
  }
  return lus
}

const rang = (nom: string) => Number(nom.match(/-(\d+)\.png$/)?.[1] ?? 1)

/** Passe un signalement dans `traites/` ; `false` s'il n'est pas (ou plus) à traiter. */
export async function marquerTraite(dossier: string, id: string): Promise<boolean> {
  if (!/^[\w-]+$/.test(id)) return false
  const depuis = join(dossier, A_TRAITER, id)
  if (!existsSync(depuis)) return false
  await mkdir(join(dossier, TRAITES), { recursive: true })
  await rename(depuis, join(dossier, TRAITES, id))
  return true
}
