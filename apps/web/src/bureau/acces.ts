import { type Acces, type ErreurCoque, estErreurCoque } from '../bureau'
import { t } from '../langue'

/**
 * Où s'ouvre l'app de bureau et ce qu'on dit d'un serveur qu'on n'a pas pu joindre. Rien ici ne touche à la coque : la
 * décision de la porte et les mots des erreurs se vérifient sans elle.
 */

/** Le guide pour installer son propre serveur. */
export const GUIDE = 'https://github.com/Anonym0os/notak/blob/main/docs/AUTO-HEBERGER.md'

/** Ce que fait la page embarquée en s'ouvrant : les toiles d'ici, le serveur retenu, ou l'écran où l'on choisit. */
export type Porte = 'local' | 'connecter' | 'ecran'

/**
 * `?acces` ouvre l'écran d'accès, et jamais une connexion d'office. Sinon, le serveur retenu s'il doit s'ouvrir ; les
 * toiles d'ici pour le reste, y compris avec une coque d'avant les serveurs (`acces` en échec : `null`).
 */
export function decidePorte(acces: Acces | null, recherche: string): Porte {
  if (new URLSearchParams(recherche).has('acces')) return 'ecran'
  return acces?.ouvrir === 'serveur' && acces.serveur ? 'connecter' : 'local'
}

/**
 * La coque a ramené la fenêtre faute de réponse du serveur (`erreur=muette`). Seule cette valeur-là se reconnaît : le
 * reste de l'adresse ne sert à rien, et rien de ce qu'elle porte ne s'affiche.
 */
export const serveurMuet = (recherche: string) => new URLSearchParams(recherche).get('erreur') === 'muette'

/** Ce qui a manqué : un refus de la coque, ou le silence d'un serveur qu'elle a guetté. */
export type Echec = ErreurCoque | { code: 'muette' }

/** Une erreur quelconque, ramenée à un refus qu'on sait dire (une panne de la page se dit comme un échec). */
export const echecDe = (e: unknown): Echec => (estErreurCoque(e) ? e : { code: 'echec', message: '' })

/** Le nom d'hôte d'une origine (`https://notak.exemple.fr:8443` → `notak.exemple.fr:8443`) ; l'origine telle quelle sinon. */
export function hoteDe(origine: string): string {
  try {
    return new URL(origine).host || origine
  } catch {
    return origine
  }
}

/** L'hôte de ce qu'on est en train de taper, avec ou sans « https:// » ; ce qu'on a tapé, faute de mieux. */
export function hoteSaisi(adresse: string): string {
  const net = adresse.trim()
  return hoteDe(net.includes('://') ? net : `https://${net}`)
}

/** Les mots de chaque refus, et ce qu'il y a à faire. Ce que la coque ne dit pas autrement tombe sur « échec ». */
const TEXTES: Record<string, string> = {
  adresse_invalide: 'bureau.erreur.adresse_invalide',
  https_requis: 'bureau.erreur.https_requis',
  chemin: 'bureau.erreur.chemin',
  injoignable: 'bureau.erreur.injoignable',
  certificat: 'bureau.erreur.certificat',
  delai: 'bureau.erreur.delai',
  pas_notak: 'bureau.erreur.pas_notak',
  trop_ancien: 'bureau.erreur.trop_ancien',
  redirige: 'bureau.erreur.redirige',
  muette: 'bureau.erreur.muette',
  interdit: 'bureau.erreur.interdit',
  echec: 'bureau.erreur.echec',
}

/** Pourquoi la connexion n'a pas eu lieu, en une phrase qui dit quoi faire. `hote` : le serveur dont on parle. */
export function texteErreur(e: Echec, hote = ''): string {
  const cle = TEXTES[e.code] ?? TEXTES.echec!
  return t(cle, { hote, vers: e.code === 'redirige' ? e.vers : '' })
}

/** Le détail technique d'un échec inattendu, en clair et court, ou rien. */
export function detailErreur(e: Echec): string | null {
  if (e.code !== 'echec') return null
  const detail = e.message.replace(/\p{Cc}/gu, ' ').trim().slice(0, 200)
  return detail || null
}

/** L'erreur se corrige dans le champ de l'adresse : il se marque, et reprend le curseur. */
export const concerneAdresse = (e: Echec) => e.code === 'adresse_invalide' || e.code === 'https_requis' || e.code === 'chemin'
