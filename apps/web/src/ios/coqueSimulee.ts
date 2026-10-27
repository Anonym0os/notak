/**
 * En développement seulement : une coque iOS imitée dans le navigateur, pour essayer le parcours « se connecter à un
 * serveur » sans construire l'app. `?coque=ios` l'allume pour l'onglet (elle se retient pour la séance, d'une page à
 * l'autre du même site). La page se croit alors dans l'app d'un iPhone (`__NOTAK_PLATEFORME__`, `__TAURI_INTERNALS__`),
 * et ce que la vraie coque fait en Rust (`apps/bureau/src-tauri/src/acces.rs`) se fait ici à gros traits :
 *
 * - les réglages (le serveur retenu, où s'ouvre Notak) dans le `localStorage` de la page embarquée ;
 * - `joindre_serveur` relit l'adresse, frappe à `/api/sante` (sans pouvoir lire la réponse d'un autre site), puis
 *   envoie l'onglet sur le serveur en lui disant d'où il vient (`?coque=ios&depuis=…`), pour qu'il sache revenir ;
 * - `revenir_ici` ramène l'onglet sur la page embarquée, à l'écran demandé (`?ici`, `?acces`).
 *
 * Rien de cela n'est construit pour la production : `main.tsx` ne l'appelle que sous `import.meta.env.DEV`.
 */

const CLE_SEANCE = 'notak:coque-simulee'
const CLE_DEPUIS = 'notak:coque-simulee:depuis'
const CLE_ACCES = 'notak:coque-simulee:acces'

interface Reglages {
  ouvrir: 'local' | 'serveur'
  serveur: string | null
}

type Fenetre = Window & { __TAURI_INTERNALS__?: unknown; __NOTAK_PLATEFORME__?: string }

const lire = (stockage: Storage, cle: string): string | null => {
  try {
    return stockage.getItem(cle)
  } catch {
    return null
  }
}
const ecrire = (stockage: Storage, cle: string, valeur: string | null): void => {
  try {
    if (valeur === null) stockage.removeItem(cle)
    else stockage.setItem(cle, valeur)
  } catch {
    // Sans stockage, la coque imitée ne retient rien : c'est un outil d'essai.
  }
}

function lireReglages(): Reglages {
  try {
    const r = JSON.parse(lire(localStorage, CLE_ACCES) ?? '') as Partial<Reglages>
    const serveur = typeof r.serveur === 'string' ? r.serveur : null
    return { ouvrir: r.ouvrir === 'serveur' && serveur ? 'serveur' : 'local', serveur }
  } catch {
    return { ouvrir: 'local', serveur: null }
  }
}
const poserReglages = (r: Reglages) => ecrire(localStorage, CLE_ACCES, JSON.stringify(r))

/** Ce cet ordinateur : `localhost`, `127.0.0.1`, où un serveur d'essai parle HTTP. */
const local = (hote: string) => hote === 'localhost' || hote === '127.0.0.1' || hote.endsWith('.localhost')

/**
 * L'origine d'un serveur, d'après ce qu'on a tapé, comme `acces::normaliser` : `https` par défaut, HTTP pour cet
 * ordinateur ; ni identifiants, ni chemin, ni paramètres. `null` : une adresse refusée, et pourquoi.
 */
