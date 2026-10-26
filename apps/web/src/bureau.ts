/**
 * Dans l'application de bureau (la coque Tauri, `apps/bureau`), la fenêtre n'a pas de barre de titre : ses trois
 * boutons se posent dans la première rangée de l'en-tête, comme chez Milanote. La racine du document le dit
 * (`data-bureau`), et dit aussi le plein écran (`data-plein-ecran`), où ces boutons disparaissent et rendent leur place.
 *
 * La page parle à la coque par ses commandes (`apps/bureau/src-tauri/src/lib.rs`), enveloppées ici. Deux pages y ont
 * droit : l'édition locale embarquée, et les pages du serveur Notak que la personne a choisi dans l'app
 * (`estPageServeur`) ; certaines commandes (choisir un serveur, régler la coque) ne servent que la première.
 *
 * Ce fichier est chargé avant tout le reste (`main.tsx`) : il ne tire rien d'autre, ni la toile ni les textes.
 */

interface Tauri {
  invoke<T>(commande: string, arguments_?: unknown, options?: { headers?: Record<string, string> }): Promise<T>
  transformCallback?(rappel: (message: unknown) => void, unique?: boolean): number
  unregisterCallback?(id: number): void
}

interface AvecEvenements {
  __TAURI_EVENT_PLUGIN_INTERNALS__?: { unregisterListener(evenement: string, id: number): void }
}

/** La coque, si l'on tourne dedans. */
export const coque = (fenetre: Window = window): Tauri | null => (fenetre as unknown as { __TAURI_INTERNALS__?: Tauri }).__TAURI_INTERNALS__ ?? null

export const estBureau = (fenetre: Window = window): boolean => coque(fenetre) !== null

/** Une commande de la coque (`apps/bureau/src-tauri/src/lib.rs`) ; hors de l'app de bureau, une erreur. */
export function invoquer<T>(commande: string, arguments_?: unknown, options?: { headers?: Record<string, string> }): Promise<T> {
  const c = coque()
  return c ? c.invoke<T>(commande, arguments_, options) : Promise.reject(new Error('hors de l’application de bureau'))
}

/**
 * La page d'un serveur Notak, ouverte dans l'app de bureau : une adresse web qui n'est pas celle de l'app embarquée
 * (`tauri.localhost` sous Windows). L'édition locale ne l'est jamais, même servie par Vite en développement.
 */
export function estPageServeur(fenetre: Window = window): boolean {
  if (import.meta.env.VITE_EDITION === 'locale' || !estBureau(fenetre)) return false
  const { protocol, hostname } = fenetre.location
  return (protocol === 'https:' || protocol === 'http:') && hostname !== 'tauri.localhost' && !hostname.endsWith('.tauri.localhost')
}

/** Où s'ouvre Notak : les toiles de cet ordinateur, ou le serveur retenu. */
export type Ouvrir = 'local' | 'serveur'

/** Les réglages de la coque (`acces::EtatAcces`). Sur la page d'un serveur, `serveur` est le sien. */
export interface Acces {
  ouvrir: Ouvrir
  serveur: string | null
  majAuto: boolean
  version: string
}

/** Ce qui empêche de joindre un serveur (`appel::Erreur`). `redirige` : il se dit ailleurs, à `vers`, qu'on propose. */
export type CodeErreurAcces = 'adresse_invalide' | 'https_requis' | 'chemin' | 'injoignable' | 'certificat' | 'delai' | 'pas_notak' | 'trop_ancien' | 'redirige'
export type ErreurAcces = { code: Exclude<CodeErreurAcces, 'redirige'> } | { code: 'redirige'; vers: string }

/**
 * Les autres refus de la coque : une sorte de fichier qu'elle n'ouvre pas (`type_refuse`), trop de fichiers ouverts
 * coup sur coup (`trop_vite`), une page qu'elle ne sert pas (`interdit`)…
 */
export type ErreurCoque =
  | ErreurAcces
  | { code: 'type_refuse' | 'trop_gros' | 'trop_vite' | 'introuvable' | 'illisible' | 'interdit' | 'annule' }
  | { code: 'echec'; message: string }

