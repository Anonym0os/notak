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
