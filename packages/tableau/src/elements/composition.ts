import type { Element } from '../coeur/tableau'
import { tn } from '../langue'

/** Les types dont on compte les éléments, avec leur clé de texte (`composition.<type>.one|other`) ; le reste compte pour des « éléments ». */
const TYPES_COMPTES = new Set(['note', 'image', 'lien', 'taches', 'tableau', 'colonne'])

/** Ce que contiennent ces éléments, type par type, dans l'ordre où ils apparaissent : « 3 notes, 1 image ». */
export function composition(enfants: readonly Element[]): string {
  const comptes = new Map<string, number>()
  for (const e of enfants) comptes.set(e.contenu.type, (comptes.get(e.contenu.type) ?? 0) + 1)
  return [...comptes]
    .map(([type, n]) => {
      switch (TYPES_COMPTES.has(type) ? type : 'element') {
        case 'note':
          return tn('composition.note', n)
        case 'image':
          return tn('composition.image', n)
        case 'lien':
          return tn('composition.lien', n)
        case 'taches':
          return tn('composition.taches', n)
        case 'tableau':
          return tn('composition.tableau', n)
        case 'colonne':
          return tn('composition.colonne', n)
        default:
          return tn('composition.element', n)
      }
    })
    .join(', ')
}
