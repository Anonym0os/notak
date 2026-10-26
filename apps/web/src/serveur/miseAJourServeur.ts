/**
 * La nouvelle version du serveur, dite à ses admins (`GET /api/instance/mise-a-jour`) : c'est à eux de tirer la
 * nouvelle image, personne d'autre n'a rien à faire. Tout ce que le serveur écrit ici (version, notes, adresse) vient
 * du réseau : relu avec méfiance, et montré en texte, jamais en HTML.
 */

/** La commande pour un serveur installé avec le `compose.yaml` du dépôt. */
export const COMMANDE_MISE_A_JOUR = 'docker compose pull && docker compose up -d'

const VERSION_MAX = 64
/** Des notes de version sont une page de texte : au-delà, la page ralentirait sans rien apprendre de plus. */
const NOTES_MAX = 4000
const CLE_ECARTEE = 'notak:serveur:maj-ecartee'
/** Une page de bibliothèque ou de toile rouverte ne redemande pas : le serveur ne regarde lui-même que de loin en loin. */
const VALIDITE_MS = 30 * 60_000

export interface VersionDisponible {
  version: string
  /** La version que fait tourner ce serveur. */
  actuelle: string
  notes: string | null
  /** Où lire les nouveautés : une adresse https, ou rien. */
  adresse: string | null
}

const chaine = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.slice(0, max) : null)

/** Une adresse qu'on peut offrir en lien : du web sécurisé, sans identifiants. Le reste n'est pas un lien. */
export function adresseSure(brut: unknown): string | null {
  const texte = chaine(brut, 2048)
  if (!texte) return null
  try {
    const u = new URL(texte)
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null
  } catch {
    return null
  }
}

/** Ce que le serveur dit d'une version plus récente, relu ; `null` s'il n'y en a pas, ou si ce n'est pas lisible. */
export function lireDisponible(brut: unknown): VersionDisponible | null {
  const lu = brut as { actuelle?: unknown; nouvelle?: { version?: unknown; notes?: unknown; adresse?: unknown } | null } | null
  const version = chaine(lu?.nouvelle?.version, VERSION_MAX)
  const actuelle = chaine(lu?.actuelle, VERSION_MAX)
  if (!version || !actuelle) return null
  return { version, actuelle, notes: chaine(lu!.nouvelle!.notes, NOTES_MAX), adresse: adresseSure(lu!.nouvelle!.adresse) }
}

let memoire: { quand: number; valeur: VersionDisponible | null } | null = null

/** Pour les essais : oublie la dernière réponse. */
export const oublierMiseAJourServeur = () => {
  memoire = null
}

/** Demande au serveur s'il y a une version plus récente ; sans réponse, ou sans droit, il n'y en a pas pour la page. */
export async function lireMiseAJourServeur(maintenant = Date.now()): Promise<VersionDisponible | null> {
  if (memoire && maintenant - memoire.quand < VALIDITE_MS) return memoire.valeur
  try {
    const r = await fetch('/api/instance/mise-a-jour', { cache: 'no-store', credentials: 'same-origin' })
    if (!r.ok) return null
    const valeur = lireDisponible(await r.json())
    memoire = { quand: maintenant, valeur }
    return valeur
  } catch {
    return null
  }
}

/** La version dont l'admin a dit « plus tard » : le bandeau se tait pour elle, pas pour la suivante. */
export function versionEcartee(): string | null {
  try {
    return localStorage.getItem(CLE_ECARTEE)
  } catch {
    return null
  }
}

export function ecarterVersion(version: string): void {
  try {
    localStorage.setItem(CLE_ECARTEE, version)
  } catch {
    // Sans stockage, le bandeau se tait le temps de cette page.
  }
}
