import { type DocumentTexte, type Element, type NoeudTexte, nouvelId, texteBrut } from '../../coeur/tableau'
import { t, tn } from '../../langue'

/** La largeur d'un document neuf : une icône et son titre, comme dans Milanote (10 unités). */
export const LARGEUR_DOCUMENT = 10
/** La largeur en vue carte (34 unités). */
export const LARGEUR_DOCUMENT_CARTE = 34
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
  if (n <= 1) return tn('document.mots', n)
  const minutes = Math.ceil(n / MOTS_PAR_MINUTE)
  return minutes > 1 ? t('document.motsLecture', { n, minutes }) : tn('document.mots', n)
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
  return c.titre.trim() || extrait(c.texte, 80) || t('document.resumeVide')
}

/**
 * Les documents que l'outil vient de poser : leur titre s'édite sur la carte, une fois. La carte le lit à son montage
 * et le retire ; une carte qu'on rouvre plus tard n'y revient pas.
 */
const aTitrer = new Set<string>()
export const titrerALaCreation = (id: string) => void aTitrer.add(id)
/** `retirer` : le drapeau est consommé (par défaut) ; sinon on regarde seulement. */
export const doitEtreTitre = (id: string, retirer = true): boolean => (retirer ? aTitrer.delete(id) : aTitrer.has(id))

/** Demande au document `id` d'ouvrir l'édition de son titre sur la carte (Entrée, « Renommer »). */
const EVENEMENT_RENOMMER = 'notak-document-renommer'
export const demanderRenommer = (id: string) => void window.dispatchEvent(new CustomEvent(EVENEMENT_RENOMMER, { detail: id }))
export function ecouterRenommer(id: string, faire: () => void): () => void {
  const surDemande = (e: Event) => {
    if ((e as CustomEvent<string>).detail === id) faire()
  }
  window.addEventListener(EVENEMENT_RENOMMER, surDemande)
  return () => window.removeEventListener(EVENEMENT_RENOMMER, surDemande)
}

/** Un titre à l'écran : sans mot orphelin à la dernière ligne (espace insécable avant le dernier mot). */
export const titreAffiche = (titre: string): string => titre.trim().replace(/ (\S+)$/, '\u00a0$1')

/** Le document que pose l'outil : son titre « Nouveau document » est prêt à être remplacé. */
export function documentCree(x: number, y: number): Element<DocumentTexte> {
  const e = nouveauDocument(x, y)
  titrerALaCreation(e.id)
  return { ...e, contenu: { ...e.contenu, titre: t('document.nouveau') } }
}

/** Le caractère tapé sur un document choisi : la modale qui s'ouvre le reprend dans son texte. */
let tampon: string | null = null
export const deposerTampon = (caractere: string) => void (tampon = caractere)
export function prendreTampon(): string | null {
  const c = tampon
  tampon = null
  return c
}
