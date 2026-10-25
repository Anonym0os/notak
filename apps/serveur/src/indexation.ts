import * as Y from 'yjs'
import type { Base, EntreeIndex } from './base.ts'
import { type TableauLu, idsDeFichiers, lireEtat, lireTableau, texteCherchable } from './contenu.ts'
import { nomDuDocument } from './synchro.ts'

/**
 * Ce qu'on sait chercher dans un tableau : son titre, puis le texte de chaque élément qui en a. La corbeille
 * n'en fait pas partie. Une carte de tableau imbriqué n'ajoute rien : ce tableau a son propre titre dans l'index.
 */
export function entreesDIndex(tableau: TableauLu): EntreeIndex[] {
  const entrees: EntreeIndex[] = []
  if (tableau.titre.trim()) entrees.push({ element: '', texte: tableau.titre.trim() })
  for (const e of tableau.elements) {
    if (e.corbeille !== undefined || e.contenu.type === 'tableau') continue
    const texte = texteCherchable(e, () => undefined).trim()
    if (texte) entrees.push({ element: e.id, texte })
  }
  return entrees
}

/** Les fichiers que montre un tableau, corbeille comprise : on peut encore y voir ce qu'on va restaurer. */
export function fichiersDuTableau(tableau: TableauLu): string[] {
  return [...idsDeFichiers(tableau.elements.map((e) => ({ ...e, corbeille: undefined })))]
}

/** Remet l'index d'un tableau à jour d'après son document : ce qu'on y cherche, et les fichiers qu'il montre. */
export function indexerDocument(base: Base, tableau: string, doc: Y.Doc): void {
  const lu = lireTableau(doc)
  base.indexer(tableau, entreesDIndex(lu), fichiersDuTableau(lu))
}

/** Indexe les tableaux enregistrés avant l'index (une base plus ancienne) ; rend leur nombre. */
export function indexerLesAbsents(base: Base): number {
  const absents = base.tableauxNonIndexes()
  for (const id of absents) {
    const etat = base.document(nomDuDocument(id))
    if (!etat) continue
    const lu = lireEtat(etat)
    base.indexer(id, entreesDIndex(lu), fichiersDuTableau(lu))
  }
  return absents.length
}

/**
 * L'expression FTS5 d'une saisie : chaque mot entre guillemets, le dernier en préfixe (on cherche en tapant).
 * `null` si la saisie n'a aucun mot. Aucun opérateur de l'utilisateur ne passe.
 */
export function requeteIndex(saisie: string): string | null {
  const mots = saisie.slice(0, 200).match(/[\p{L}\p{N}]+/gu)?.slice(0, 8)
  if (!mots?.length) return null
  return mots.map((m, i) => (i === mots.length - 1 ? `"${m}"*` : `"${m}"`)).join(' ')
}
