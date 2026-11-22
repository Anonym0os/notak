import type { GenreLien, Lien } from '../../coeur/tableau'
import { t } from '../../langue'
export { lireAdresse } from './lireAdresse'

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
