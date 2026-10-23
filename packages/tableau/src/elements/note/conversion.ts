import { lireAdresse } from '../lien/adresse'
import { type FormatCode, normaliserHex } from '../nuancier/couleur'
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

export interface CouleurLue {
  /** `#rrggbb`. */
  couleur: string
  /** La façon dont elle était écrite ; le nuancier la montre de même. */
  format: FormatCode
}

const dieze = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** Teinte (0 à 360), saturation et luminosité (0 à 100) vers `#rrggbb`. */
function hslVersHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const lum = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lum, 1 - lum)
  const f = (n: number) => lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${dieze(f(0) * 255)}${dieze(f(8) * 255)}${dieze(f(4) * 255)}`
}

/**
 * Un code couleur seul : `#abc`, `#aabbcc` (avec ou sans transparence), `rgb(r, g, b)`, `rgba(…)`, `hsl(h, s%, l%)`,
 * `hsla(…)`. Rend la couleur en `#rrggbb` (la transparence s'en va) et le format écrit ; `null` si ce n'en est pas un.
 */
export function lireCouleur(saisie: string): CouleurLue | null {
  const t = saisie.trim()
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(t)
  if (hex) {
    const h = hex[1]!
    const couleur = normaliserHex(h.length === 4 ? h.slice(0, 3) : h.length === 8 ? h.slice(0, 6) : h)
    return couleur ? { couleur, format: 'hex' } : null
  }
  const nombre = '(-?\\d+(?:\\.\\d+)?)'
  const sep = '\\s*[,\\s]\\s*'
  const alpha = '(?:\\s*[,/]\\s*\\d*\\.?\\d+%?)?'
  const rgb = new RegExp(`^rgba?\\(\\s*${nombre}${sep}${nombre}${sep}${nombre}${alpha}\\s*\\)$`, 'i').exec(t)
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number) as [number, number, number]
    if ([r, g, b].some((v) => v < 0 || v > 255)) return null
    return { couleur: `#${dieze(r)}${dieze(g)}${dieze(b)}`, format: 'rgb' }
  }
  const hsl = new RegExp(`^hsla?\\(\\s*${nombre}(?:deg)?${sep}${nombre}%${sep}${nombre}%${alpha}\\s*\\)$`, 'i').exec(t)
  if (hsl) {
    const [h, s, l] = [hsl[1], hsl[2], hsl[3]].map(Number) as [number, number, number]
    if (s < 0 || s > 100 || l < 0 || l > 100) return null
    return { couleur: hslVersHex(((h % 360) + 360) % 360, s, l), format: 'hsl' }
  }
  return null
}

/** Une note qui n'est qu'un code couleur (`#3a76df`, `rgb(…)`, `hsl(…)`) : la couleur, sinon `null`. */
export function couleurSeule(doc: NoeudTexte): CouleurLue | null {
  const t = texteSeul(doc)
  return t === null ? null : lireCouleur(t)
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
