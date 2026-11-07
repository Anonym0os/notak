import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Les signalements de bugs (⇧⌘S dans l'app) : chacun devient un dossier, `a-traiter/<date>-<code>/`, qui porte
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
  const texte = d.texte.trim() || SANS_COMMENTAIRE
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

/** L'identifiant d'un signalement, le nom de son dossier : `2026-11-07_16h55m06-82f1`. */
export const ID_SIGNALEMENT = /^\d{4}-\d{2}-\d{2}_\d{2}h\d{2}m\d{2}-[0-9a-f]{4}$/
/** Ce que le dépôt écrit quand la personne n'a rien dit. */
const SANS_COMMENTAIRE = '(sans commentaire, voir la capture)'

/** Un signalement relu pour un outil (`lire_signalement`) : les mots à part du contexte, et les captures. */
export interface SignalementRelu {
  etat: 'a-traiter' | 'traite' | 'absent'
  id: string
  /** Les mots de la personne, tels quels ; vide si elle n'a rien écrit. */
  texte: string
  /** Le contexte, en Markdown : qui, quand, l'adresse, le navigateur, la version, les erreurs. */
  contexte: string
  par: { nom: string; email: string } | null
  /** Quand il a été déposé (ms). */
  quand: number
  captures: { nom: string; png: string }[]
}

/**
 * Sépare ce qu'a écrit `markdownDuSignalement` : le titre, les mots, les captures, puis `## Contexte`. Lit aussi les
 * signalements déposés avant que les outils ne les relisent : le fichier n'a pas changé de forme.
 */
export function decouperSignalement(markdown: string): { texte: string; contexte: string; par: { nom: string; email: string } | null } {
  const lignes = markdown.split('\n')
  const debutContexte = lignes.findIndex((l) => l.trim() === '## Contexte')
  const corps = (debutContexte < 0 ? lignes : lignes.slice(0, debutContexte)).filter(
    (l) => !/^# Signalement /.test(l) && !/^!\[Capture \d+\]\([^)]*\)$/.test(l.trim()) && l.trim() !== '(pas de capture)',
  )
  const texte = corps.join('\n').trim()
  const contexte = debutContexte < 0 ? '' : lignes.slice(debutContexte + 1).join('\n').trim()
  const signale = contexte.match(/^- Signalé par : (.*) <([^<>\s]+@[^<>\s]+)>$/m)
  return { texte: texte === SANS_COMMENTAIRE ? '' : texte, contexte, par: signale ? { nom: signale[1]!.trim(), email: signale[2]! } : null }
}

/** Relit un signalement, où qu'il soit rangé, pour un outil qui en fait un ticket. */
export async function relireSignalement(dossier: string, id: string): Promise<SignalementRelu> {
  const absent: SignalementRelu = { etat: 'absent', id, texte: '', contexte: '', par: null, quand: 0, captures: [] }
  if (!ID_SIGNALEMENT.test(id)) return absent
  for (const [file, etat] of [
    [A_TRAITER, 'a-traiter'],
    [TRAITES, 'traite'],
  ] as const) {
    const ici = join(dossier, file, id)
    if (!existsSync(join(ici, 'signalement.md'))) continue
    const markdown = await readFile(join(ici, 'signalement.md'), 'utf8')
    const noms = (await readdir(ici)).filter((n) => /^capture(-\d+)?\.png$/.test(n)).sort((a, b) => rang(a) - rang(b)).slice(0, CAPTURES_MAX)
    const captures = await Promise.all(noms.map(async (nom) => ({ nom, png: (await readFile(join(ici, nom))).toString('base64') })))
    return { etat, id, ...decouperSignalement(markdown), quand: Math.round((await stat(join(ici, 'signalement.md'))).mtimeMs), captures }
  }
  return absent
}

/**
 * Un outil a fait du signalement un ticket : la référence s'écrit au bas du fichier, et le signalement passe dans les
 * traités. Renvoyé, il ne réécrit rien. Rend où il est désormais.
 */
export async function classerSignalement(dossier: string, id: string, ticket: string | null, outil: string): Promise<'traite' | 'absent'> {
  if (!ID_SIGNALEMENT.test(id)) return 'absent'
  const ici = join(dossier, A_TRAITER, id)
  if (existsSync(join(ici, 'signalement.md'))) {
    if (ticket) {
      const markdown = await readFile(join(ici, 'signalement.md'), 'utf8')
      await writeFile(join(ici, 'signalement.md'), `${markdown.trimEnd()}\n- Ticket ${outil} : ${ticket}\n`)
    }
    await marquerTraite(dossier, id)
  }
  return existsSync(join(dossier, TRAITES, id)) ? 'traite' : 'absent'
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