const CODES = new Set([
  'adresse_invalide',
  'https_requis',
  'chemin',
  'injoignable',
  'certificat',
  'delai',
  'pas_notak',
  'trop_ancien',
  'redirige',
  'type_refuse',
  'trop_gros',
  'trop_vite',
  'introuvable',
  'illisible',
  'interdit',
  'annule',
  'echec',
])
const CODES_ACCES = new Set(['adresse_invalide', 'https_requis', 'chemin', 'injoignable', 'certificat', 'delai', 'pas_notak', 'trop_ancien', 'redirige'])

/** Une erreur rendue par la coque (et pas une panne de la page). */
export function estErreurCoque(e: unknown): e is ErreurCoque {
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'string' && CODES.has(code) && (code !== 'redirige' || typeof (e as { vers?: unknown }).vers === 'string')
}

export const estErreurAcces = (e: unknown): e is ErreurAcces => estErreurCoque(e) && CODES_ACCES.has(e.code)

/** Un serveur joint : son origine, son nom s'il en a un, sa version. */
export interface ServeurJoint {
  origine: string
  nom: string | null
  version: string
}

/** Une copie `.notak` ouverte depuis le système, qui attend la page. */
export interface FichierOuvert {
  id: string
  nom: string
  taille: number
  /** Les toiles de cet ordinateur confiées au serveur (`confierCopie`), et non un fichier du disque. */
  confiee: boolean
}

/** L'événement de la coque quand un fichier ouvert rejoint la file. */
export const FICHIER_OUVERT = 'notak://fichier-ouvert'

/**
 * Des octets venus de la coque. Par son canal, ils arrivent en `ArrayBuffer` ; mais quand la page est passée par
 * `postMessage` (une CSP qui bloque ce canal, une webview qui le refuse), en tableau de nombres.
 */
