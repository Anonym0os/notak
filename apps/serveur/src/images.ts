/** La banque d'images : une recherche dans Pexels, faite par le serveur pour que la clé ne parte jamais au navigateur. */

const POINT_CURATED = 'https://api.pexels.com/v1/curated'
const POINT_SEARCH = 'https://api.pexels.com/v1/search'
export const PAR_PAGE = 20
const REQUETE_MAX = 100
const PAGE_MAX = 50
const CACHE_MAX = 200
const CACHE_DUREE_MS = 10 * 60_000
const DELAI_MS = 10_000

export interface ImageBanque {
  id: number
  /** Une petite copie, pour la vignette. */
  vignette: string
  /** La copie qu'on rapatrie sur la toile. */
  grande: string
  largeur: number
  hauteur: number
  auteur: string
  lienAuteur: string
  lienPhoto: string
}

export interface ResultatsBanque {
  resultats: ImageBanque[]
  total: number
}

/** Pourquoi la recherche ne répond pas : `non_configuree` (pas de clé) ou `indisponible` (Pexels refuse ou ne répond pas). */
export class ErreurBanque extends Error {
  declare readonly code: 'non_configuree' | 'indisponible'
  constructor(code: 'non_configuree' | 'indisponible') {
    super(code)
    Object.defineProperty(this, 'code', { value: code })
  }
}

interface PhotoPexels {
  id?: unknown
  width?: unknown
  height?: unknown
  photographer?: unknown
  photographer_url?: unknown
  url?: unknown
  src?: Record<string, unknown>
}

const texte = (v: unknown) => (typeof v === 'string' ? v : '')
const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Ne garde que des adresses web : le client les met dans un `src` et dans un lien. */
const adresseWeb = (v: unknown) => (/^https:\/\//.test(texte(v)) ? texte(v) : '')

function enImage(p: PhotoPexels): ImageBanque | null {
  const src = p.src ?? {}
  const vignette = adresseWeb(src.medium) || adresseWeb(src.small)
  const grande = adresseWeb(src.large2x) || adresseWeb(src.large) || adresseWeb(src.original)
  if (!nombre(p.id) || !vignette || !grande) return null
  return {
    id: nombre(p.id),
    vignette,
    grande,
    largeur: nombre(p.width),
    hauteur: nombre(p.height),
    auteur: texte(p.photographer),
    lienAuteur: adresseWeb(p.photographer_url),
    lienPhoto: adresseWeb(p.url),
  }
}

const cache = new Map<string, { jusqua: number; valeur: ResultatsBanque }>()

/** Vide la mémoire des recherches (pour les essais). */
export const oublierRecherches = () => cache.clear()

export interface OptionsRecherche {
  cle: string | undefined
  requete: string
  page: number
  fetch?: typeof fetch
  maintenant?: () => number
}

/** Une requête vide donne la sélection du jour (`curated`), sinon la recherche. */
export async function chercherImages({ cle, requete, page, fetch: appeler = fetch, maintenant = Date.now }: OptionsRecherche): Promise<ResultatsBanque> {
  if (!cle) throw new ErreurBanque('non_configuree')
  const q = requete.trim().slice(0, REQUETE_MAX).toLowerCase()
  const p = Math.min(PAGE_MAX, Math.max(1, Math.floor(page) || 1))
  const clef = `${q}\u0000${p}`
  const garde = cache.get(clef)
  if (garde && garde.jusqua > maintenant()) return garde.valeur

  const adresse = new URL(q ? POINT_SEARCH : POINT_CURATED)
  if (q) adresse.searchParams.set('query', q)
  adresse.searchParams.set('per_page', String(PAR_PAGE))
  adresse.searchParams.set('page', String(p))

  let corps: { photos?: PhotoPexels[]; total_results?: unknown }
  try {
    const reponse = await appeler(adresse, { headers: { Authorization: cle }, signal: AbortSignal.timeout(DELAI_MS) })
    if (!reponse.ok) throw new ErreurBanque('indisponible')
    corps = (await reponse.json()) as typeof corps
  } catch {
    throw new ErreurBanque('indisponible')
  }
  const resultats = (Array.isArray(corps.photos) ? corps.photos : []).flatMap((ph) => enImage(ph) ?? [])
  const valeur = { resultats, total: nombre(corps.total_results) || resultats.length }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(clef, { jusqua: maintenant() + CACHE_DUREE_MS, valeur })
  return valeur
}
