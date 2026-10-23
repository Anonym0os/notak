import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fauxCaches } from '../src/fauxCaches'
import { lireArrivee } from '../src/recuDuPartage'
import { adressesDuBuild, genererServiceWorker } from './plugin'

const modele = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')

describe('adressesDuBuild', () => {
  it('donne des adresses du site, triées, sans le service worker ni les cartes de sources', () => {
    const d = join('/', 'tmp', 'dist')
    const f = (...p: string[]) => join(d, ...p)
    expect(adressesDuBuild(d, [f('sw.js'), f('index.html'), f('assets', 'a-1.js'), f('assets', 'a-1.js.map'), f('manifest.webmanifest')])).toEqual([
      '/assets/a-1.js',
      '/index.html',
      '/manifest.webmanifest',
    ])
  })
})

describe('genererServiceWorker', () => {
  it('pose la liste (l’accueil à `/`, pas `/index.html`) et la version', () => {
    const sw = genererServiceWorker(modele, ['/assets/a.js', '/index.html'], 'abc123')
    expect(sw).toContain(`const VERSION = 'abc123'`)
    expect(sw).toContain('const PRECACHE = ["/","/assets/a.js"]')
    expect(sw).not.toContain('__VERSION__')
  })
  it('refuse un modèle sans ses marques', () => {
    expect(() => genererServiceWorker('rien', [], 'v')).toThrow()
  })
})

type Ecouteur = (e: Record<string, unknown>) => void

/** Fait tourner le service worker produit dans un monde où l'on joue les événements. */
function lancer(fetchReseau: () => Promise<Response> = () => Promise.reject(new Error('hors ligne'))) {
  const sw = genererServiceWorker(modele, ['/assets/a.js'], 'v1')
  const ecouteurs: Record<string, Ecouteur> = {}
  const self = {
    location: { origin: 'https://notak.test' },
    addEventListener: (nom: string, f: Ecouteur) => (ecouteurs[nom] = f),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  }
  const stockage = fauxCaches()
  new Function('self', 'caches', 'fetch', sw)(self, stockage, fetchReseau)
  /** Joue un événement et rend ce qu'il a attendu (`waitUntil`) ou répondu (`respondWith`). */
  const jouer = async (nom: string, e: Record<string, unknown> = {}) => {
    let reponse: Promise<Response> | undefined
    let attente: Promise<unknown> | undefined
    ecouteurs[nom]!({ ...e, respondWith: (p: Promise<Response>) => (reponse = Promise.resolve(p)), waitUntil: (p: Promise<unknown>) => (attente = p) })
    await attente
    return reponse ? await reponse : undefined
  }
  return { self, stockage, jouer, repondu: async (requete: Request) => jouer('fetch', { request: requete }) }
}

describe('le service worker', () => {
  it('garde les fichiers du build à l’installation', async () => {
    const { self, stockage, jouer } = lancer()
    await jouer('install')
    expect(self.skipWaiting).toHaveBeenCalled()
    const cache = await stockage.open('notak-v1')
    expect(await cache.match('/')).toBeDefined()
    expect(await cache.match('/assets/a.js')).toBeDefined()
  })

  it('à l’activation, supprime les anciennes versions et garde les partages en attente', async () => {
    const { self, stockage, jouer } = lancer()
    await stockage.open('notak-v0')
    await stockage.open('notak-v1')
    await stockage.open('notak-partage')
    await stockage.open('autre-chose')
    await jouer('activate')
    expect(stockage.noms().sort()).toEqual(['autre-chose', 'notak-partage', 'notak-v1'])
    expect(self.clients.claim).toHaveBeenCalled()
  })

  it('laisse passer les données, les autres sites et les écritures', async () => {
    const { jouer } = lancer()
    for (const requete of [
      new Request('https://notak.test/api/fichiers/x'),
      new Request('https://notak.test/sync/abc'),
      new Request('https://ailleurs.test/a.js'),
      new Request('https://notak.test/api/tableaux', { method: 'POST', body: '{}' }),
    ]) {
      expect(await jouer('fetch', { request: requete })).toBeUndefined()
    }
  })

  it('sans réseau, une page s’ouvre sur l’accueil gardé ; avec, c’est le serveur qui répond', async () => {
    const hors = lancer()
    await hors.jouer('install')
    const navigation = { url: 'https://notak.test/t/abcdefgh', method: 'GET', mode: 'navigate' }
    const r = await hors.jouer('fetch', { request: navigation })
    expect(await r!.text()).toBe('copie de /')

    const enLigne = lancer(async () => new Response('du serveur'))
    expect(await (await enLigne.jouer('fetch', { request: navigation }))!.text()).toBe('du serveur')
  })

  it('sert un fichier du build depuis la copie, sinon au réseau', async () => {
    const { jouer } = lancer(async () => new Response('au réseau'))
    await jouer('install')
    const garde = await jouer('fetch', { request: new Request('https://notak.test/assets/a.js') })
    expect(await garde!.text()).toBe('copie de /assets/a.js')
    const autre = await jouer('fetch', { request: new Request('https://notak.test/assets/b.js') })
    expect(await autre!.text()).toBe('au réseau')
  })

  it('reçoit un partage : le range, puis renvoie la page qui le prendra', async () => {
    const { stockage, repondu } = lancer()
    const form = new FormData()
    form.set('titre', 'Une page')
    form.set('texte', 'https://exemple.fr/p')
    form.set('adresse', '')
    form.append('images', new File(['pixels'], 'été.png', { type: 'image/png' }))
    const r = await repondu(new Request('https://notak.test/partage', { method: 'POST', body: form }))
    expect(r!.status).toBe(303)
    const ou = new URL(r!.headers.get('location')!)
    expect(ou.pathname).toBe('/partage')
    const recherche = ou.search
    expect(recherche).toMatch(/^\?recu=[0-9a-f-]{36}$/)

    // Et la page le retrouve tel quel.
    const arrivee = await lireArrivee(recherche, stockage)
    expect(arrivee).toMatchObject({ titre: 'Une page', texte: 'https://exemple.fr/p' })
    expect(arrivee?.adresse).toBeUndefined()
    expect(arrivee?.fichiers).toHaveLength(1)
    expect(arrivee!.fichiers![0]).toMatchObject({ name: 'été.png', type: 'image/png' })
    expect(await arrivee!.fichiers![0]!.text()).toBe('pixels')
  })

  it('un partage illisible renvoie à l’accueil', async () => {
    const { repondu } = lancer()
    const r = await repondu(new Request('https://notak.test/partage', { method: 'POST', body: 'pas un formulaire', headers: { 'content-type': 'text/plain' } }))
    expect(r!.status).toBe(303)
    expect(new URL(r!.headers.get('location')!).pathname).toBe('/')
  })
})
