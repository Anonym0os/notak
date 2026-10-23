import { t, tn } from './langue'
import type { GenreActivite, GroupeActivite } from './api'

/** Les types d'élément qu'on sait nommer (accord et article) ; un autre est un « élément ». */
const TYPES = ['note', 'colonne', 'image', 'lien', 'taches', 'tableau', 'fichier', 'ligne', 'commentaire']

/** « une note », « 3 notes » ; un type inconnu est un élément. */
export function nomDuType(type: string, n: number): string {
  return tn(TYPES.includes(type) ? `activite.type.${type}` : 'activite.type.inconnu', n)
}

const ORDRE = ['cree', 'commente', 'modifie', 'deplace', 'restaure', 'supprime'] as const satisfies readonly Exclude<GenreActivite, 'titre'>[]

/**
 * Ce que dit un groupe, sans le nom de la personne : « a créé 3 notes, modifié un lien ».
 * Le type n'est nommé que si tous les éléments montrés en sont du même ; sinon, ce sont des éléments.
 * `vous` : la personne, c'est soi (« avez créé »).
 */
export function phraseDuGroupe(g: GroupeActivite, vous = false): string {
  const types = new Set(g.elements.map((e) => e.typeElement))
  const type = types.size === 1 ? [...types][0]! : ''
  const parties: string[] = ORDRE.flatMap((genre) => {
    const n = g.resume[genre]
    if (!n) return []
    return [t('activite.partie', { participe: t(`activite.${genre}`), objet: type ? nomDuType(type, n) : nomDuType('', n) })]
  })
  if (g.resume.titre) parties.push(t('activite.renomme'))
  return parties.length === 0 ? '' : t(vous ? 'activite.phrase.vous' : 'activite.phrase', { liste: parties.join(', ') })
}
