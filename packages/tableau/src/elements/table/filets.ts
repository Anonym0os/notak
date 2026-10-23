import type { FormatCellule } from '../../coeur/tableau'

/**
 * Les filets entre cellules colorées. Chez Milanote le filet d'une cellule de fond coloré est un mélange de ce fond et
 * de l'ardoise (blanc en thème sombre) ; quand deux cellules se touchent, la plus foncée recouvre le filet de l'autre.
 * Ici on donne à chaque côté d'une cellule la couleur de l'arête qu'il partage : les deux voisines disent la même
 * chose, et le conflit de bordures du tableau n'a plus rien à trancher.
 */

/** La part d'ardoise mêlée au fond, en pour cent. */
export const PART_ARDOISE = 12

/** Le fond d'une cellule, ou `undefined` s'il n'en a pas (le corps de la table). */
const fondDe = (f: FormatCellule | null | undefined): string | undefined => f?.fond

/** Clarté relative (0 à 1) d'un fond : un `#rrggbb`, le gris d'en-tête (selon le thème), ou le corps de la table. */
export function clarteDuFond(fond: string | undefined, sombre: boolean): number {
  if (fond === undefined) return sombre ? 0.02 : 1
  if (fond === 'entete') return sombre ? 0.05 : 0.66
  const m = /^#([0-9a-f]{6})$/i.exec(fond)
  if (!m) return sombre ? 0.02 : 1
  const n = Number.parseInt(m[1]!, 16)
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

/** Le filet d'un fond : ce fond mêlé d'ardoise. */
export const filetDuFond = (fond: string): string =>
  `color-mix(in srgb, ${fond === 'entete' ? 'var(--notak-table-entete)' : fond} ${100 - PART_ARDOISE}%, var(--notak-table-filet-melange) ${PART_ARDOISE}%)`

/**
 * La couleur de l'arête entre deux cellules : celle du filet de la plus foncée des deux. `undefined` : le filet ordinaire
 * (ni l'une ni l'autre n'est colorée, ou c'est le corps de la table qui est le plus foncé).
 */
export function filetEntre(a: FormatCellule | null | undefined, b: FormatCellule | null | undefined, sombre: boolean): string | undefined {
  const fa = fondDe(a)
  const fb = fondDe(b)
  if (fa === undefined && fb === undefined) return undefined
  const plusFonce = clarteDuFond(fa, sombre) <= clarteDuFond(fb, sombre) ? fa : fb
  return plusFonce === undefined ? undefined : filetDuFond(plusFonce)
}

export interface CouleursDeBord {
  haut?: string
  bas?: string
  gauche?: string
  droite?: string
}

/** Les couleurs des quatre côtés de la cellule `(i, j)` ; un côté sans mélange n'y figure pas. */
export function filetsDeCellule(formats: readonly (readonly (FormatCellule | null | undefined)[])[], i: number, j: number, sombre: boolean): CouleursDeBord {
  const ici = formats[i]?.[j]
  const sortie: CouleursDeBord = {}
  const pose = (cote: keyof CouleursDeBord, autre: FormatCellule | null | undefined) => {
    const c = filetEntre(ici, autre, sombre)
    if (c) sortie[cote] = c
  }
  pose('haut', formats[i - 1]?.[j])
  pose('bas', formats[i + 1]?.[j])
  pose('gauche', formats[i]?.[j - 1])
  pose('droite', formats[i]?.[j + 1])
  return sortie
}
