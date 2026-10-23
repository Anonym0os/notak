import { type DocumentTexte, type Element, type NoeudTexte, nouvelId, texteBrut } from '../../coeur/tableau'

export const LARGEUR_DOCUMENT = 24
/** Combien de blocs du texte la carte dessine : le reste est caché de toute façon. */
export const BLOCS_APERCU = 12
/** Mots lus par minute, pour dire le temps de lecture. */
const MOTS_PAR_MINUTE = 200

export const docVideDocument = (): NoeudTexte => ({ type: 'doc', content: [{ type: 'paragraph' }] })

export const nouveauDocument = (x: number, y: number): Element<DocumentTexte> => ({
  id: nouvelId(),
  x,
  y,
  largeur: LARGEUR_DOCUMENT,
  contenu: { type: 'document', titre: '', texte: docVideDocument() },
})

/** Les premiers blocs du texte, pour la carte : écrire en grand ne coûte rien à celui qui regarde la toile. */
export function premiersBlocs(doc: NoeudTexte, n = BLOCS_APERCU): NoeudTexte {
  const blocs = doc.content ?? []
  return blocs.length <= n ? doc : { ...doc, content: blocs.slice(0, n) }
}

export function compterMots(doc: NoeudTexte): number {
  const t = texteBrut(doc).trim()
  return t ? t.split(/\s+/).length : 0
}

/** « 1 mot », « 250 mots · 2 min de lecture ». */
export function mesure(doc: NoeudTexte): string {
  const n = compterMots(doc)
  if (n <= 1) return `${n} mot`
  const minutes = Math.ceil(n / MOTS_PAR_MINUTE)
  return minutes > 1 ? `${n} mots · ${minutes} min de lecture` : `${n} mots`
}

/** Le début du texte sur une ligne, coupé au mot près et suivi de « … » s'il est plus long. */
export function extrait(doc: NoeudTexte, max = 140): string {
  const t = texteBrut(doc).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const coupe = t.slice(0, max)
  const dernierBlanc = coupe.lastIndexOf(' ')
  return `${(dernierBlanc > max / 2 ? coupe.slice(0, dernierBlanc) : coupe).trimEnd()}…`
}

export const documentVide = (c: DocumentTexte) => !c.titre.trim() && compterMots(c.texte) === 0

/** Ce qu'on lit d'un document dans une liste : son titre, sinon le début de son texte. */
export function resume(c: DocumentTexte): string {
  return c.titre.trim() || extrait(c.texte, 80) || 'Document vide'
}
