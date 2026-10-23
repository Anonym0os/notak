// Ce fichier est lu par le serveur sans la toile (Node, sans bundler) : il ne tire rien d'autre que des types.
// La route `POST /api/arrivee` et la page `/partage` décident ainsi de la même façon de ce que devient un partage.

/** Ce qu'une arrivée devient, avant de recevoir un identifiant et une place. */
export type Brouillon = { genre: 'lien'; url: string } | { genre: 'note'; texte: string }

/** Une adresse web, ou `null`. */
export function adresseWeb(saisie: string | undefined): string | null {
  const s = saisie?.trim()
  if (!s || /\s/.test(s) || !/^https?:\/\//i.test(s)) return null
  try {
    new URL(s)
    return s
  } catch {
    return null
  }
}

const premiereAdresse = (texte: string) => /https?:\/\/[^\s<>"']+/i.exec(texte)?.[0] ?? null

/**
 * Ce qu'on garde d'un partage. Une adresse (donnée à part, ou seule dans le texte, comme le font beaucoup
 * d'applications) devient un lien et le titre de la page n'est pas recopié : l'aperçu le retrouvera. Le texte qui
 * l'accompagne devient une note. Sans adresse, le titre et le texte font une seule note.
 */
export function decomposerArrivee(a: { titre?: string; texte?: string; adresse?: string }): Brouillon[] {
  const titre = a.titre?.trim() ?? ''
  const texte = a.texte?.trim() ?? ''
  const url = adresseWeb(a.adresse) ?? adresseWeb(texte) ?? premiereAdresse(texte)
  if (url) {
    const reste = texte.replace(url, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    return [{ genre: 'lien', url }, ...(reste ? [{ genre: 'note' as const, texte: reste }] : [])]
  }
  const corps = [titre, texte].filter((p, i, tout) => p && tout.indexOf(p) === i && !(i === 1 && titre.includes(p)))
  return corps.length > 0 ? [{ genre: 'note', texte: corps.join('\n') }] : []
}
