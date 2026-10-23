import type { GenreLien, Lien } from '../../coeur/tableau'
const LONGUEUR_MAX = 300

/**
 * Lit un texte comme une adresse web unique. Rend l'adresse complète, ou `null`
 * si le texte n'est pas une adresse seule (plusieurs mots, une adresse courriel, du texte quelconque).
 * Sans protocole, un domaine suivi d'un point et d'une extension suffit : on ajoute `https://`.
 */
export function lireAdresse(texte: string): string | null {
  const t = texte.trim()
  if (!t || t.length > LONGUEUR_MAX || /\s/.test(t)) return null
  const avecProtocole = /^https?:\/\//i.test(t)
  if (!avecProtocole && /^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[^/?#]+:\d+/.test(t)) return null
  const complete = avecProtocole ? t : `https://${t}`
  const debutChemin = complete.indexOf('/', complete.indexOf('//') + 2)
  const hote = complete.slice(complete.indexOf('//') + 2, debutChemin === -1 ? undefined : debutChemin)
  if (hote.includes('@')) return null
  try {
    const u = new URL(complete)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    // Un domaine a au moins un point et une extension de lettres (ou une adresse IP).
    // Le texte brut, pas `u.hostname` : l'URL normalise « 3.14 » en une adresse IP.
    const brut = hote.replace(/:\d*$/, '')
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(brut) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(brut)) return null
    return complete
  } catch {
    return null
  }
}

/** Le domaine affiché sur la carte : l'hôte, sans `www.`. */
export function domaineDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

/** Ce que la saisie d'adresse demande, selon l'outil qui a fait naître le lien. */
export const INVITES: Record<GenreLien | 'lien', string> = {
  lien: 'Adresse',
  video: 'Adresse de la vidéo',
  audio: 'Adresse du morceau ou du podcast',
  carte: 'Adresse de la carte',
}

/** Le lien à une autre adresse : son aperçu est à refaire, mais son genre et ses réglages d'affichage restent. */
export function avecAdresse(c: Lien, url: string): Lien {
  const { apercu: _a, echec: _e, titre: _t, legende: _l, ...gardes } = c
  return { ...gardes, url, statut: 'attente' }
}
