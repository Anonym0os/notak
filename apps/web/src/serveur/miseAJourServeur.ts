/**
 * La nouvelle version du serveur, dite à ses admins (`GET /api/instance/mise-a-jour`) : c'est à eux de tirer la
 * nouvelle image, personne d'autre n'a rien à faire. Tout ce que le serveur écrit ici (version, notes, adresse) vient
 * du réseau : relu avec méfiance, et montré en texte, jamais en HTML.
 */

/**
 * La commande pour un serveur installé avec l'image publiée et le `compose.yaml` (le cas courant), la même que dans le
 * journal du serveur (`apps/serveur/src/misesAJour.ts`) : le `compose.yaml` de la version d'abord (il porte la version
 * d'OpenFGA), puis l'image.
 */
export const COMMANDE_MISE_A_JOUR = 'curl -fsSLO https://github.com/Anonym0os/notak/releases/latest/download/compose.yaml && docker compose pull && docker compose up -d'
/**
 * Pour les autres installations (version tenue par `NOTAK_VERSION`, depuis les sources, Coolify, sans Docker), que cette
 * commande ne met pas à jour : la section « Mettre à jour » du guide, la même que dans le journal du serveur.
 */
export const GUIDE_MISE_A_JOUR = 'https://github.com/Anonym0os/notak/blob/main/docs/AUTO-HEBERGER.md#mettre-à-jour'

const VERSION_MAX = 64
/** Des notes de version sont une page de texte : au-delà, la page ralentirait sans rien apprendre de plus. */
const NOTES_MAX = 4000
const CLE_ECARTEE = 'notak:serveur:maj-ecartee'
/** « Plus tard » : le bandeau se tait pour sept jours (ou jusqu'à une autre version), puis revient. */
const RAPPEL_MS = 7 * 24 * 3600_000
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

/** La version dont l'admin a dit « plus tard », tant que le rappel n'est pas venu : le bandeau se tait pour elle, pas pour la suivante. */
export function versionEcartee(maintenant = Date.now()): string | null {
  try {
    const brut = localStorage.getItem(CLE_ECARTEE)
    const lu = brut ? (JSON.parse(brut) as { version?: unknown; jusqu?: unknown } | null) : null
    return typeof lu?.version === 'string' && typeof lu.jusqu === 'number' && maintenant < lu.jusqu ? lu.version : null
  } catch {
    return null
  }
}

export function ecarterVersion(version: string, maintenant = Date.now()): void {
  try {
    localStorage.setItem(CLE_ECARTEE, JSON.stringify({ version, jusqu: maintenant + RAPPEL_MS }))
  } catch {
    // Sans stockage, le bandeau se tait le temps de cette page.
  }
}

/** Les notes lues comme du Markdown simple : des paragraphes, et des puces groupées en listes. Du texte, jamais du HTML. */
export type BlocNotes = { type: 'texte'; texte: string } | { type: 'liste'; puces: string[] }

/** Un passage sans les marques du Markdown (`**gras**`, `code`, `[texte](adresse)`) : le texte seul. */
const sansMarques = (texte: string) =>
  texte
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')

/**
 * Ce que dit `latest.json` (les notes de `docs/NOUVEAUTES.md`) : « - » ouvre une puce, qu'une ligne en retrait continue ;
 * une ligne vide sépare les paragraphes. Les marques s'effacent ; rien n'est interprété au-delà.
 */
export function lireNotes(brut: string): BlocNotes[] {
  const elements: { puce: boolean; texte: string }[] = []
  let courant: { puce: boolean; texte: string } | null = null
  for (const ligne of brut.split(/\r?\n/)) {
    if (!ligne.trim()) {
      courant = null
      continue
    }
    const puce = /^\s*[-*+](?:\s+(.*))?$/.exec(ligne)
    if (puce) {
      courant = { puce: true, texte: (puce[1] ?? '').trim() }
      elements.push(courant)
    } else if (courant && (!courant.puce || /^\s/.test(ligne))) {
      courant.texte += ` ${ligne.trim()}`
    } else {
      courant = { puce: false, texte: ligne.replace(/^\s*#{1,6}\s+/, '').trim() }
      elements.push(courant)
    }
  }
  const blocs: BlocNotes[] = []
  for (const e of elements) {
    const texte = sansMarques(e.texte).trim()
    if (!texte) continue
    const dernier = blocs.at(-1)
    if (!e.puce) blocs.push({ type: 'texte', texte })
    else if (dernier?.type === 'liste') dernier.puces.push(texte)
    else blocs.push({ type: 'liste', puces: [texte] })
  }
  return blocs
}
