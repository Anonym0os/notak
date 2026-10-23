import type { GenreActivite, GroupeActivite } from './api'

/** Pour chaque type d'élément : l'article indéfini, le singulier, le pluriel. */
const TYPES: Record<string, [string, string, string]> = {
  note: ['une', 'note', 'notes'],
  colonne: ['une', 'colonne', 'colonnes'],
  image: ['une', 'image', 'images'],
  lien: ['un', 'lien', 'liens'],
  taches: ['une', 'liste de tâches', 'listes de tâches'],
  tableau: ['un', 'tableau', 'tableaux'],
  fichier: ['un', 'fichier', 'fichiers'],
  ligne: ['une', 'ligne', 'lignes'],
  commentaire: ['un', 'commentaire', 'commentaires'],
}

/** « une note », « 3 notes » ; un type inconnu est un élément. */
export function nomDuType(type: string, n: number): string {
  const [article, singulier, pluriel] = TYPES[type] ?? ['un', 'élément', 'éléments']
  return n === 1 ? `${article} ${singulier}` : `${n} ${pluriel}`
}

const PARTICIPES: Record<Exclude<GenreActivite, 'titre'>, string> = {
  cree: 'créé',
  commente: 'commenté',
  modifie: 'modifié',
  deplace: 'déplacé',
  restaure: 'rétabli',
  supprime: 'jeté',
}
const ORDRE = ['cree', 'commente', 'modifie', 'deplace', 'restaure', 'supprime'] as const

/**
 * Ce que dit un groupe, sans le nom de la personne : « a créé 3 notes, modifié un lien ».
 * Le type n'est nommé que si tous les éléments montrés en sont du même ; sinon, ce sont des éléments.
 */
export function phraseDuGroupe(g: GroupeActivite): string {
  const types = new Set(g.elements.map((e) => e.typeElement))
  const type = types.size === 1 ? [...types][0]! : ''
  const parties: string[] = ORDRE.flatMap((genre) => {
    const n = g.resume[genre]
    if (!n) return []
    return [`${PARTICIPES[genre]} ${type ? nomDuType(type, n) : n === 1 ? 'un élément' : `${n} éléments`}`]
  })
  if (g.resume.titre) parties.push('renommé le tableau')
  return parties.length === 0 ? '' : `a ${parties.join(', ')}`
}
