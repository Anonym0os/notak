import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Compte, type Monde, monde } from './essai.ts'
import { chercherImages, oublierRecherches } from './images.ts'

const photo = (id: number) => ({
  id,
  width: 4000,
  height: 3000,
  photographer: 'Ana Lys',
  photographer_url: 'https://www.pexels.com/@ana',
  url: `https://www.pexels.com/photo/${id}/`,
  src: { medium: `https://images.pexels.com/${id}/m.jpg`, large2x: `https://images.pexels.com/${id}/g.jpg` },
})
const reponse = (photos: unknown[], total = 99) => new Response(JSON.stringify({ photos, total_results: total }), { status: 200 })

let m: Monde
let ana: Compte
beforeAll(async () => {
  m = monde()
  ana = await m.compte('Ana')
})
afterAll(() => m.fermer())
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  oublierRecherches()
})

describe('GET /api/images/recherche', () => {
  it('exige une session', async () => {
    expect((await m.appeler('/api/images/recherche?q=mer')).status).toBe(401)
  })

  it('sans clé, répond 503 avec un code que le panneau reconnaît', async () => {
    vi.stubEnv('PEXELS_API_KEY', '')
    const fetchFactice = vi.fn()
    vi.stubGlobal('fetch', fetchFactice)
    const r = await m.appeler('/api/images/recherche?q=mer', { compte: ana })
    expect(r.status).toBe(503)
    expect(((await r.json()) as { code: string }).code).toBe('images_non_configurees')
    expect(fetchFactice).not.toHaveBeenCalled()
  })

  it('cherche chez Pexels avec la clé, et rend des résultats à plat', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'cle-secrete')
    const fetchFactice = vi.fn(async () => reponse([photo(7), { id: 8 }]))
    vi.stubGlobal('fetch', fetchFactice)
    const r = await m.appeler('/api/images/recherche?q=Mer&page=2', { compte: ana })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      resultats: [
        {
          id: 7,
          vignette: 'https://images.pexels.com/7/m.jpg',
          grande: 'https://images.pexels.com/7/g.jpg',
          largeur: 4000,
          hauteur: 3000,
          auteur: 'Ana Lys',
          lienAuteur: 'https://www.pexels.com/@ana',
          lienPhoto: 'https://www.pexels.com/photo/7/',
        },
      ],
      total: 99,
    })
    const [adresse, options] = fetchFactice.mock.calls[0] as unknown as [URL, RequestInit]
    expect(adresse.origin + adresse.pathname).toBe('https://api.pexels.com/v1/search')
    expect(adresse.searchParams.get('query')).toBe('mer')
    expect(adresse.searchParams.get('page')).toBe('2')
    expect((options.headers as Record<string, string>).Authorization).toBe('cle-secrete')
  })

  it('sans requête, rend la sélection du jour, et garde la réponse en mémoire', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'cle-secrete')
    const fetchFactice = vi.fn(async () => reponse([photo(1)]))
    vi.stubGlobal('fetch', fetchFactice)
    await m.appeler('/api/images/recherche', { compte: ana })
    await m.appeler('/api/images/recherche', { compte: ana })
    expect(fetchFactice).toHaveBeenCalledTimes(1)
    expect(((fetchFactice.mock.calls[0] as unknown as [URL])[0]).pathname).toBe('/v1/curated')
  })

  it('répond 502 quand Pexels refuse', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'cle-secrete')
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 429 }))
    const r = await m.appeler('/api/images/recherche?q=mer', { compte: ana })
    expect(r.status).toBe(502)
    expect(((await r.json()) as { code: string }).code).toBe('images_indisponibles')
  })
})

describe('chercherImages', () => {
  it('borne la requête et la page', async () => {
    const fetchFactice = vi.fn(async () => reponse([]))
    await chercherImages({ cle: 'k', requete: 'x'.repeat(500), page: -4, fetch: fetchFactice as unknown as typeof fetch })
    const adresse = (fetchFactice.mock.calls[0] as unknown as [URL])[0]
    expect(adresse.searchParams.get('query')).toHaveLength(100)
    expect(adresse.searchParams.get('page')).toBe('1')
  })
})
