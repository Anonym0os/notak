import { type NoeudTexte, docDepuisTexte, texteBrut } from '../../coeur/tableau'
import { contientDuTexte } from './conversion'

/**
 * La légende d'une note est un texte riche ; les notes d'avant la gardaient en texte brut. Le même champ porte les
 * deux, et la lecture ramène l'un à l'autre : un texte brut devient un document d'un paragraphe par ligne.
 */
export type LegendeStockee = string | NoeudTexte

/** Le document de la légende, `undefined` s'il n'y en a pas (champ absent ou texte brut vide). */
export function docLegende(legende: LegendeStockee | undefined): NoeudTexte | undefined {
  if (legende === undefined) return undefined
  if (typeof legende !== 'string') return legende
  return legende.trim() === '' ? undefined : docDepuisTexte(legende)
}

/** Une légende sans rien d'écrit : absente, texte brut vide, ou un document sans caractère visible. */
export function legendeVide(legende: LegendeStockee | undefined): boolean {
  const doc = docLegende(legende)
  return !doc || !contientDuTexte(doc)
}

/** Le texte de la légende sans mise en forme (recherche, résumé). */
export function texteLegende(legende: LegendeStockee | undefined): string {
  const doc = docLegende(legende)
  return doc ? texteBrut(doc) : ''
}

/** Une légende neuve, vide : un seul paragraphe. */
export const legendeNeuve = (): NoeudTexte => ({ type: 'doc', content: [{ type: 'paragraph' }] })
