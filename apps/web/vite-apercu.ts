import type { Plugin } from 'vite'
import { lireApercu } from '../../packages/tableau/src/elements/lien/lireApercu'

const DELAI_MS = 8_000
const OCTETS_MAX = 1_500_000
const REDIRECTIONS_MAX = 4

/** Les hôtes qu'un serveur de développement n'a pas à aller lire : lui-même et le réseau local. */
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
    h.startsWith('fe80:')
  )
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

async function telecharger(adresse: string, signal: AbortSignal): Promise<{ html: string; url: string }> {
  let courante = adresse
  for (let i = 0; i <= REDIRECTIONS_MAX; i++) {
    const u = new URL(courante)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || hoteInterdit(u.hostname)) throw new Error('interdit')
    const r = await fetch(u, {
      signal,
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; NotakApercu/0.1)', accept: 'text/html,application/xhtml+xml' },
    })
    const suite = r.headers.get('location')
    if (r.status >= 300 && r.status < 400 && suite) {
      courante = new URL(suite, u).href
      continue
    }
    if (!r.ok) throw new Error(`http ${r.status}`)
    return { html: await lireCorps(r), url: courante }
  }
  throw new Error('trop de redirections')
}

/** Sert `GET /api/apercu?url=…` en développement : lit une page web et rend son aperçu en JSON. */
export function apercuWeb(): Plugin {
  return {
    name: 'notak-apercu',
    configureServer(serveur) {
      serveur.middlewares.use('/api/apercu', (requete, reponse) => {
        // Sans @types/node dans le dépôt, on ne type que ce dont on se sert.
        const req = requete as unknown as { url?: string; method?: string }
        const res = reponse as unknown as {
          statusCode: number
          setHeader(nom: string, valeur: string): void
          end(corps: string): void
        }
        const json = (statut: number, corps: unknown) => {
          res.statusCode = statut
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(corps))
        }
        const demande = new URL(req.url ?? '', 'http://local').searchParams.get('url')
        if (req.method !== 'GET' || !demande) return json(400, { erreur: 'url manquante' })
        const controle = new AbortController()
        const minuteur = setTimeout(() => controle.abort(), DELAI_MS)
        telecharger(demande, controle.signal)
          .then(({ html, url }) => json(200, lireApercu(html, url)))
          .catch(() => json(502, { erreur: 'aperçu indisponible' }))
          .finally(() => clearTimeout(minuteur))
      })
    },
  }
}
