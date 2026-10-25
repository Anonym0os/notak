// Ce fichier est lu par le serveur sans la toile (Node, sans bundler) : il ne tire rien.

/**
 * Ce que Notak a le droit de joindre, écrit une seule fois. La politique de sécurité du contenu (CSP) de notak.app
 * (`apps/site/nginx.conf`), de l'app de bureau (`apps/bureau/src-tauri/tauri.conf.json`) et des pages de l'édition
 * serveur (`apps/serveur/src/app.ts`) en découle ; un essai vérifie que chacune la porte telle quelle.
 *
 * C'est le navigateur qui la fait respecter : une requête vers un hôte qui n'est pas ici est refusée avant de
 * partir, qu'elle vienne de notre code, d'une dépendance, d'un document reçu ou d'une copie .notak. « Rien ne quitte
 * votre appareil » n'est donc pas qu'une promesse.
 */

/**
 * Les lecteurs intégrés (`elements/lien/lecteurs.ts`, la carte d'un lieu dans `elements/lieu/adresse.ts`) : une
 * page du fournisseur dans un cadre, chargée quand on la lance. `www.google.com` : là où renvoie `maps.google.com`.
 */
export const ORIGINES_LECTEURS: readonly string[] = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://www.loom.com',
  'https://www.dailymotion.com',
  'https://fast.wistia.net',
  'https://www.tiktok.com',
  'https://open.spotify.com',
  'https://w.soundcloud.com',
  'https://embed.music.apple.com',
  'https://widget.deezer.com',
  'https://maps.google.com',
  'https://www.google.com',
  'https://www.openstreetmap.org',
  'https://www.figma.com',
  'https://miro.com',
  'https://codepen.io',
  'https://docs.google.com',
]

/** Les seules requêtes que l'application fait d'elle-même : trouver où est une adresse, quand on la demande (`apps/web/src/geocodage.ts`). */
export const ORIGINES_REQUETES: readonly string[] = ['https://nominatim.openstreetmap.org']

/** Où tourne l'application : notak.app, l'app de bureau, ou les pages d'un serveur Notak. */
export type Cible = 'site' | 'bureau' | 'serveur'

/**
 * La CSP de cette cible. Pour un serveur, son origine (`https://notak.exemple.fr`) ajoute la synchro en direct, en
 * WebSocket, que tous les navigateurs ne rangent pas sous `'self'`.
 *
 * - les images viennent de partout en `https:` : ce sont celles qu'on a posées soi-même par leur adresse ;
 * - les styles en ligne restent permis : l'éditeur et la toile en posent ; les scripts, jamais ;
 * - `frame-ancestors 'none'` : aucune page d'un autre site ne peut afficher Notak dans un cadre pour faire cliquer
 *   dessus à l'insu de la personne.
 */
export function politiqueContenu(cible: Cible, origineServeur?: string): string {
  const connexions = ["'self'", 'blob:', 'data:', ...ORIGINES_REQUETES]
  // La coque parle à la page par son propre protocole : `ipc:` sur macOS et Linux, `http://ipc.localhost` sous Windows.
  if (cible === 'bureau') connexions.push('ipc:', 'http://ipc.localhost')
  if (cible === 'serveur' && origineServeur) {
    const u = new URL(origineServeur)
    connexions.push(`${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`)
  }
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    ['script-src', "'self'"],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', 'https:'],
    ['media-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'", 'data:'],
    ['connect-src', ...connexions],
    ['frame-src', "'self'", 'blob:', ...ORIGINES_LECTEURS],
    ['worker-src', "'self'", 'blob:'],
    ['manifest-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ]
  return directives.map((d) => d.join(' ')).join('; ')
}

/**
 * Les en-têtes qui accompagnent chaque page de Notak servie par le réseau (notak.app, un serveur Notak). `https` :
 * la page est servie en HTTPS, et le navigateur doit s'en souvenir (HSTS) ; en HTTP local, ce serait se fermer la porte.
 */
export function entetesSecurite(cible: Exclude<Cible, 'bureau'>, o: { https: boolean; origineServeur?: string }): Record<string, string> {
  return {
    'content-security-policy': politiqueContenu(cible, o.origineServeur),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin',
    // Le micro sert aux notes audio d'une carte, pour la page elle-même seulement ; le reste n'a rien à faire ici.
    'permissions-policy': 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()',
    // Sans `includeSubDomains` : un sous-domaine encore en HTTP ne se retrouve pas fermé du jour au lendemain.
    ...(o.https ? { 'strict-transport-security': 'max-age=31536000' } : {}),
  }
}
