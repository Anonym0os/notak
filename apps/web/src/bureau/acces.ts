import { estMobile } from '../appareil'
import { type Acces, type ErreurCoque, estErreurCoque } from '../bureau'
import { t } from '../langue'

/**
 * Où s'ouvre l'app de bureau et ce qu'on dit d'un serveur qu'on n'a pas pu joindre. Rien ici ne touche à la coque : la
 * décision de la porte et les mots des erreurs se vérifient sans elle.
 */

/** Le guide pour installer son propre serveur. */
export const GUIDE = 'https://github.com/Anonym0os/notak/blob/main/docs/AUTO-HEBERGER.md'
/** Le passage du guide qui dit quoi écrire dans `NOTAK_ORIGINE`. */
export const GUIDE_ORIGINE = `${GUIDE}#les-variables`

/** Ce que fait la page embarquée en s'ouvrant : les toiles d'ici, le serveur retenu, ou l'écran où l'on choisit. */
export type Porte = 'local' | 'connecter' | 'ecran'

/**
 * `?acces` ouvre l'écran d'accès, et jamais une connexion d'office ; `?ici` (un coup d'œil aux toiles d'ici, depuis un
 * serveur) les toiles d'ici, sans connexion non plus. Ces marques ne font qu'empêcher : aucune ne mène à un serveur.
 * Sinon, le serveur mémorisé s'il doit s'ouvrir ; les toiles d'ici pour le reste, y compris avec une coque d'avant les
 * serveurs (`acces` en échec : `null`).
 */
export function decidePorte(acces: Acces | null, recherche: string): Porte {
  const marques = new URLSearchParams(recherche)
  if (marques.has('acces')) return 'ecran'
  if (marques.has('ici')) return 'local'
  return acces?.ouvrir === 'serveur' && acces.serveur ? 'connecter' : 'local'
}

/**
 * La coque a ramené la fenêtre faute de réponse du serveur (`erreur=muette`). Seule cette valeur-là se reconnaît : le
 * reste de l'adresse ne sert à rien, et rien de ce qu'elle porte ne s'affiche.
 */
export const serveurMuet = (recherche: string) => new URLSearchParams(recherche).get('erreur') === 'muette'

/** Ce qui a manqué : un refus de la coque, ou le silence d'un serveur qu'elle a guetté. */
export type Echec = ErreurCoque | { code: 'muette' }

/**
 * Une erreur quelconque, ramenée à un refus qu'on sait dire. Une panne (de la page, ou du système derrière la coque) se
 * dit comme un échec : son détail, souvent en anglais, sert à qui cherche (la console), pas à l'écran.
 */
export function echecDe(e: unknown): Echec {
  if (estErreurCoque(e) && e.code !== 'echec') return e
  console.warn('Notak :', e)
  return { code: 'echec', message: '' }
}

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
  mal_regle: 'bureau.erreur.mal_regle',
  muette: 'bureau.erreur.muette',
  interdit: 'bureau.erreur.interdit',
  file_pleine: 'bureau.erreur.file_pleine',
  echec: 'bureau.erreur.echec',
}

/** Pourquoi la connexion n'a pas eu lieu, en une phrase qui dit quoi faire. `hote` : le serveur dont on parle. */
export function texteErreur(e: Echec, hote = ''): string {
  const cle = TEXTES[e.code] ?? TEXTES.echec!
  return t(cle, { hote, vers: e.code === 'redirige' ? e.vers : '' })
}

/** L'erreur se corrige dans le champ de l'adresse : il se marque, et reprend le curseur. */
export const concerneAdresse = (e: Echec) => e.code === 'adresse_invalide' || e.code === 'https_requis' || e.code === 'chemin'

/**
 * Sur un iPhone ou un iPad, on ne parle pas de « cet ordinateur » : les textes qui nomment le lieu ont une variante
 * `….appareil`, choisie par ceci. Les clés s'écrivent en toutes lettres là où elles servent (les essais des textes les y
 * cherchent).
 */
export const surAppareil = (): boolean => estMobile()
