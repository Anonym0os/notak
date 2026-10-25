import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Les signalements de bugs (⇧⌘S dans l'app) : chacun devient un dossier, `a-traiter/<date>-<code>/`, qui porte
 * `signalement.md` (les mots, puis le contexte) et `capture.png`. Traité, il passe dans `traites/`. Rien en base : un
 * dossier se lit d'un coup, par une personne ou par `npm run signalements`, sans serveur ni compte.
 */

export const A_TRAITER = 'a-traiter'
export const TRAITES = 'traites'
/** Les mots, le contexte et la capture, au plus. */
export const TEXTE_MAX = 4000
export const CONTEXTE_MAX = 40_000
export const CAPTURE_MAX = 12 * 1024 * 1024

export interface Depot {
  texte: string
  /** Le contexte, en Markdown, tel que l'app l'a relevé (adresse, tableau, sélection, version, erreurs). */
  contexte: string
  /** L'image PNG de l'écran, annotée ou recadrée ; absente si la capture a échoué. */
  capture: Buffer | null
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
    ...(d.capture ? ['![Capture](capture.png)', ''] : ['(pas de capture)', '']),
    '## Contexte',
    '',
    `- Signalé par : ${d.auteur.nom} <${d.auteur.email}>`,
    `- Le : ${d.quand.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
    d.contexte.trim(),
    '',
  ].join('\n')
}

/** Range un signalement ; rend son identifiant, le nom de son dossier. */
export async function deposerSignalement(dossier: string, d: Depot): Promise<string> {
  const id = `${horodatage(d.quand)}-${randomBytes(2).toString('hex')}`
  const ici = join(dossier, A_TRAITER, id)
  await mkdir(ici, { recursive: true })
  if (d.capture) await writeFile(join(ici, 'capture.png'), d.capture)
  await writeFile(join(ici, 'signalement.md'), markdownDuSignalement(id, d))
  return id
}

export interface SignalementLu {
  id: string
  dossier: string
  markdown: string
  capture: string | null
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
    const capture = existsSync(join(ici, 'capture.png')) ? join(ici, 'capture.png') : null
    lus.push({ id, dossier: ici, markdown, capture })
  }
  return lus
}

/** Passe un signalement dans `traites/` ; `false` s'il n'est pas (ou plus) à traiter. */
export async function marquerTraite(dossier: string, id: string): Promise<boolean> {
  if (!/^[\w-]+$/.test(id)) return false
  const depuis = join(dossier, A_TRAITER, id)
  if (!existsSync(depuis)) return false
  await mkdir(join(dossier, TRAITES), { recursive: true })
  await rename(depuis, join(dossier, TRAITES, id))
  return true
}
