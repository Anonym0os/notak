import type { Arrivee } from '@notak/tableau'

/** Là où le service worker a rangé ce qu'on a partagé vers Notak (voir `pwa/service-worker.js`). */
export const CACHE_PARTAGE = 'notak-partage'

const ID_PARTAGE = /^[0-9a-f-]{36}$/
const cleDe = (id: string) => `/partage-recu/${id}`

/** Ce qu'on demande au `CacheStorage` du navigateur : de quoi lire et effacer, pour que les essais le remplacent. */
interface CacheLu {
  match(requete: string): Promise<Response | undefined>
  keys(): Promise<readonly Request[]>
  delete(requete: Request): Promise<boolean>
}
type Caches = { open(nom: string): Promise<CacheLu> }

const lireTexte = (p: URLSearchParams, cle: string) => p.get(cle)?.slice(0, 20_000) || undefined

/** Un partage arrivé par l'adresse (`/partage?titre=…&texte=…&adresse=…`), sans le service worker. `null` s'il est vide. */
export function arriveeDepuisParametres(p: URLSearchParams): Arrivee | null {
  const titre = lireTexte(p, 'titre')
  const texte = lireTexte(p, 'texte')
  const adresse = lireTexte(p, 'adresse')
  if (!titre && !texte && !adresse) return null
  return { ...(titre ? { titre } : {}), ...(texte ? { texte } : {}), ...(adresse ? { adresse } : {}) }
}

/** Le numéro du partage que le service worker vient de ranger, s'il y en a un dans l'adresse. */
export function numeroDuPartage(recherche: string): string | null {
  const id = new URLSearchParams(recherche).get('recu')
  return id && ID_PARTAGE.test(id) ? id : null
}

/**
 * Ce qu'on a partagé : le partage rangé par le service worker (texte et images), ou à défaut celui de l'adresse.
 * `null` : rien à poser.
 */
export async function lireArrivee(recherche: string, stockage: Caches | undefined = globalThis.caches): Promise<Arrivee | null> {
  const id = numeroDuPartage(recherche)
  if (!id) return arriveeDepuisParametres(new URLSearchParams(recherche))
  if (!stockage) return null
  const cache = await stockage.open(CACHE_PARTAGE)
  const reponse = await cache.match(cleDe(id))
  if (!reponse) return null
  const recu = (await reponse.json().catch(() => null)) as { titre?: unknown; texte?: unknown; adresse?: unknown; fichiers?: unknown } | null
  if (!recu) return null
  const texte = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const fichiers: File[] = []
  for (const cle of Array.isArray(recu.fichiers) ? recu.fichiers : []) {
    if (typeof cle !== 'string' || !cle.startsWith(cleDe(id) + '/')) continue
    const r = await cache.match(cle)
    if (!r) continue
    const type = r.headers.get('content-type') ?? ''
    const nom = decodeURIComponent(r.headers.get('x-nom') ?? '') || 'image'
    fichiers.push(new File([await r.blob()], nom, { type }))
  }
  const [titre, corps, adresse] = [texte(recu.titre), texte(recu.texte), texte(recu.adresse)]
  return { ...(titre ? { titre } : {}), ...(corps ? { texte: corps } : {}), ...(adresse ? { adresse } : {}), ...(fichiers.length ? { fichiers } : {}) }
}

/** Efface le partage rangé : une fois posé dans les non triés, ou abandonné. */
export async function oublierArrivee(recherche: string, stockage: Caches | undefined = globalThis.caches): Promise<void> {
  const id = numeroDuPartage(recherche)
  if (!id || !stockage) return
  const cache = await stockage.open(CACHE_PARTAGE)
  for (const requete of await cache.keys()) {
    if (new URL(requete.url).pathname.startsWith(cleDe(id))) await cache.delete(requete)
  }
}
