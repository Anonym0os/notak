import { lookup } from 'node:dns/promises'
import type { Apercu, CauseEchec } from '../../../packages/tableau/src/coeur/tableau.ts'
import { lireApercu } from '../../../packages/tableau/src/elements/lien/lireApercu.ts'

const DELAI_MS = 8_000
const OCTETS_MAX = 1_500_000
const REDIRECTIONS_MAX = 4

/** Les hôtes que le serveur n'a pas à aller lire : lui-même et le réseau local. */
export function hoteInterdit(hote: string): boolean {
  const h = hote.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '::1' ||
    h === '::' ||
    /^(127|10|0)\./.test(h) ||
    h.startsWith('192.168.') ||
    h.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    h.startsWith('fe80:') ||
    h.startsWith('::ffff:')
  )
}

/** Un échec dont on sait la cause, pour que la carte la dise. */
export class ErreurApercu extends Error {
  constructor(readonly cause: CauseEchec) {
    super(cause)
  }
}

/** La cause d'un statut HTTP d'échec. */
export function causeDuStatut(statut: number): CauseEchec {
  if (statut === 404 || statut === 410) return 'introuvable'
  if (statut === 401 || statut === 403 || statut === 429 || statut === 451) return 'refuse'
  return 'injoignable'
}

async function lireCorps(reponse: Response): Promise<string> {
  const lecteur = reponse.body?.getReader()
  if (!lecteur) return ''
  const morceaux: Uint8Array[] = []
  let total = 0
  while (total < OCTETS_MAX) {
    const { done, value } = await lecteur.read()
    if (done) break
    morceaux.push(value)
    total += value.length
  }
  void lecteur.cancel().catch(() => {})
  const tout = new Uint8Array(total)
  let pos = 0
  for (const m of morceaux) {
    tout.set(m, pos)
    pos += m.length
  }
  return new TextDecoder('utf-8').decode(tout.subarray(0, OCTETS_MAX))
}

/** Un nom d'hôte qui se résout vers une adresse locale est refusé ; un nom qui ne se résout pas est injoignable. */
async function verifierHote(u: URL): Promise<void> {
  if (hoteInterdit(u.hostname)) throw new ErreurApercu('interdit')
  let adresses: { address: string }[]
  try {
    adresses = await lookup(u.hostname, { all: true })
  } catch {
    throw new ErreurApercu('injoignable')
  }
  if (adresses.length === 0) throw new ErreurApercu('injoignable')
  if (adresses.some((a) => hoteInterdit(a.address))) throw new ErreurApercu('interdit')
}

/**
 * Suit les redirections, en vérifiant chaque hôte, et rend la réponse finale (corps non lu).
 * `accepte` : l'en-tête `Accept` envoyé.
 */
export async function ouvrir(adresse: string, signal: AbortSignal, accepte: string): Promise<{ reponse: Response; url: string }> {
  let courante = adresse
  for (let i = 0; i <= REDIRECTIONS_MAX; i++) {
    let u: URL
    try {
      u = new URL(courante)
    } catch {
      throw new ErreurApercu('illisible')
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ErreurApercu('interdit')
    await verifierHote(u)
    let r: Response
    try {
      r = await fetch(u, { signal, redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; NotakApercu/0.1)', accept: accepte } })
    } catch {
      throw new ErreurApercu(signal.aborted ? 'delai' : 'injoignable')
    }
    const suite = r.headers.get('location')
    if (r.status >= 300 && r.status < 400 && suite) {
      void r.body?.cancel().catch(() => {})
      courante = new URL(suite, u).href
      continue
    }
    if (!r.ok) {
      void r.body?.cancel().catch(() => {})
      throw new ErreurApercu(causeDuStatut(r.status))
    }
    return { reponse: r, url: courante }
  }
  throw new ErreurApercu('injoignable')
}

/** Lance `travail` avec un signal qui coupe au bout du délai ; un dépassement devient `delai`. */
export async function sousDelai<T>(travail: (signal: AbortSignal) => Promise<T>, delai = DELAI_MS): Promise<T> {
  const controle = new AbortController()
  const minuteur = setTimeout(() => controle.abort(), delai)
  try {
    return await travail(controle.signal)
  } catch (e) {
    if (e instanceof ErreurApercu) throw e
    throw new ErreurApercu(controle.signal.aborted ? 'delai' : 'illisible')
  } finally {
    clearTimeout(minuteur)
  }
}

/**
 * Lit une page web et rend son aperçu. Une adresse qui mène à une image rend `estImage`.
 * Lève une `ErreurApercu` si la page est interdite, introuvable, illisible ou trop lente.
 */
export async function apercuDePage(adresse: string): Promise<Apercu> {
  return sousDelai(async (signal) => {
    const { reponse, url } = await ouvrir(adresse, signal, 'text/html,application/xhtml+xml,image/*;q=0.8')
    const type = (reponse.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (type.startsWith('image/')) {
      void reponse.body?.cancel().catch(() => {})
      return { estImage: true, image: url }
    }
    return lireApercu(await lireCorps(reponse), url)
  })
}

/** Les images qu'on accepte de rapatrier : celles que la toile sait montrer. */
export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif']

/**
 * Va chercher une image sur le web pour la ranger avec les fichiers du tableau : elle ne dépendra plus du site
 * qui la sert. Lève une `ErreurApercu` (`illisible` : ce n'est pas une image, ou elle est trop grosse).
 */
export async function rapatrierImage(adresse: string, octetsMax: number): Promise<{ octets: Buffer; type: string }> {
  return sousDelai(async (signal) => {
    const { reponse } = await ouvrir(adresse, signal, 'image/*')
    const type = (reponse.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const annonce = Number(reponse.headers.get('content-length') ?? 0)
    if (!TYPES_IMAGE.includes(type) || annonce > octetsMax) {
      void reponse.body?.cancel().catch(() => {})
      throw new ErreurApercu('illisible')
    }
    const lecteur = reponse.body?.getReader()
    if (!lecteur) throw new ErreurApercu('illisible')
    const morceaux: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      total += value.length
      if (total > octetsMax) {
        void lecteur.cancel().catch(() => {})
        throw new ErreurApercu('illisible')
      }
      morceaux.push(value)
    }
    if (total === 0) throw new ErreurApercu('illisible')
    return { octets: Buffer.concat(morceaux), type }
  }, DELAI_MS * 2)
}
