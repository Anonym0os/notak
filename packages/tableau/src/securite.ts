// Ce fichier est lu par le serveur sans la toile (Node, sans bundler) : il ne tire rien.

/**
 * Ce que Notak a le droit de joindre, écrit une seule fois. La politique de sécurité du contenu (CSP) de notak.app
 * (`apps/site/csp.conf`), de l'app de bureau (`apps/bureau/src-tauri/tauri.conf.json`) et des pages de l'édition
 * serveur (`apps/serveur/src/app.ts`) en découle ; un essai vérifie que chacune la porte telle quelle.
 *
 * C'est le navigateur qui la fait respecter, quoi que fasse le code de la page (le nôtre, une dépendance, un document
 * reçu) : aucun script ne vient d'ailleurs, et aucune requête de données (`fetch`, WebSocket) ne part ailleurs que
 * vers soi et le géocodeur. Restent, par nature, les images posées par leur adresse et les lecteurs intégrés (une
 * vidéo, une carte) : ils se chargent chez leur hôte, comme dans n'importe quelle page. La liste complète de ce qui
 * peut sortir de l'appareil est dans `docs/PUBLIER.md`.
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
 * - les fontes aussi : celles d'un habillage (docs/HABILLAGES.md) se donnent par une adresse `https:` ;
 * - les styles en ligne restent permis : l'éditeur et la toile en posent ; les scripts, jamais ;
 * - `frame-ancestors 'none'` : aucune page d'un autre site ne peut afficher Notak dans un cadre pour faire cliquer
 *   dessus à l'insu de la personne.
 */
export function politiqueContenu(cible: Cible, origineServeur?: string): string {
  const connexions = ["'self'", 'blob:', 'data:', ...ORIGINES_REQUETES]
  // La coque parle à la page par son propre protocole : `ipc:` sur macOS et Linux, `http://ipc.localhost` sous Windows.
  // Les pages d'un serveur aussi : ouvertes dans l'app de bureau, elles parlent à la coque. Sans cela, Tauri se
  // rabattrait sur `postMessage` pour toute la vie de la page, et chaque octet passerait en tableau de nombres.
  // Dans un navigateur, ces adresses ne mènent nulle part : rien n'y répond.
  if (cible === 'bureau' || cible === 'serveur') connexions.push('ipc:', 'http://ipc.localhost')
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
    ['font-src', "'self'", 'data:', 'https:'],
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

/** Les sortes de fichiers qu'une adresse `blob:` montre telles quelles : rien là-dedans ne s'exécute. */
const MONTRES_TELS_QUELS = /^(image\/(png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|heic|heif|tiff|svg\+xml)|application\/pdf|audio\/[\w.+-]+|video\/[\w.+-]+)$/

/**
 * La sorte sous laquelle l'édition locale montre un fichier gardé sur l'appareil (`apps/web/src/local/fichiers.ts`).
 * Une adresse `blob:` appartient à l'origine de Notak : un fichier qui se dirait `text/html` s'y ouvrirait comme une
 * page de Notak, avec les toiles à portée de main. Or la sorte d'un fichier vient de qui l'a fabriqué (une copie
 * .notak reçue, une carte Xmind, un fichier déposé). Seules les images, les PDF, les sons et les vidéos gardent la
 * leur ; un texte, quel qu'il soit, se montre en texte brut ; le reste se télécharge au lieu de s'ouvrir.
 * (Un SVG garde la sienne pour s'afficher en image ; la CSP, dont hérite l'adresse, y refuse tout script.)
 */
export function typeAffichable(type: string): string {
  const t = type.toLowerCase().split(';')[0]!.trim()
  if (MONTRES_TELS_QUELS.test(t)) return t
  if (t.startsWith('text/')) return 'text/plain;charset=utf-8'
  return 'application/octet-stream'
}
