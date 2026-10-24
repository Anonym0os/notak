import { normaliserUrl } from '../elements/note/conversion'

/**
 * Ce que l'éditeur de lien de la bulle fait d'une saisie (docs/NOTION.md § 5) : une adresse web (sans protocole, c'est
 * du https), une adresse de courriel, ou rien qui vaille un lien.
 */

export type GenreAdresse = 'web' | 'courriel' | 'invalide'

export interface Adresse {
  genre: GenreAdresse
  /** L'adresse à poser dans le lien ; vide si la saisie n'en est pas une. */
  url: string
}

const COURRIEL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/u

export function lireAdresse(saisie: string): Adresse {
  const s = saisie.trim()
  if (!s) return { genre: 'invalide', url: '' }
  if (/^mailto:/i.test(s)) return COURRIEL.test(s.slice(7)) ? { genre: 'courriel', url: s } : { genre: 'invalide', url: '' }
  if (COURRIEL.test(s)) return { genre: 'courriel', url: `mailto:${s}` }
  const url = normaliserUrl(s)
  try {
    const u = new URL(url)
    const ok = /^(https?|tel|ftp):$/.test(u.protocol) && (u.protocol === 'tel:' || u.hostname.includes('.') || u.hostname === 'localhost' || u.hostname.startsWith('['))
    return ok ? { genre: 'web', url } : { genre: 'invalide', url: '' }
  } catch {
    return { genre: 'invalide', url: '' }
  }
}
