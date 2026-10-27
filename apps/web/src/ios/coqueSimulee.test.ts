// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normaliserAdresse, simulerCoqueSiDemandee } from './coqueSimulee'

type Fenetre = Window & { __TAURI_INTERNALS__?: { invoke(c: string, a?: unknown): Promise<unknown> }; __NOTAK_PLATEFORME__?: string }

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  vi.unstubAllGlobals()
})

/** Une fenêtre à cette adresse, dont on suit les départs (`location.assign`). */
function fenetre(href: string) {
  const assign = vi.fn()
  const replaceState = vi.fn()
  const f = { location: { ...new URL(href), href, search: new URL(href).search, origin: new URL(href).origin, assign }, history: { state: null, replaceState }, open: vi.fn() }
  return { f: f as unknown as Fenetre, assign, replaceState }
}

describe('lire une adresse de serveur, comme la coque', () => {
  it('https par défaut, HTTP pour cet ordinateur, l’origine seule', () => {
    expect(normaliserAdresse('notak.exemple.fr')).toEqual({ origine: 'https://notak.exemple.fr' })
    expect(normaliserAdresse(' https://notak.exemple.fr/ ')).toEqual({ origine: 'https://notak.exemple.fr' })
    expect(normaliserAdresse('localhost:3022')).toEqual({ origine: 'http://localhost:3022' })
  })

  it('refuse ce que la coque refuse, avec le même code', () => {
    expect(normaliserAdresse('')).toEqual({ code: 'adresse_invalide' })
    expect(normaliserAdresse('http://notak.exemple.fr')).toEqual({ code: 'https_requis' })
    expect(normaliserAdresse('https://notak.exemple.fr/notak')).toEqual({ code: 'chemin' })
    expect(normaliserAdresse('https://moi:secret@notak.exemple.fr')).toEqual({ code: 'adresse_invalide' })
    expect(normaliserAdresse('ftp://notak.exemple.fr')).toEqual({ code: 'adresse_invalide' })
  })
})

describe('la coque iOS imitée, en développement', () => {
  it('ne s’allume que si l’adresse le demande, puis tient la séance', () => {
    expect(simulerCoqueSiDemandee(fenetre('http://localhost:3023/').f)).toBe(false)
    const { f, replaceState } = fenetre('http://localhost:3023/toiles?coque=ios')
    expect(simulerCoqueSiDemandee(f)).toBe(true)
    expect(f.__NOTAK_PLATEFORME__).toBe('ios')
    expect(f.__TAURI_INTERNALS__).toBeDefined()
    // La marque quitte l'adresse ; la séance s'en souvient.
    expect(String(replaceState.mock.calls[0]![2])).toBe('http://localhost:3023/toiles')
    expect(simulerCoqueSiDemandee(fenetre('http://localhost:3023/t/abc').f)).toBe(true)
  })

  it('joint un serveur : retient son adresse, puis y envoie l’onglet en disant d’où il vient', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null)))
    const { f, assign } = fenetre('http://localhost:3023/toiles?coque=ios')
    simulerCoqueSiDemandee(f)
    const coque = f.__TAURI_INTERNALS__!
    await expect(coque.invoke('joindre_serveur', { adresse: 'localhost:3022', garder: true })).resolves.toMatchObject({ origine: 'http://localhost:3022' })
    expect(assign).toHaveBeenCalledWith('http://localhost:3022/?coque=ios&depuis=http%3A%2F%2Flocalhost%3A3023')
    await expect(coque.invoke('acces')).resolves.toMatchObject({ ouvrir: 'serveur', serveur: 'http://localhost:3022' })
    await coque.invoke('oublier_serveur')
    await expect(coque.invoke('acces')).resolves.toMatchObject({ ouvrir: 'local', serveur: null })
  })

  it('un serveur éteint, une adresse refusée ou la page elle-même : un refus, et l’onglet reste', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const { f, assign } = fenetre('http://localhost:3023/?coque=ios')
    simulerCoqueSiDemandee(f)
    const coque = f.__TAURI_INTERNALS__!
    await expect(coque.invoke('joindre_serveur', { adresse: 'localhost:3022', garder: true })).rejects.toEqual({ code: 'injoignable' })
    await expect(coque.invoke('joindre_serveur', { adresse: 'http://notak.exemple.fr', garder: true })).rejects.toEqual({ code: 'https_requis' })
    await expect(coque.invoke('joindre_serveur', { adresse: 'localhost:3023', garder: true })).rejects.toEqual({ code: 'adresse_invalide' })
    expect(assign).not.toHaveBeenCalled()
    await expect(coque.invoke('acces')).resolves.toMatchObject({ serveur: null })
  })

  it('sur la page du serveur, se dit sur ce serveur et sait revenir à la page embarquée', async () => {
    const { f, assign } = fenetre('http://localhost:3022/?coque=ios&depuis=http%3A%2F%2Flocalhost%3A3023')
    simulerCoqueSiDemandee(f)
    const coque = f.__TAURI_INTERNALS__!
    await expect(coque.invoke('acces')).resolves.toMatchObject({ ouvrir: 'serveur', serveur: 'http://localhost:3022' })
    await coque.invoke('revenir_ici', { ecran: 'local' })
    expect(assign).toHaveBeenLastCalledWith('http://localhost:3023/?ici')
    await coque.invoke('revenir_ici', { ecran: 'acces' })
    expect(assign).toHaveBeenLastCalledWith('http://localhost:3023/?acces')
  })

  it('le plugin de l’appareil ne fait rien, et une commande inconnue est refusée comme par la vraie coque', async () => {
    const { f } = fenetre('http://localhost:3023/?coque=ios')
    simulerCoqueSiDemandee(f)
    const coque = f.__TAURI_INTERNALS__!
    await expect(coque.invoke('plugin:appareil|infos')).resolves.toBeNull()
    await expect(coque.invoke('ecrire_fichier')).rejects.toEqual({ code: 'interdit' })
  })
})