export function normaliserAdresse(adresse: string): { origine: string } | { code: 'adresse_invalide' | 'https_requis' | 'chemin' } {
  const net = adresse.trim()
  if (!net || net.length > 2048 || /\s/.test(net)) return { code: 'adresse_invalide' }
  let u: URL
  try {
    u = new URL(net.includes('://') ? net : `https://${net}`)
    if (!net.includes('://') && local(u.hostname)) u = new URL(`http://${net}`)
  } catch {
    return { code: 'adresse_invalide' }
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { code: 'adresse_invalide' }
  if (u.username || u.password || !u.hostname) return { code: 'adresse_invalide' }
  if (u.protocol === 'http:' && !local(u.hostname)) return { code: 'https_requis' }
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return { code: 'chemin' }
  return { origine: u.origin }
}

/** La page d'un serveur, d'après d'où l'onglet est parti : elle a une page embarquée où revenir. */
const depuis = (): string | null => lire(sessionStorage, CLE_DEPUIS)

function revenir(ecran: 'local' | 'acces', fenetre: Window): void {
  const racine = depuis() ?? fenetre.location.origin
  fenetre.location.assign(`${racine}/?${ecran === 'local' ? 'ici' : 'acces'}`)
}

async function joindre(adresse: string, garder: boolean, fenetre: Window): Promise<unknown> {
  const lu = normaliserAdresse(adresse)
  if ('code' in lu) throw lu
  if (lu.origine === fenetre.location.origin) throw { code: 'adresse_invalide' }
  try {
    // Un autre site : la réponse ne se lit pas, mais un serveur éteint fait échouer la requête.
    await fetch(`${lu.origine}/api/sante`, { mode: 'no-cors', cache: 'no-store' })
  } catch {
    throw { code: 'injoignable' }
  }
  if (garder) poserReglages({ ouvrir: 'serveur', serveur: lu.origine })
  fenetre.location.assign(`${lu.origine}/?coque=ios&depuis=${encodeURIComponent(fenetre.location.origin)}`)
  return { origine: lu.origine, nom: null, version: 'simulée' }
}

/** Ce que répond la coque imitée à chaque commande ; ce qu'elle ne connaît pas, elle le refuse comme la vraie. */
async function invoquer(commande: string, args: Record<string, unknown> | undefined, fenetre: Window): Promise<unknown> {
  const surServeur = depuis() !== null
  switch (commande) {
    case 'acces': {
      if (surServeur) return { ouvrir: 'serveur', serveur: fenetre.location.origin, majAuto: false, version: '0.0.0-simulee' }
      return { ...lireReglages(), majAuto: false, version: '0.0.0-simulee' }
    }
    case 'joindre_serveur':
      return joindre(String(args?.adresse ?? ''), args?.garder === true, fenetre)
    case 'revenir_ici':
      return revenir(args?.ecran === 'acces' ? 'acces' : 'local', fenetre)
    case 'annuler_jonction':
      return false
    case 'regler_ouverture': {
      const r = lireReglages()
      poserReglages({ ...r, ouvrir: args?.ouvrir === 'serveur' && r.serveur ? 'serveur' : 'local' })
      return null
    }
    case 'oublier_serveur':
      // La vraie coque efface aussi les cookies du serveur ; un onglet ne le peut pas pour un autre site.
      poserReglages({ ouvrir: 'local', serveur: null })
      return null
    case 'ouvrir_dans_le_navigateur':
      fenetre.open(String(args?.adresse ?? ''), '_blank', 'noopener')
      return null
    case 'plugin:event|listen':
      return 0
    case 'plugin:event|unlisten':
      return null
    case 'plugin:opener|open_url':
      fenetre.open(String(args?.url ?? ''), '_blank', 'noopener')
      return null
  }
  // Le plugin `appareil` (le thème de la vue, le clavier, un retour haptique) : sans effet dans un onglet.
  if (commande.startsWith('plugin:appareil|')) return null
  throw { code: 'interdit' }
}

/** Allume la coque imitée si l'adresse le demande (`?coque=ios`), ou si l'onglet l'a déjà allumée. */
export function simulerCoqueSiDemandee(fenetre: Fenetre = window): boolean {
  const params = new URLSearchParams(fenetre.location.search)
  if (params.get('coque') === 'ios') ecrire(sessionStorage, CLE_SEANCE, 'ios')
  if (lire(sessionStorage, CLE_SEANCE) !== 'ios') return false
  const venu = params.get('depuis')
  if (venu) {
    const lu = normaliserAdresse(venu)
    if ('origine' in lu) ecrire(sessionStorage, CLE_DEPUIS, lu.origine)
  }
  if (params.has('coque') || params.has('depuis')) {
    const u = new URL(fenetre.location.href)
    u.searchParams.delete('coque')
    u.searchParams.delete('depuis')
    fenetre.history.replaceState(fenetre.history.state, '', u)
  }
  let rappels = 0
  fenetre.__NOTAK_PLATEFORME__ = 'ios'
  fenetre.__TAURI_INTERNALS__ = {
    invoke: (commande: string, args?: Record<string, unknown>) => invoquer(commande, args, fenetre),
    transformCallback: () => ++rappels,
    unregisterCallback: () => {},
  }
  return true
}
