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
 * D'où vient un partage : du système (le service worker l'a rangé après un `POST`, `?recu=`), ou de l'adresse seule
 * (`?titre=&texte=&adresse=`), que n'importe quel lien peut fabriquer. Le second n'est posé qu'avec l'accord de la personne.
 */
export type Origine = 'systeme' | 'adresse'

export const origineDuPartage = (recherche: string): Origine => (numeroDuPartage(recherche) ? 'systeme' : 'adresse')

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

/** Ce que la page montre d'un partage avant de le poser : chaque champ en texte brut, sur une ligne et borné. */
export interface ApercuArrivee {
  titre?: string
  texte?: string
  adresse?: string
}

const LONGUEUR_TITRE = 160
const LONGUEUR_EXTRAIT = 400
const LONGUEUR_ADRESSE = 300
// Les marques de sens d'écriture : posées dans une adresse, elles en réordonnent l'affichage et la font passer pour une autre.
const MARQUES_DE_SENS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

function court(valeur: string | undefined, max: number): string | undefined {
  const ligne = valeur?.replace(MARQUES_DE_SENS, '').replace(/\s+/g, ' ').trim()
  if (!ligne) return undefined
  return ligne.length > max ? `${ligne.slice(0, max).trimEnd()}…` : ligne
}

/** L'aperçu d'un partage reçu par l'adresse : le titre, un extrait du texte, l'adresse, tels qu'ils seraient posés. */
export function apercuDeLArrivee(a: Arrivee): ApercuArrivee {
  const [titre, texte, adresse] = [court(a.titre, LONGUEUR_TITRE), court(a.texte, LONGUEUR_EXTRAIT), court(a.adresse, LONGUEUR_ADRESSE)]
  return { ...(titre ? { titre } : {}), ...(texte ? { texte } : {}), ...(adresse ? { adresse } : {}) }
}
