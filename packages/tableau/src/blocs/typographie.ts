/**
 * La typographie qu'on tape, et les marques en ligne du Markdown (docs/NOTION.md § 4) : des fonctions pures sur le texte
 * d'un bloc jusqu'au curseur, sans éditeur. `saisie.ts` en fait des règles de saisie.
 */

/** Un remplacement typographique : ce qui finit le texte tapé, et ce qui le remplace. */
export const REMPLACEMENTS: readonly [RegExp, string][] = [
  [/←>$/u, '↔'],
  [/<->$/u, '↔'],
  [/->$/u, '→'],
  [/<-$/u, '←'],
  [/=>$/u, '⇒'],
  [/>=$/u, '≥'],
  [/<=$/u, '≤'],
  [/!=$/u, '≠'],
  [/--$/u, '—'],
  [/\.\.\.$/u, '…'],
]

/**
 * Le guillemet que devient `"` (ou `'` avec `apostrophe`) : ouvrant en tête de bloc et après une espace, fermant
 * partout ailleurs, y compris après `(`, `[` ou une lettre. Toujours « à l'anglaise » (“ ” ‘ ’), quelle que soit la
 * langue de l'interface : c'est ce que fait Notion (NOTION.md § 4).
 */
export function guillemet(avant: string, apostrophe = false): string {
  const ouvrant = avant === '' || /\s$/u.test(avant)
  if (apostrophe) return ouvrant ? '‘' : '’'
  return ouvrant ? '“' : '”'
}

/** Le texte se termine-t-il dans un code en ligne resté ouvert (un accent grave, puis un caractère qui n'est pas une espace) ? */
export const dansCodeOuvert = (avant: string): boolean => /`[^`\s][^`]*$/u.test(avant)

/** Les délimiteurs des marques en ligne, dans l'ordre où ils sont essayés, et la marque qu'ils posent. */
export const DELIMITEURS: readonly [string, 'code' | 'bold' | 'italic' | 'strike'][] = [
  ['`', 'code'],
  ['**', 'bold'],
  ['*', 'italic'],
  ['__', 'bold'],
  ['_', 'italic'],
  ['~', 'strike'],
]

export interface MarqueTrouvee {
  /** Où le délimiteur ouvrant commence dans le texte. */
  debut: number
  contenu: string
}

/**
 * Le délimiteur qu'on vient de fermer (NOTION.md § 4) : le texte jusqu'au curseur finit par `delim`, il y a un
 * délimiteur ouvrant avant lui, le contenu entre les deux n'est pas vide, ne commence ni ne finit par une espace ni par
 * le délimiteur, et le signe qui précède l'ouvrant est le début du bloc, une espace ou une parenthèse ouvrante
 * (`snake_case_mot_` ne devient donc pas de l'italique).
 */
export function chercherMarque(avant: string, delim: string): MarqueTrouvee | null {
  if (!avant.endsWith(delim)) return null
  const corps = avant.slice(0, avant.length - delim.length)
  const debut = corps.lastIndexOf(delim)
  if (debut < 0) return null
  const contenu = corps.slice(debut + delim.length)
  if (!contenu || /^\s|\s$/u.test(contenu)) return null
  if (contenu.startsWith(delim[0]!) || contenu.endsWith(delim[0]!)) return null
  const devant = corps[debut - 1]
  if (devant !== undefined && !/[\s(]/u.test(devant)) return null
  return { debut, contenu }
}
