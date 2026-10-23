import { COULEURS_NOTE, type CouleurNote, type Element, type Note } from '../../coeur/tableau'

/**
 * Les fonds de note. Les mêmes valeurs sont déclinées en variables CSS (`--notak-note-<nom>`
 * dans `note.css`) : un test vérifie qu'elles ne divergent pas. Ici, elles servent à choisir
 * la couleur du texte.
 */
export const FOND_NOTE: Record<(typeof COULEURS_NOTE)[number], string> = {
  gris: '#8b939d',
  cyan: '#1db4c6',
  vert: '#3c9d5b',
  brun: '#8c6446',
  jaune: '#f3c534',
  orange: '#ef8a2f',
  rouge: '#d84b4b',
  rose: '#e8729f',
  violet: '#8a5fd1',
  bleu: '#3a76df',
  bleu_nuit: '#27344f',
}

export const TEXTE_CLAIR = '#ffffff'
export const TEXTE_SOMBRE = '#1f2328'

const canal = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** La luminance relative d'une couleur `#rrggbb` (WCAG), de 0 (noir) à 1 (blanc). */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
}

/** Le rapport de contraste entre deux couleurs `#rrggbb`, de 1 à 21. */
export function contraste(a: string, b: string): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (haut + 0.05) / (bas + 0.05)
}

/** Blanc ou presque-noir, selon ce qui se lit le mieux sur ce fond. */
export function couleurTexteSur(fond: string): string {
  return contraste(fond, TEXTE_CLAIR) >= contraste(fond, TEXTE_SOMBRE) ? TEXTE_CLAIR : TEXTE_SOMBRE
}

/** La couleur du texte d'une note : celle que son fond impose, `undefined` pour le style par défaut. */
export function texteDeNote(couleur: CouleurNote | undefined): string | undefined {
  return couleur && couleur !== 'transparent' ? couleurTexteSur(FOND_NOTE[couleur]) : undefined
}

/** Une couleur saisie (`#abc`, `AABBCC`, `#aabbcc`) ramenée à `#rrggbb` en minuscules ; `null` si ce n'en est pas une. */
export function lireHex(saisie: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(saisie.trim())
  if (!m) return null
  const h = m[1]!.toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
}

/** Le fond d'une note en `#rrggbb` : le fond libre, sinon sa couleur nommée ; `undefined` sans fond ou transparente. */
export function fondDeNote(c: Pick<Note, 'couleur' | 'fond'>): string | undefined {
  if (c.fond) return c.fond
  return c.couleur && c.couleur !== 'transparent' ? FOND_NOTE[c.couleur] : undefined
}

/** Le texte d'une note : le sien s'il en a un, sinon blanc ou presque-noir selon le fond ; `undefined` pour le défaut. */
export function texteDuContenu(c: Pick<Note, 'couleur' | 'fond' | 'couleurTexte'>): string | undefined {
  if (c.couleurTexte) return c.couleurTexte
  const fond = fondDeNote(c)
  return fond ? couleurTexteSur(fond) : undefined
}

/** Le nombre de couleurs suggérées au plus. */
export const SUGGEREES_MAX = 8

/**
 * Les couleurs déjà employées sur le tableau (fonds, barres, textes libres, fonds nommés), les plus fréquentes
 * d'abord, au plus `SUGGEREES_MAX` : de quoi retrouver une teinte sans la retaper.
 */
export function couleursSuggerees(elements: readonly Element[]): string[] {
  const compte = new Map<string, number>()
  const noter = (c: string | undefined) => c && compte.set(c, (compte.get(c) ?? 0) + 1)
  for (const e of elements) {
    if (e.contenu.type !== 'note') continue
    noter(fondDeNote(e.contenu))
    noter(e.contenu.barre)
    noter(e.contenu.couleurTexte)
  }
  // Tri stable : à égalité, la première rencontrée reste devant.
  return [...compte].sort((a, b) => b[1] - a[1]).slice(0, SUGGEREES_MAX).map(([c]) => c)
}

export const LIBELLES_COULEUR: Record<CouleurNote, string> = {
  gris: 'Gris',
  cyan: 'Cyan',
  vert: 'Vert',
  brun: 'Brun',
  jaune: 'Jaune',
  orange: 'Orange',
  rouge: 'Rouge',
  rose: 'Rose',
  violet: 'Violet',
  bleu: 'Bleu',
  bleu_nuit: 'Bleu nuit',
  transparent: 'Transparent',
}

/** Couleurs du texte et surlignages : des noms, les valeurs sont des variables CSS de `note.css`. */
export const COULEURS_TEXTE = [
  { nom: 'bleu', libelle: 'Bleu' },
  { nom: 'vert', libelle: 'Vert' },
  { nom: 'orange', libelle: 'Orange' },
  { nom: 'rouge', libelle: 'Rouge' },
  { nom: 'gris', libelle: 'Gris' },
] as const

export const SURLIGNAGES = [
  { nom: 'gris-fonce', libelle: 'Gris foncé' },
  { nom: 'bleu', libelle: 'Bleu' },
  { nom: 'vert', libelle: 'Vert' },
  { nom: 'orange', libelle: 'Orange' },
  { nom: 'rose', libelle: 'Rose' },
  { nom: 'gris', libelle: 'Gris' },
] as const

export const valeurCouleurTexte = (nom: string) => `var(--notak-texte-${nom})`
