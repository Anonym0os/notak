import type { GenreLien, Lien } from '../../coeur/tableau'
import { t } from '../../langue'
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

/** L'adresse telle que l'en-tête de la carte la montre : complète, sans le schéma. */
export const adresseAffichee = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/** Ce que la saisie d'adresse demande, selon l'outil qui a fait naître le lien. */
export const INVITES: Record<GenreLien | 'lien', string> = {
  get lien() {
    return t('lien.invite.lien')
  },
  get video() {
    return t('lien.invite.video')
  },
  get audio() {
    return t('lien.invite.audio')
  },
  get carte() {
    return t('lien.invite.carte')
  },
}

/** Le lien à une autre adresse : son aperçu est à refaire, mais son genre et ses réglages d'affichage restent. */
export function avecAdresse(c: Lien, url: string): Lien {
  const { apercu: _a, echec: _e, titre: _t, legende: _l, ...gardes } = c
  return { ...gardes, url, statut: 'attente' }
}

/**
 * Une adresse qu'on peut mettre dans un `href` ou un `src` sans danger, ou `undefined`. Le contenu d'un tableau
 * peut venir de n'importe qui : une adresse `javascript:` ou `data:` ne doit jamais atteindre la page.
 * `genre` : pour un `href` (`lien`), `mailto:` et `tel:` sont permis aussi ; pour une image, seulement le web.
 */
export function adresseSure(url: unknown, genre: 'lien' | 'image' = 'lien'): string | undefined {
  if (typeof url !== 'string' || url.length > 4096) return undefined
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:') return url
    if (genre === 'lien' && (protocol === 'mailto:' || protocol === 'tel:')) return url
  } catch {
    // Pas une adresse complète.
  }
  return undefined
}
