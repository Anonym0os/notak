import type { Element } from '../coeur/tableau'

const NOMS: Record<string, [string, string]> = {
  note: ['note', 'notes'],
  image: ['image', 'images'],
  lien: ['lien', 'liens'],
  taches: ['liste de tâches', 'listes de tâches'],
  tableau: ['tableau', 'tableaux'],
  colonne: ['colonne', 'colonnes'],
}

/** Ce que contiennent ces éléments, type par type, dans l'ordre où ils apparaissent : « 3 notes, 1 image ». */
export function composition(enfants: readonly Element[]): string {
  const comptes = new Map<string, number>()
  for (const e of enfants) comptes.set(e.contenu.type, (comptes.get(e.contenu.type) ?? 0) + 1)
  return [...comptes]
    .map(([type, n]) => {
      const [un, plusieurs] = NOMS[type] ?? ['élément', 'éléments']
      return `${n} ${n > 1 ? plusieurs : un}`
    })
    .join(', ')
}