export function octetsDe(reponse: unknown): Uint8Array {
  if (reponse instanceof Uint8Array) return reponse
  if (reponse instanceof ArrayBuffer || Object.prototype.toString.call(reponse) === '[object ArrayBuffer]') return new Uint8Array(reponse as ArrayBuffer)
  if (ArrayBuffer.isView(reponse)) return new Uint8Array(reponse.buffer, reponse.byteOffset, reponse.byteLength)
  if (Array.isArray(reponse) && reponse.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return Uint8Array.from(reponse as number[])
  throw new Error('octets attendus')
}

/** Le nom d'un fichier, tel que la coque le lit (`x-notak-nom`) : un en-tête ne porte que de l'ASCII. */
const avecNom = (nom: string) => ({ headers: { 'x-notak-nom': encodeURIComponent(nom) } })

/** Les réglages de la coque ; depuis la page d'un serveur, c'est aussi son signe de vie. */
export const acces = () => invoquer<Acces>('acces')

/** Vérifie l'adresse, puis y envoie la fenêtre (page embarquée seulement). `garder` : Notak s'y ouvrira désormais. */
export const joindreServeur = (adresse: string, garder: boolean) => invoquer<ServeurJoint>('joindre_serveur', { adresse, garder })

/** Revient aux toiles de cet ordinateur (et Notak s'y ouvrira), ou à l'écran d'accès (`?acces`), sans rien régler. */
export const revenirIci = (ecran: 'local' | 'acces') => invoquer<void>('revenir_ici', { ecran })

/** Oublie le serveur retenu et sa session (page embarquée seulement). */
export const oublierServeur = () => invoquer<void>('oublier_serveur')

/** La recherche automatique des mises à jour (page embarquée seulement). */
export const reglerMajAuto = (actif: boolean) => invoquer<void>('regler_maj_auto', { actif })

/** Ouvre ces octets dans l'application du système ; une sorte qui pourrait s'exécuter est refusée (`type_refuse`). */
export const ouvrirFichier = (octets: Uint8Array, nom: string) => invoquer<void>('ouvrir_fichier', octets, avecNom(nom))

/**
 * Les copies `.notak` ouvertes depuis le système (un double clic, « Ouvrir avec »…), qui attendent la page ; à lire au
 * chargement, puis à chaque `FICHIER_OUVERT`. La page d'un serveur y trouve aussi la copie que la page embarquée lui a
 * confiée (`confierCopie`), que celle-ci ne voit pas.
 */
export const fichiersOuverts = () => invoquer<FichierOuvert[]>('fichiers_ouverts')

/** Les octets d'une copie qui attend, par morceaux ; une fois lue, elle quitte la file. */
export async function lireFichierOuvert(id: string): Promise<Uint8Array> {
  const fichier = (await fichiersOuverts()).find((f) => f.id === id)
  if (!fichier) throw { code: 'introuvable' } satisfies ErreurCoque
  const octets = new Uint8Array(fichier.taille)
  let debut = 0
  for (;;) {
    const morceau = octetsDe(await invoquer<unknown>('lire_fichier_ouvert', { id, debut }))
    if (debut + morceau.length > fichier.taille) throw { code: 'illisible' } satisfies ErreurCoque
    octets.set(morceau, debut)
    debut += morceau.length
    if (debut >= fichier.taille) return octets
    // Raccourci depuis son arrivée : une copie à moitié lue ne vaut rien.
    if (morceau.length === 0) throw { code: 'illisible' } satisfies ErreurCoque
  }
}

/**
 * Confie une copie `.notak` à la coque, pour la page du serveur qu'on va joindre (page embarquée seulement). Elle
 * remplace celle d'avant ; aucun événement : la page du serveur la trouvera dans `fichiersOuverts` en arrivant.
 */
/** Retire un fichier qui attend, sans le lire (« Pas maintenant »). */
export const ecarterFichierOuvert = (id: string) => invoquer<void>('ecarter_fichier_ouvert', { id })

/** Renonce à la jonction en cours : elle finit sur `annule`, sans emmener la fenêtre (page embarquée seulement). */
export const annulerJonction = () => invoquer<void>('annuler_jonction')

export const confierCopie = (octets: Uint8Array, nom: string) => invoquer<void>('confier_copie', octets, avecNom(nom))

/** Écoute un événement de la coque ; rend de quoi cesser. */
export async function ecouter(evenement: string, rappel: (charge: unknown) => void, fenetre: Window = window): Promise<() => void> {
  const c = coque(fenetre)
  if (!c?.transformCallback) throw new Error('hors de l’application de bureau')
  const poignee = c.transformCallback((message) => rappel((message as { payload?: unknown } | null)?.payload))
  let id: number
  try {
    id = await c.invoke<number>('plugin:event|listen', { event: evenement, target: { kind: 'Any' }, handler: poignee })
  } catch (e) {
    c.unregisterCallback?.(poignee)
    throw e
  }
  let fini = false
  return () => {
    if (fini) return
    fini = true
    ;(fenetre as unknown as AvecEvenements).__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener(evenement, id)
    void c.invoke('plugin:event|unlisten', { event: evenement, eventId: id }).catch(() => {})
  }
}

/** La même application : même protocole, même hôte (`URL.origin` vaut « null » pour `tauri://localhost`). */
const ici = (u: URL, fenetre: Window) => u.protocol === fenetre.location.protocol && u.host === fenetre.location.host

/** Une adresse dont la page peut lire les octets : un `blob:` ou une adresse de la page, ou des `data:`. */
function adresseLisible(adresse: string, fenetre: Window): URL | null {
  let u: URL
  try {
    u = new URL(adresse, fenetre.location.href)
  } catch {
    return null
  }
  if (u.protocol === 'data:') return u
  if (u.protocol === 'blob:') {
    try {
      return ici(new URL(u.pathname), fenetre) ? u : null
    } catch {
      return null
    }
  }
  return ici(u, fenetre) ? u : null
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

/** Le nom d'un fichier : celui qu'on donne, sinon la fin de l'adresse ; et l'extension de sa sorte s'il n'en a pas. */
export function nomDeFichier(nom: string | undefined, adresse: URL, type: string | null): string {
  let n = nom?.trim() ?? ''
  if (!n && adresse.protocol !== 'blob:' && adresse.protocol !== 'data:') {
    const fin = adresse.pathname.split('/').pop() ?? ''
    try {
      n = decodeURIComponent(fin)
    } catch {
      n = fin
    }
  }
  n = n.trim() || 'fichier'
  const extension = EXTENSIONS[(type ?? '').toLowerCase().split(';')[0]!.trim()]
  return extension && !/\.[\w-]{1,16}$/.test(n) ? `${n}.${extension}` : n
}

/** « Enregistrer sous » de la coque, pour des octets qu'on a déjà ; `false` si la personne a renoncé. */
export async function enregistrerSous(octets: Uint8Array, nom: string): Promise<boolean> {
  const point = nom.lastIndexOf('.')
  const extension = point > 0 ? nom.slice(point + 1).toLowerCase() : ''
  const choisi = await invoquer<string | null>('choisir_emplacement', { nom, extension, description: extension ? extension.toUpperCase() : nom })
  if (!choisi) return false
  await invoquer('ecrire_fichier', octets)
  return true
}

async function octetsA(u: URL): Promise<{ octets: Uint8Array; type: string | null }> {
  const r = await fetch(u.href)
  if (!r.ok) throw new Error(`le fichier ne s’est pas lu (${r.status})`)
  return { octets: new Uint8Array(await r.arrayBuffer()), type: r.headers.get('content-type') }
}

/**
 * Ouvre un fichier de la page (un `blob:`, une adresse de la page) ailleurs qu'ici : dans l'application que le système
 * lui associe. Une sorte que la coque n'ouvre pas ainsi (un SVG, une page HTML, une archive…) se propose à
 * l'enregistrement. Une adresse d'un autre site est refusée : la page n'a pas à lire ses octets.
 */
export async function ouvrirAilleurs(adresse: string, nom?: string, fenetre: Window = window): Promise<'ouvert' | 'enregistre' | 'annule'> {
  const u = adresseLisible(adresse, fenetre)
  if (!u) throw new Error('adresse refusée')
  const { octets, type } = await octetsA(u)
  const retenu = nomDeFichier(nom, u, type)
  try {
    await ouvrirFichier(octets, retenu)
    return 'ouvert'
  } catch (e) {
    if (!estErreurCoque(e) || e.code !== 'type_refuse') throw e
    return (await enregistrerSous(octets, retenu)) ? 'enregistre' : 'annule'
  }
}

export function marquerBureau(fenetre: Window = window): void {
  if (!estBureau(fenetre)) return
  const racine = fenetre.document.documentElement
  racine.dataset.bureau = ''
  const pleinEcran = () =>
    racine.toggleAttribute('data-plein-ecran', fenetre.innerWidth >= fenetre.screen.width && fenetre.innerHeight >= fenetre.screen.height)
  pleinEcran()
  fenetre.addEventListener('resize', pleinEcran)
  garderLesLiens(fenetre)
  // La page d'un serveur se signale dès qu'elle tourne : sans cela, la coque la croit muette et ramène la fenêtre
  // à l'écran d'accès (`acces.rs`).
  if (estPageServeur(fenetre)) void acces().catch(() => {})
}

/** Les adresses qu'un lien peut ouvrir hors de Notak : le web, un courriel, un numéro. */
const VERS_DEHORS = new Set(['https:', 'http:', 'mailto:', 'tel:'])

/**
 * Un lien vers un autre site, cliqué dans la page, s'ouvre dans le navigateur de la personne. Sans cela, la fenêtre de
 * Notak partirait sur ce site, sans bouton pour revenir. La coque le fait pour toute nouvelle fenêtre (`target="_blank"`,
 * `window.open`) et refuse toute autre navigation (`navigation.rs`) : on fait donc passer chaque lien par là.
 * Un lien de l'application (même protocole, même hôte) se suit sur place ; un téléchargement (`download`) de la page
 * passe par « Enregistrer sous », la webview ne téléchargeant rien d'elle-même. Un lien dans un texte en cours
 * d'écriture ne s'ouvre pas au clic, comme dans un navigateur ; un lien d'une autre sorte (`javascript:`, `file:`…) ne
 * s'ouvre pas du tout.
 */
export function garderLesLiens(fenetre: Window = window): void {
  fenetre.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return
    const lien = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!lien || lien.closest('[contenteditable=""], [contenteditable="true"]')) return
    let adresse: URL
    try {
      adresse = new URL(lien.getAttribute('href') ?? '', fenetre.location.href)
    } catch {
      return e.preventDefault()
    }
    if (lien.hasAttribute('download')) {
      const lisible = adresseLisible(adresse.href, fenetre)
      if (lisible) {
        e.preventDefault()
        void telechargerIci(lisible, lien.getAttribute('download') || undefined)
        return
      }
    }
    if (ici(adresse, fenetre)) return
    e.preventDefault()
    if (VERS_DEHORS.has(adresse.protocol)) fenetre.open(adresse.href, '_blank', 'noopener')
  })
}

async function telechargerIci(u: URL, nom: string | undefined): Promise<void> {
  try {
    const { octets, type } = await octetsA(u)
    await enregistrerSous(octets, nomDeFichier(nom, u, type))
  } catch (e) {
    console.warn('Notak : téléchargement impossible', e)
  }
}
