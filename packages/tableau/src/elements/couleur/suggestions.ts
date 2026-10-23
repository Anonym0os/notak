import type { Element } from '../../coeur/tableau'
import { fondDeNote } from '../note/couleurs'

/** Combien de couleurs suggérées au plus : la fenêtre de couleur du croquis en montre dix. */
export const SUGGESTIONS_MAX = 10

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Les couleurs déjà employées sur le tableau, les plus utilisées d'abord, au plus `max` : celles des traits des
 * croquis et des dessins, des nuanciers, des notes (fond, bande, texte) et des cellules de table. À égalité, la
 * première rencontrée reste devant. `exclure` : ce que la fenêtre montre déjà (sa palette). Les éléments à la
 * corbeille ne comptent pas.
 */
export function couleursDuTableau(elements: readonly Element[], { exclure = [], max = SUGGESTIONS_MAX }: { exclure?: readonly string[]; max?: number } = {}): string[] {
  const ecartees = new Set(exclure.map((c) => c.toLowerCase()))
  const compte = new Map<string, number>()
  const noter = (c: string | undefined) => {
    if (!c || !HEX.test(c)) return
    const k = c.toLowerCase()
    if (!ecartees.has(k)) compte.set(k, (compte.get(k) ?? 0) + 1)
  }
  for (const e of elements) {
    if (e.corbeille) continue
    const c = e.contenu
    switch (c.type) {
      case 'nuancier':
        noter(c.couleur)
        break
      case 'croquis':
      case 'dessin':
        for (const tr of c.traits) noter(tr.couleur)
        break
      case 'note':
        noter(fondDeNote(c))
        noter(c.barre)
        noter(c.couleurTexte)
        break
      case 'table':
        for (const ligne of c.formats ?? [])
          for (const f of ligne) {
            noter(f?.fond)
            noter(f?.couleur)
            noter(f?.surligne)
          }
        break
    }
  }
  return [...compte].sort((a, b) => b[1] - a[1]).slice(0, max).map(([couleur]) => couleur)
}
