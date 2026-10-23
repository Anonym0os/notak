import { lireAdresse } from '../lien/adresse'
import { type DocumentTexte, type NoeudTexte, type Note, docDepuisTexte } from '../../coeur/tableau'

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

/** Les extensions qu'on reconnaît sans protocole ni `www.` : assez pour l'usage, sans prendre « node.js » pour une adresse. */
const EXTENSIONS_CONNUES = new Set(
  'com fr org net io app dev co eu be ch ca de uk es it nl info me ai tv fm so xyz site page link studio design gouv edu'.split(' '),
)

export type MorceauTexte = { texte: string; url?: string }

/**
 * Le texte coupé autour des adresses web qu'il contient : elles restent du texte, que l'affichage repère
 * (souligné, cliquable). La ponctuation qui suit une adresse ne lui appartient pas.
 */
export function decouperAdresses(texte: string): MorceauTexte[] {
  const morceaux: MorceauTexte[] = []
  let reste = 0
  for (const m of texte.matchAll(/\S+/g)) {
    const brut = m[0].replace(/[.,;:!?»"')\]]+$/, '')
    const url = brut && lireAdresse(brut)
    if (!url) continue
    const hote = new URL(url).hostname
    const explicite = /^https?:\/\//i.test(brut) || /^www\./i.test(brut)
    if (!explicite && !EXTENSIONS_CONNUES.has(hote.split('.').pop()!.toLowerCase())) continue
    if (m.index > reste) morceaux.push({ texte: texte.slice(reste, m.index) })
    morceaux.push({ texte: brut, url })
    reste = m.index + brut.length
  }
  if (reste < texte.length) morceaux.push({ texte: texte.slice(reste) })
  return morceaux
}

/** Une ligne à case : `- [ ] texte`, `* [x] texte`, `[ ] texte`, `☐ texte`, `☑ texte`. */
const LIGNE_A_CASE = /^\s*(?:[-*+]\s+)?(?:\[([ xX]?)\]|([☐☑☒✓✔]))\s*(.*)$/u

/**
 * Des lignes qui ne sont que des cases deviennent une liste de tâches (le document d'une liste) ;
 * sinon `null`. Les lignes vides ne comptent pas, une seule ligne sans case suffit à refuser.
 */
export function tachesDepuisTexte(texte: string): NoeudTexte | null {
  const lignes = texte.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
  if (lignes.length === 0) return null
  const items: NoeudTexte[] = []
  for (const l of lignes) {
    const m = LIGNE_A_CASE.exec(l)
    if (!m) return null
    const cochee = m[1] !== undefined ? m[1].toLowerCase() === 'x' : m[2] !== '☐'
    const t = m[3]!.trim()
    items.push({ type: 'taskItem', attrs: { checked: cochee }, content: [{ type: 'paragraph', ...(t ? { content: [{ type: 'text', text: t }] } : {}) }] })
  }
  return { type: 'doc', content: [{ type: 'taskList', content: items }] }
}

/**
 * Pour l'affichage figé : les adresses du texte deviennent des liens, afin qu'on puisse les ouvrir.
 * Le document enregistré n'est pas touché ; une adresse déjà dans un lien ou du code reste telle quelle.
 */
export function adressesEnLiens(n: NoeudTexte): NoeudTexte {
  if (n.text !== undefined) return n
  if (!n.content) return n
  const content = n.content.flatMap((enfant): NoeudTexte[] => {
    if (enfant.text === undefined || enfant.marks?.some((m) => m.type === 'link' || m.type === 'code')) return [adressesEnLiens(enfant)]
    return decouperAdresses(enfant.text).map((m) => ({
      type: 'text',
      text: m.texte,
      ...(m.url || enfant.marks?.length ? { marks: [...(enfant.marks ?? []), ...(m.url ? [{ type: 'link', attrs: { href: m.url } }] : [])] } : {}),
    }))
  })
  return { ...n, content }
}

/** Une note devient un document : son texte devient le corps, le titre reste à écrire. Fond, bande et fils ne suivent pas. */
export const enDocument = (c: Note): DocumentTexte => ({ type: 'document', titre: '', texte: c.texte })

/** Un document devient une note : son titre, s'il en a un, ouvre le texte en grand titre. */
export function documentEnNote(c: DocumentTexte): Note {
  const titre = c.titre.trim()
  const blocs = c.texte.content ?? []
  return {
    type: 'note',
    texte: titre ? { ...c.texte, content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: titre }] }, ...blocs] } : c.texte,
  }
}
