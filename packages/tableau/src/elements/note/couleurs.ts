import { COULEURS_NOTE, type CouleurNote } from '../../coeur/tableau'

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
