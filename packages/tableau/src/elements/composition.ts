import type { Element } from '../coeur/tableau'
import { tn } from '../langue'

/** Les types dont on compte les éléments, avec leur clé de texte (`composition.<clé>.one|other`) ; le reste compte pour des « éléments ». */
const CLES: Readonly<Record<string, string>> = {
  note: 'note',
  lien: 'lien',
  image: 'image',
  fichier: 'fichier',
  document: 'document',
  taches: 'taches',
  ligne: 'ligne',
  colonne: 'colonne',
  tableau: 'tableau',
  commentaire: 'commentaire',
  table: 'table',
  croquis: 'croquis',
}

/**
 * Ce que contiennent ces éléments, type par type, dans l'ordre où ils apparaissent : « 3 notes, 1 image ».
 * Au-delà de deux types, « document » s'abrège en « doc ».
 */
export function composition(enfants: readonly Element[]): string {
  const comptes = new Map<string, number>()
  for (const e of enfants) {
    const cle = CLES[e.contenu.type] ?? 'element'
    comptes.set(cle, (comptes.get(cle) ?? 0) + 1)
  }
  const court = comptes.size > 2
  return [...comptes].map(([cle, n]) => tn(court && cle === 'document' ? 'composition.doc' : `composition.${cle}`, n)).join(', ')
}
