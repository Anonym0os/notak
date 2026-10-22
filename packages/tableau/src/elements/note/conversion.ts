import { lireAdresse } from '../lien/adresse'
import { type NoeudTexte, docDepuisTexte } from '../../coeur/tableau'

/** Vrai s'il y a au moins un caractère visible dans le document. */
export function contientDuTexte(n: NoeudTexte): boolean {
  if (n.text !== undefined) return n.text.trim() !== ''
  return (n.content ?? []).some(contientDuTexte)
}

/** Une note vide : un seul bloc de texte, sans rien dedans (paragraphe, ou titre d'une note Titre). */
export function docEstVide(doc: NoeudTexte): boolean {
  const blocs = doc.content ?? []
  const [bloc] = blocs
  return blocs.length === 1 && (bloc!.type === 'paragraph' || bloc!.type === 'heading') && !bloc!.content?.length
}

/** Les couleurs d'un texte collé ne viennent pas avec lui : seules les nôtres ont un sens. */
export function sansCouleursCollees(n: NoeudTexte): NoeudTexte {
  const { marks, content, ...reste } = n
  const gardees = marks?.filter((m) => m.type !== 'textStyle')
  return {
    ...reste,
    ...(gardees?.length ? { marks: gardees } : {}),
    ...(content ? { content: content.map(sansCouleursCollees) } : {}),
  }
}

/**
 * Le document d'une note faite de ce qu'on a collé : le HTML d'abord, s'il porte du texte,
 * sinon le texte brut, un paragraphe par ligne. `null` s'il n'y a rien à garder.
 */
export function docDepuisCollage(
  donnees: { html: string; texte: string },
  depuisHtml: (html: string) => NoeudTexte,
): NoeudTexte | null {
  if (donnees.html.trim()) {
    const doc = depuisHtml(donnees.html)
    if (contientDuTexte(doc)) return sansCouleursCollees(doc)
  }
  const texte = donnees.texte.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  return texte.trim() ? docDepuisTexte(texte) : null
}

/** Une adresse saisie à la main : sans protocole, c'est du https. */
export function normaliserUrl(saisie: string): string {
  const url = saisie.trim()
  if (!url) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
}

/** Le texte d'une note faite d'un seul paragraphe, d'un seul morceau de texte, hors code ; sinon `null`. */
export function texteSeul(doc: NoeudTexte): string | null {
  const blocs = doc.content ?? []
  if (blocs.length !== 1 || blocs[0]!.type !== 'paragraph') return null
  const morceaux = blocs[0]!.content ?? []
  const [m] = morceaux
  if (morceaux.length !== 1 || m!.text === undefined || m!.marks?.some((x) => x.type === 'code')) return null
  return m!.text
}

/** Une note qui n'est qu'une adresse web : l'adresse complète, sinon `null`. */
export function adresseSeule(doc: NoeudTexte): string | null {
  const t = texteSeul(doc)
  return t === null ? null : lireAdresse(t)
}

/** Une note qui n'est qu'une case, `[]`, `[ ]` ou `[x]` : vrai si elle est cochée ; `null` si ce n'en est pas une. */
export function caseSeule(doc: NoeudTexte): boolean | null {
  const t = texteSeul(doc)?.trim()
  if (t === '[]' || t === '[ ]') return false
  if (t === '[x]' || t === '[X]') return true
  return null
}
